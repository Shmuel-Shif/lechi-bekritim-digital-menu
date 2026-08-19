/**
 * LECHAIM — Place reservation requests (customer form + admin approve/arrive/cancel).
 * Isolated from food orders / sessions / admin seat-hold `reservations` table.
 *
 * Capacity (enforced on create via RPC): CAPACITY_SEATS=60, AVG_SIT_MINUTES=75.
 * Customer slots: half-hour 14:00–21:00 (restaurant closes 22:00).
 * Capacity holds: pending + confirmed + arrived (cancelled does not hold).
 * Admin meter "תפוסה מאושרת": confirmed + arrived only.
 */
(function (global) {
  'use strict';

  const TABLE = 'place_reservation_requests';
  const CAPACITY_SEATS = 60;
  const AVG_SIT_MINUTES = 75;
  const Hours = () => global.LechaimOpeningHours || null;
  const OPEN_HOUR = Hours()?.OPEN_HOUR ?? 14;
  const LAST_SLOT_HOUR = Hours()?.PLACE_RES_LAST_SLOT_HOUR ?? 21;
  const LAST_SLOT_MINUTE = Hours()?.PLACE_RES_LAST_SLOT_MINUTE ?? 0;
  const SLOT_STEP_MINUTES = 30;

  let client = null;

  function getConfig() {
    return global.LECHAIM_SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    const { url, anonKey } = getConfig();
    return Boolean(url && anonKey && global.supabase?.createClient);
  }

  function getClient() {
    if (client) return client;
    if (!isConfigured()) {
      throw new Error('[LechaimPlaceReservations] Supabase is not configured');
    }
    try {
      const shared = global.LechaimInventory?.getClient?.();
      if (shared) {
        client = shared;
        return client;
      }
    } catch (_) { /* ignore */ }

    const { url, anonKey } = getConfig();
    client = global.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: global.localStorage,
      },
    });
    return client;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function buildArrivalSlots() {
    const slots = [];
    const openMinutes = OPEN_HOUR * 60;
    const lastMinutes = LAST_SLOT_HOUR * 60 + LAST_SLOT_MINUTE;
    for (let m = openMinutes; m <= lastMinutes; m += SLOT_STEP_MINUTES) {
      slots.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
    }
    return slots;
  }

  function isValidArrivalTime(value) {
    return buildArrivalSlots().includes(String(value || '').trim());
  }

  function normalizeDateStr(value) {
    const s = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  }

  function parseYmdLocal(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  /** Restaurant closed Fri–Sat — no place reservations those days. */
  function isPlaceResWeekend(ymd) {
    const d = parseYmdLocal(ymd);
    if (!d || Number.isNaN(d.getTime())) return false;
    if (typeof Hours()?.isWeekendClosed === 'function') {
      return Hours().isWeekendClosed(d);
    }
    const day = d.getDay();
    return day === 5 || day === 6;
  }

  function nextOpenPlaceResDate(fromYmd) {
    const start = parseYmdLocal(fromYmd) || new Date();
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (let i = 0; i < 8; i += 1) {
      const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      if (!isPlaceResWeekend(ymd)) return ymd;
      d.setDate(d.getDate() + 1);
    }
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function timeToMinutes(value) {
    const s = String(value || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function minutesToTime(mins) {
    return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
  }

  function windowsOverlap(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
  }

  /**
   * Occupied seats overlapping a candidate window on a given date.
   * @param {Array<{arrival_time:string, party_size:number}>} occupancyRows
   * @param {string} arrivalTime HH:MM
   * @param {string} [excludeId]
   */
  function occupiedSeatsForWindow(occupancyRows, arrivalTime, excludeId) {
    const start = timeToMinutes(arrivalTime);
    if (start == null) return CAPACITY_SEATS;
    const end = start + AVG_SIT_MINUTES;
    let sum = 0;
    (occupancyRows || []).forEach((row) => {
      if (excludeId && row.id && String(row.id) === String(excludeId)) return;
      const existingStart = timeToMinutes(row.arrival_time);
      if (existingStart == null) return;
      const existingEnd = existingStart + AVG_SIT_MINUTES;
      if (windowsOverlap(start, end, existingStart, existingEnd)) {
        sum += Math.floor(Number(row.party_size)) || 0;
      }
    });
    return sum;
  }

  /**
   * Peak concurrent occupancy for a day (confirmed + arrived rows).
   */
  function peakOccupancy(occupancyRows) {
    const rows = occupancyRows || [];
    if (!rows.length) return 0;
    const events = [];
    rows.forEach((row) => {
      const start = timeToMinutes(row.arrival_time);
      if (start == null) return;
      const size = Math.floor(Number(row.party_size)) || 0;
      events.push({ t: start, d: size });
      events.push({ t: start + AVG_SIT_MINUTES, d: -size });
    });
    events.sort((a, b) => (a.t - b.t) || (a.d - b.d));
    let cur = 0;
    let peak = 0;
    events.forEach((e) => {
      cur += e.d;
      if (cur > peak) peak = cur;
    });
    return peak;
  }

  /**
   * Holding occupancy for a date (pending + confirmed + arrived).
   * Used for slot locking and create/confirm capacity checks.
   */
  async function getOccupancyForDate(dateStr) {
    const sb = getClient();
    const day = normalizeDateStr(dateStr);
    if (!day) throw new Error('תאריך לא תקין');

    const { data, error } = await sb.rpc('get_place_reservation_occupancy', {
      p_date: day,
    });

    if (error) throw new Error(error.message || 'טעינת תפוסה נכשלה');
    return (data || []).map((row) => {
      const mins = timeToMinutes(row.arrival_time);
      return {
        id: row.id || null,
        arrival_time: mins == null ? String(row.arrival_time || '') : minutesToTime(mins),
        party_size: Math.floor(Number(row.party_size)) || 0,
        status: String(row.status || ''),
      };
    });
  }

  /**
   * Which slots are unavailable for a given party size on a date.
   * Counts pending + confirmed + arrived (soft holds).
   */
  async function getUnavailableSlots(dateStr, partySize) {
    if (isPlaceResWeekend(dateStr)) return buildArrivalSlots().slice();
    const sizeRaw = Math.floor(Number(partySize));
    const size = Number.isFinite(sizeRaw) && sizeRaw >= 1 ? sizeRaw : 1;
    const occupancy = await getOccupancyForDate(dateStr);
    return buildArrivalSlots().filter((slot) => {
      const occupied = occupiedSeatsForWindow(occupancy, slot);
      return occupied + size > CAPACITY_SEATS;
    });
  }

  function mapCreateError(err) {
    const msg = String(err?.message || err || '');
    if (msg.includes('CAPACITY_EXCEEDED')) {
      const e = new Error('CAPACITY_EXCEEDED');
      e.code = 'CAPACITY_EXCEEDED';
      return e;
    }
    if (msg.includes('TIME_INVALID')) return new Error('נא לבחור שעה בין 14:00 ל־21:00');
    if (msg.includes('PHONE_INVALID')) return new Error('נא להזין טלפון תקין');
    if (msg.includes('PARTY_SIZE_INVALID')) {
      return new Error(`נא להזין מספר סועדים (1–${CAPACITY_SEATS})`);
    }
    if (msg.includes('NAME_REQUIRED')) return new Error('נא להזין שם מלא');
    if (msg.includes('DATE_WEEKEND')) return new Error('לא ניתן להזמין מקום בשישי ובשבת — המסעדה סגורה');
    if (msg.includes('DATE_REQUIRED')) return new Error('נא לבחור תאריך');
    if (msg.includes('TIME_REQUIRED')) return new Error('נא לבחור שעה');
    return new Error(msg || 'שליחת הבקשה נכשלה');
  }

  /**
   * Customer: create a pending place-reservation request (RPC + capacity).
   */
  async function createRequest(payload = {}) {
    const sb = getClient();
    const customer_name = String(payload.customerName ?? payload.customer_name ?? '').trim();
    const customer_phone = String(payload.customerPhone ?? payload.customer_phone ?? '').trim();
    const notesRaw = String(payload.notes ?? '').trim();
    const reservation_date = normalizeDateStr(
      payload.reservationDate ?? payload.reservation_date
    );
    const arrival_time = String(payload.arrivalTime ?? payload.arrival_time ?? '').trim();
    const party_size = Math.floor(Number(payload.partySize ?? payload.party_size));

    if (!customer_name) throw new Error('נא להזין שם מלא');
    if (!customer_phone || customer_phone.replace(/\D/g, '').length < 8) {
      throw new Error('נא להזין טלפון תקין');
    }
    if (!Number.isFinite(party_size) || party_size < 1 || party_size > CAPACITY_SEATS) {
      throw new Error(`נא להזין מספר סועדים (1–${CAPACITY_SEATS})`);
    }
    if (!reservation_date) throw new Error('נא לבחור תאריך');
    if (isPlaceResWeekend(reservation_date)) {
      throw new Error('לא ניתן להזמין מקום בשישי ובשבת — המסעדה סגורה');
    }
    if (!isValidArrivalTime(arrival_time)) {
      throw new Error('נא לבחור שעה בין 14:00 ל־21:00');
    }

    const { data, error } = await sb.rpc('create_place_reservation_request', {
      p_customer_name: customer_name,
      p_customer_phone: customer_phone,
      p_party_size: party_size,
      p_reservation_date: reservation_date,
      p_arrival_time: arrival_time,
      p_notes: notesRaw || null,
    });

    if (error) throw mapCreateError(error);
    return Array.isArray(data) ? data[0] : data;
  }

  /**
   * Admin "כרטיס חדש": same fields as the customer form, saved as confirmed.
   * Allows admin 15-minute slots (not only the public half-hour list).
   */
  async function createConfirmedRequest(payload = {}) {
    const sb = getClient();
    const customer_name = String(payload.customerName ?? payload.customer_name ?? '').trim();
    const customer_phone = String(payload.customerPhone ?? payload.customer_phone ?? '').trim();
    const notesRaw = String(payload.notes ?? '').trim();
    const reservation_date = normalizeDateStr(
      payload.reservationDate ?? payload.reservation_date
    );
    const arrival_time = String(payload.arrivalTime ?? payload.arrival_time ?? '').trim();
    const party_size = Math.floor(Number(payload.partySize ?? payload.party_size));

    if (!customer_name) throw new Error('נא להזין שם מלא');
    if (!customer_phone || customer_phone.replace(/\D/g, '').length < 8) {
      throw new Error('נא להזין טלפון תקין');
    }
    if (!Number.isFinite(party_size) || party_size < 1 || party_size > CAPACITY_SEATS) {
      throw new Error(`נא להזין מספר סועדים (1–${CAPACITY_SEATS})`);
    }
    if (!reservation_date) throw new Error('נא לבחור תאריך');
    if (isPlaceResWeekend(reservation_date)) {
      throw new Error('לא ניתן להזמין מקום בשישי ובשבת — המסעדה סגורה');
    }
    const arrivalNormalized = minutesToTime(timeToMinutes(arrival_time));
    if (!arrivalNormalized) throw new Error('נא לבחור שעה בין 14:00 ל־21:00');

    const occupancy = await getOccupancyForDate(reservation_date);
    const others = occupiedSeatsForWindow(occupancy, arrivalNormalized);
    if (others + party_size > CAPACITY_SEATS) {
      const e = new Error('CAPACITY_EXCEEDED');
      e.code = 'CAPACITY_EXCEEDED';
      throw e;
    }

    const { data, error } = await sb
      .from(TABLE)
      .insert({
        customer_name,
        customer_phone,
        party_size,
        reservation_date,
        arrival_time: arrivalNormalized,
        notes: notesRaw || null,
        status: 'confirmed',
      })
      .select(
        'id, customer_name, customer_phone, party_size, notes, arrival_time, reservation_date, status, created_at'
      )
      .single();

    if (error) throw new Error(error.message || 'יצירת ההזמנה נכשלה');
    return data;
  }

  function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  /**
   * Admin: list requests for a calendar day (all statuses).
   */
  async function listForDate(dateStr) {
    const sb = getClient();
    const day = normalizeDateStr(dateStr);
    if (!day) throw new Error('תאריך לא תקין');

    const { data, error } = await sb
      .from(TABLE)
      .select(
        'id, customer_name, customer_phone, party_size, notes, arrival_time, reservation_date, status, created_at'
      )
      .eq('reservation_date', day)
      .order('arrival_time', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message || 'טעינת בקשות נכשלה');
    return data || [];
  }

  /**
   * Admin: today + future requests that are still active (not cancelled).
   * Sorted by reservation_date, then arrival_time (nearest first).
   */
  async function listUpcomingActive() {
    const sb = getClient();
    const fromDay = todayDateStr();
    const { data, error } = await sb
      .from(TABLE)
      .select(
        'id, customer_name, customer_phone, party_size, notes, arrival_time, reservation_date, status, created_at'
      )
      .gte('reservation_date', fromDay)
      .neq('status', 'cancelled')
      .order('reservation_date', { ascending: true })
      .order('arrival_time', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message || 'טעינת בקשות עתידיות נכשלה');
    return data || [];
  }

  /**
   * Admin: peak confirmed+arrived occupancy for a date (meter "תפוסה מאושרת").
   */
  async function getDailyOccupancy(dateStr) {
    const occupancy = await getOccupancyForDate(dateStr);
    const confirmed = occupancy.filter(
      (row) => row.status === 'confirmed' || row.status === 'arrived'
    );
    return {
      occupied: peakOccupancy(confirmed),
      capacity: CAPACITY_SEATS,
      rows: confirmed,
    };
  }

  /**
   * Admin: can this pending request be confirmed without exceeding capacity?
   * Excludes the request itself (it already holds seats as pending).
   */
  async function canConfirm(request) {
    if (!request) return false;
    const day = normalizeDateStr(request.reservation_date);
    const time = formatTimeForCompare(request.arrival_time);
    const size = Math.floor(Number(request.party_size)) || 0;
    const occupancy = await getOccupancyForDate(day);
    /* Other holds only — this pending row already counts toward capacity */
    const others = occupiedSeatsForWindow(occupancy, time, request.id);
    return others + size <= CAPACITY_SEATS;
  }

  function formatTimeForCompare(value) {
    const mins = timeToMinutes(value);
    return mins == null ? '' : minutesToTime(mins);
  }

  /**
   * Admin: set status to confirmed | arrived | cancelled.
   * Capacity checked when moving to confirmed.
   */
  async function setStatus(id, status) {
    const sb = getClient();
    const next = String(status || '');
    if (next !== 'confirmed' && next !== 'arrived' && next !== 'cancelled') {
      throw new Error('סטטוס לא תקין');
    }
    if (!id) throw new Error('חסר מזהה בקשה');

    if (next === 'confirmed') {
      const { data: current, error: readErr } = await sb
        .from(TABLE)
        .select('id, party_size, arrival_time, reservation_date, status')
        .eq('id', String(id))
        .single();
      if (readErr) throw new Error(readErr.message || 'טעינת הבקשה נכשלה');
      if (current.status !== 'confirmed') {
        const ok = await canConfirm(current);
        if (!ok) {
          const e = new Error('CAPACITY_EXCEEDED');
          e.code = 'CAPACITY_EXCEEDED';
          throw e;
        }
      }
    }

    const { data, error } = await sb
      .from(TABLE)
      .update({ status: next })
      .eq('id', String(id))
      .select('id, status')
      .single();

    if (error) throw new Error(error.message || 'עדכון הסטטוס נכשל');
    return data;
  }

  /**
   * Admin: permanently remove a request from the list.
   */
  async function deleteRequest(id) {
    const sb = getClient();
    if (!id) throw new Error('חסר מזהה בקשה');
    const { error } = await sb.from(TABLE).delete().eq('id', String(id));
    if (error) throw new Error(error.message || 'מחיקת הבקשה נכשלה');
  }

  /**
   * Admin: update request details (not status). Capacity checked when row still holds seats.
   */
  async function updateRequest(id, payload) {
    const sb = getClient();
    if (!id) throw new Error('חסר מזהה בקשה');

    const customer_name = String(payload?.customer_name || '').trim();
    const customer_phone = String(payload?.customer_phone || '').trim();
    const notes = String(payload?.notes || '').trim();
    const reservation_date = normalizeDateStr(payload?.reservation_date);
    const arrival_time = String(payload?.arrival_time || '').trim();
    const party_size = Math.floor(Number(payload?.party_size));

    if (!customer_name) throw new Error('נא להזין שם לקוח');
    if (!customer_phone) throw new Error('נא להזין טלפון');
    if (!reservation_date) throw new Error('תאריך לא תקין');
    if (isPlaceResWeekend(reservation_date)) {
      throw new Error('לא ניתן להזמין מקום בשישי ובשבת — המסעדה סגורה');
    }
    /* Admin may use 15-min slots beyond the public half-hour list */
    if (timeToMinutes(arrival_time) == null) throw new Error('שעת הגעה לא תקינה');
    if (!Number.isFinite(party_size) || party_size < 1 || party_size > CAPACITY_SEATS) {
      throw new Error('מספר סועדים לא תקין');
    }

    const { data: current, error: readErr } = await sb
      .from(TABLE)
      .select('id, status, party_size, arrival_time, reservation_date')
      .eq('id', String(id))
      .single();
    if (readErr) throw new Error(readErr.message || 'טעינת הבקשה נכשלה');

    const status = String(current?.status || '');
    if (status === 'pending' || status === 'confirmed' || status === 'arrived') {
      const occupancy = await getOccupancyForDate(reservation_date);
      const others = occupiedSeatsForWindow(occupancy, arrival_time, String(id));
      if (others + party_size > CAPACITY_SEATS) {
        const e = new Error('CAPACITY_EXCEEDED');
        e.code = 'CAPACITY_EXCEEDED';
        throw e;
      }
    }

    const arrivalNormalized = minutesToTime(timeToMinutes(arrival_time));
    const { data, error } = await sb
      .from(TABLE)
      .update({
        customer_name,
        customer_phone,
        notes: notes || null,
        reservation_date,
        arrival_time: arrivalNormalized,
        party_size,
      })
      .eq('id', String(id))
      .select(
        'id, customer_name, customer_phone, party_size, notes, arrival_time, reservation_date, status, created_at'
      )
      .single();

    if (error) throw new Error(error.message || 'עדכון הבקשה נכשל');
    return data;
  }

  global.LechaimPlaceReservations = {
    isConfigured,
    createRequest,
    createConfirmedRequest,
    listForDate,
    listUpcomingActive,
    setStatus,
    deleteRequest,
    updateRequest,
    getOccupancyForDate,
    getUnavailableSlots,
    getDailyOccupancy,
    canConfirm,
    occupiedSeatsForWindow,
    peakOccupancy,
    buildArrivalSlots,
    isValidArrivalTime,
    isPlaceResWeekend,
    nextOpenPlaceResDate,
    CAPACITY_SEATS,
    AVG_SIT_MINUTES,
    OPEN_HOUR,
    LAST_SLOT_HOUR,
    LAST_SLOT_MINUTE,
  };
})(window);
