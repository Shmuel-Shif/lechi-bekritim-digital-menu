/**
 * LECHAIM — Admin "הזמנות להיום"
 * 1) Manual seat-hold cards (`reservations`)
 * 2) Website place-reservation requests (`place_reservation_requests`)
 */
(function (global) {
  'use strict';

  const gridEl = document.getElementById('reservations-grid');
  const emptyEl = document.getElementById('reservations-empty');
  const requestsGridEl = document.getElementById('place-res-requests-grid');
  const requestsEmptyEl = document.getElementById('place-res-requests-empty');
  const occupancyValueEl = document.getElementById('place-res-occupancy-value');
  const tabBadgeEl = document.getElementById('tab-badge-reservations');
  const newBtn = document.getElementById('reservations-new-btn');
  const dateFilter = document.getElementById('reservations-date-filter');
  const modal = document.getElementById('reservation-modal');
  const backdrop = document.getElementById('reservation-modal-backdrop');
  const form = document.getElementById('reservation-form');
  const idInput = document.getElementById('reservation-id');
  const kindInput = document.getElementById('reservation-kind');
  const nameInput = document.getElementById('reservation-name');
  const phoneInput = document.getElementById('reservation-phone');
  const partyField = document.getElementById('reservation-party-field');
  const partyInput = document.getElementById('reservation-party');
  const notesInput = document.getElementById('reservation-notes');
  const dateInput = document.getElementById('reservation-date');
  const arrivalSelect = document.getElementById('reservation-arrival');
  const formError = document.getElementById('reservation-form-error');
  const cancelBtn = document.getElementById('reservation-cancel-btn');
  const titleEl = document.getElementById('reservation-modal-title');

  let client = null;
  /** Manual seat-hold cards for the selected date */
  let cache = [];
  /** Manual seat-hold cards after the selected date */
  let futureHoldsCache = [];
  /** Website place requests (today+), split in render by selected date */
  let requestsCache = [];
  let viewDate = '';
  let focusTrapRelease = null;
  let pollTimer = null;
  let realtimeChannel = null;
  let active = false;
  const dayTitleEl = document.getElementById('reservations-day-title');

  const STATUS_LABEL = {
    pending: 'ממתין',
    confirmed: 'אושר',
    arrived: 'הגיע',
    cancelled: 'בוטל',
  };

  function getConfig() {
    return global.LECHAIM_SUPABASE_CONFIG || {};
  }

  function getClient() {
    if (client) return client;
    const { url, anonKey } = getConfig();
    if (!url || !anonKey || !global.supabase?.createClient) return null;
    client = global.supabase.createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  function showConfirm(message, yesLabel) {
    if (typeof global.LechaimAdminTables?.showConfirmModal === 'function') {
      return global.LechaimAdminTables.showConfirmModal(message, { yesLabel: yesLabel || 'כן' });
    }
    return Promise.resolve(window.confirm(String(message || '')));
  }

  function showNotice(message) {
    if (typeof global.LechaimAdminTables?.showSuccessModal === 'function') {
      global.LechaimAdminTables.showSuccessModal(message);
      return;
    }
    window.alert(String(message || ''));
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Local calendar date YYYY-MM-DD (restaurant device clock). */
  function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function normalizeDateStr(value) {
    const s = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return todayDateStr();
  }

  /** Display DD.MM.YYYY */
  function formatDateDisplay(value) {
    const s = normalizeDateStr(value);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s;
    return `${m[3]}.${m[2]}.${m[1]}`;
  }

  /** Normalize Postgres time / "HH:MM:SS" → "HH:MM". */
  function formatTime(value) {
    if (!value) return '—';
    const s = String(value);
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s.slice(0, 5);
    return `${pad2(Number(m[1]))}:${m[2]}`;
  }

  /**
   * Convert local / Israeli phone to WhatsApp international digits.
   * 0587701009 → 972587701009
   */
  function toWhatsAppPhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('972')) return digits;
    if (digits.startsWith('0')) return `972${digits.slice(1)}`;
    if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`;
    return digits;
  }

  function buildConfirmedWhatsAppText(record) {
    const name = String(record?.customer_name || '').trim() || 'אורחים';
    const date = formatDateDisplay(record?.reservation_date);
    const time = formatTime(record?.arrival_time);
    const party = String(record?.party_size ?? '').trim() || '—';
    return [
      `שלום ${name},`,
      '',
      'הזמנת המקום שלכם אושרה.',
      '',
      `📅 תאריך: ${date}`,
      '',
      `🕒 שעה: ${time}`,
      '',
      `👥 מספר סועדים: ${party}`,
      '',
      'נשמח לראותכם במסעדת לחיים בכרתים.',
    ].join('\n');
  }

  function buildGenericWhatsAppText(record) {
    const name = String(record?.customer_name || '').trim() || 'אורחים';
    const date = formatDateDisplay(record?.reservation_date);
    const time = formatTime(record?.arrival_time);
    const party = String(record?.party_size ?? '').trim() || '—';
    return [
      `שלום ${name},`,
      '',
      'פרטי הזמנת המקום שלכם:',
      '',
      `📅 תאריך: ${date}`,
      '',
      `🕒 שעה: ${time}`,
      '',
      `👥 מספר סועדים: ${party}`,
      '',
      'מסעדת לחיים בכרתים.',
    ].join('\n');
  }

  function isMobileDevice() {
    const ua = navigator.userAgent || '';
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
    /* iPadOS reports as Macintosh but has touch */
    return navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua);
  }

  function openExternalUrl(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openWhatsAppWeb(record, opts = {}) {
    const phone = toWhatsAppPhone(record?.customer_phone);
    if (!phone) {
      showNotice('אין מספר טלפון תקין להודעת WhatsApp');
      return;
    }
    const blank = opts.blank === true;
    const text = blank
      ? ''
      : (record?.status === 'confirmed'
        ? buildConfirmedWhatsAppText(record)
        : buildGenericWhatsAppText(record));
    const textEnc = text ? encodeURIComponent(text) : '';
    const textQuery = textEnc ? `&text=${textEnc}` : '';

    /* Desktop → WhatsApp Web (current). Mobile → WhatsApp Business app. */
    if (!isMobileDevice()) {
      openExternalUrl(
        `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}${textQuery}`
      );
      return;
    }

    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      const fallback = `https://wa.me/${phone}${textEnc ? `?text=${textEnc}` : ''}`;
      const intentPath = textEnc
        ? `intent://send/?phone=${phone}&text=${textEnc}`
        : `intent://send/?phone=${phone}`;
      openExternalUrl(
        `${intentPath}`
        + '#Intent;scheme=whatsapp;package=com.whatsapp.w4b;'
        + `S.browser_fallback_url=${encodeURIComponent(fallback)};end`
      );
      return;
    }

    /* iOS / other mobile — opens WhatsApp Business when installed */
    openExternalUrl(`https://wa.me/${phone}${textEnc ? `?text=${textEnc}` : ''}`);
  }

  const WA_ICON = `<svg class="admin-wa-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

  function whatsAppButtonHtml(actionAttr = 'data-place-res-action') {
    return `<button type="button" class="admin-btn admin-btn--whatsapp" ${actionAttr}="whatsapp">${WA_ICON}<span>WhatsApp</span></button>`;
  }

  const SHELVED_FUTURE_KEY = 'lechaim-admin-future-shelved';

  function shelveKey(kind, id) {
    return `${kind === 'hold' ? 'hold' : 'place'}:${String(id || '')}`;
  }

  function loadShelvedFuture() {
    try {
      const raw = global.localStorage?.getItem(SHELVED_FUTURE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveShelvedFuture(set) {
    try {
      global.localStorage?.setItem(SHELVED_FUTURE_KEY, JSON.stringify([...set]));
    } catch (_) { /* ignore */ }
  }

  let shelvedFuture = loadShelvedFuture();

  function isShelvedFromFuture(kind, id) {
    return shelvedFuture.has(shelveKey(kind, id));
  }

  /**
   * Remove card from the future list only. It stays on its reservation date
   * (visible when that day is selected). Does not change the date filter.
   */
  function shelveCardToItsDate(kind, id) {
    if (!id) return;
    shelvedFuture.add(shelveKey(kind, id));
    saveShelvedFuture(shelvedFuture);
    render();
  }

  function shelveToDateButtonHtml() {
    return `<button type="button" class="admin-btn admin-btn--soft" data-shelve-future="1">העבר לתאריך</button>`;
  }

  function findHoldRecord(id) {
    const key = String(id || '');
    return (cache || []).find((r) => String(r.id) === key)
      || (futureHoldsCache || []).find((r) => String(r.id) === key)
      || null;
  }

  function findPlaceRecord(id) {
    const key = String(id || '');
    return (requestsCache || []).find((r) => String(r.id) === key) || null;
  }

  function editButtonHtml(actionAttr) {
    return `<button type="button" class="admin-btn admin-btn--soft" ${actionAttr}="edit">עריכה</button>`;
  }

  function timeSortKey(value) {
    const t = formatTime(value);
    const m = t.match(/^(\d{2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function formatCreatedAt(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())} · ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
  }

  function buildArrivalSlots() {
    const slots = [];
    const hours = global.LechaimOpeningHours;
    const openMinutes = (hours?.OPEN_HOUR ?? 14) * 60;
    const closeMinutes = typeof hours?.adminPlaceResSlotCloseMinutes === 'function'
      ? hours.adminPlaceResSlotCloseMinutes()
      : (22 * 60);
    for (let m = openMinutes; m <= closeMinutes; m += 15) {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      slots.push(`${pad2(hh)}:${pad2(mm)}`);
    }
    return slots;
  }

  function fillArrivalSlots(selected) {
    if (!arrivalSelect) return;
    const slots = buildArrivalSlots();
    const sel = selected ? formatTime(selected) : '';
    arrivalSelect.innerHTML = slots.map((slot) => (
      `<option value="${slot}"${slot === sel ? ' selected' : ''}>${slot}</option>`
    )).join('');
    if (sel && !slots.includes(sel)) {
      arrivalSelect.insertAdjacentHTML(
        'afterbegin',
        `<option value="${escapeHtml(sel)}" selected>${escapeHtml(sel)}</option>`
      );
    }
  }

  function isValidPhone(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }

  function showFormError(message) {
    if (!formError) return;
    if (!message) {
      formError.hidden = true;
      formError.textContent = '';
      return;
    }
    formError.hidden = false;
    formError.textContent = message;
  }

  function truncateNotes(notes, max) {
    const t = String(notes || '').trim();
    if (!t) return '';
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
  }

  function getViewDate() {
    return normalizeDateStr(dateFilter?.value || viewDate || todayDateStr());
  }

  async function listOpenForDate(dateStr) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא זמין');
    const day = normalizeDateStr(dateStr);
    const { data, error } = await sb
      .from('reservations')
      .select('id, customer_name, customer_phone, notes, arrival_time, reservation_date, status, created_at')
      .eq('reservation_date', day)
      .eq('status', 'open')
      .order('arrival_time', { ascending: true });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  /** Manual seat-holds with reservation_date after the given day. */
  async function listOpenAfterDate(dateStr) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא זמין');
    const day = normalizeDateStr(dateStr);
    const { data, error } = await sb
      .from('reservations')
      .select('id, customer_name, customer_phone, notes, arrival_time, reservation_date, status, created_at')
      .gt('reservation_date', day)
      .eq('status', 'open')
      .order('reservation_date', { ascending: true })
      .order('arrival_time', { ascending: true });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function listRequestsForDate(dateStr) {
    const api = global.LechaimPlaceReservations;
    if (!api?.listForDate) return [];
    return api.listForDate(dateStr);
  }

  async function listUpcomingPlaceRequests() {
    const api = global.LechaimPlaceReservations;
    if (typeof api?.listUpcomingActive === 'function') {
      return api.listUpcomingActive();
    }
    /* Fallback: today's list only if upcoming API missing */
    return listRequestsForDate(todayDateStr());
  }

  async function createReservation(payload) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא זמין');
    const row = {
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      notes: payload.notes || null,
      arrival_time: payload.arrival_time,
      reservation_date: normalizeDateStr(payload.reservation_date),
      status: 'open',
    };
    const { data, error } = await sb.from('reservations').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async function updateReservation(id, payload) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא זמין');
    const { data, error } = await sb
      .from('reservations')
      .update({
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        notes: payload.notes || null,
        arrival_time: payload.arrival_time,
        reservation_date: normalizeDateStr(payload.reservation_date),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function closeReservation(id) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase לא זמין');
    const { error } = await sb
      .from('reservations')
      .update({ status: 'closed' })
      .eq('id', id);
    if (error) throw error;
  }

  function statusRank(status) {
    if (status === 'pending') return 0;
    if (status === 'confirmed') return 1;
    if (status === 'arrived') return 2;
    return 3;
  }

  function updateOccupancyMeter(occupied, capacity) {
    if (!occupancyValueEl) return;
    const cap = capacity || global.LechaimPlaceReservations?.CAPACITY_SEATS || 60;
    const val = Number.isFinite(occupied) ? occupied : 0;
    occupancyValueEl.textContent = `${val} / ${cap}`;
  }

  function setTabBadge(count) {
    if (!tabBadgeEl) return;
    const n = Math.max(0, Number(count) || 0);
    tabBadgeEl.textContent = String(n);
    tabBadgeEl.setAttribute('data-count', String(n));
    tabBadgeEl.hidden = n <= 0;
  }

  /**
   * Tab badge = cards that appear under "הזמנות להיום":
   * open manual holds for today + active website requests for today
   * (pending / confirmed / arrived — not cancelled, not future dates).
   */
  async function refreshTodayBadge() {
    const day = todayDateStr();
    try {
      const [holds, requests] = await Promise.all([
        listOpenForDate(day),
        listUpcomingPlaceRequests().catch(() => []),
      ]);
      const todayRequests = (requests || []).filter(
        (r) => normalizeDateStr(r.reservation_date) === day
          && String(r.status || '') !== 'cancelled'
      );
      setTabBadge((holds || []).length + todayRequests.length);
    } catch (_) {
      /* keep previous badge */
    }
  }

  function holdCardHtml(r, opts = {}) {
    const notes = truncateNotes(r.notes, 80);
    const notesHtml = notes
      ? `<p class="reservation-card__notes">${escapeHtml(notes)}</p>`
      : '';
    const shelveBtn = opts.showShelveToDate ? shelveToDateButtonHtml() : '';
    /* Same action set as confirmed website cards: WhatsApp + arrive + cancel, plus edit */
    return `
        <article class="reservation-card" data-id="${escapeHtml(r.id)}" data-card-kind="hold">
          <button type="button" class="reservation-card__dismiss" data-res-action="close" aria-label="הסר מהרשימה" title="הסר">×</button>
          <p class="reservation-card__time">${escapeHtml(formatTime(r.arrival_time))}</p>
          <p class="reservation-card__date">${escapeHtml(formatDateDisplay(r.reservation_date))}</p>
          <span class="reservation-card__status reservation-card__status--confirmed">אושר</span>
          <p class="reservation-card__name">${escapeHtml(r.customer_name)}</p>
          <p class="reservation-card__phone">${escapeHtml(r.customer_phone)}</p>
          ${notesHtml}
          <div class="reservation-card__actions">
            ${whatsAppButtonHtml('data-res-action')}
            ${editButtonHtml('data-res-action')}
            ${shelveBtn}
            <button type="button" class="admin-btn admin-btn--primary" data-res-action="arrive">הלקוח הגיע</button>
            <button type="button" class="admin-btn admin-btn--ghost" data-res-action="close">בטל</button>
          </div>
        </article>`;
  }

  function placeRequestCardHtml(r, opts = {}) {
    const status = String(r.status || 'pending');
    const statusLabel = STATUS_LABEL[status] || status;
    const notes = truncateNotes(r.notes, 80);
    const notesHtml = notes
      ? `<p class="reservation-card__notes">${escapeHtml(notes)}</p>`
      : '';
    const created = formatCreatedAt(r.created_at);
    const arrivedClass = status === 'arrived' ? ' reservation-card--arrived' : '';
    const confirmedClass = status === 'confirmed' ? ' reservation-card--confirmed' : '';
    const shelveBtn = opts.showShelveToDate ? shelveToDateButtonHtml() : '';
    let actionsHtml = '';
    if (status === 'pending') {
      actionsHtml = `<div class="reservation-card__actions">
            <button type="button" class="admin-btn admin-btn--primary" data-place-res-action="confirm">אשר הזמנה</button>
            <button type="button" class="admin-btn admin-btn--ghost" data-place-res-action="cancel">דחייה</button>
            ${whatsAppButtonHtml()}
            ${editButtonHtml('data-place-res-action')}
            ${shelveBtn}
          </div>`;
    } else if (status === 'confirmed') {
      actionsHtml = `<div class="reservation-card__actions">
            ${whatsAppButtonHtml()}
            ${editButtonHtml('data-place-res-action')}
            ${shelveBtn}
            <button type="button" class="admin-btn admin-btn--primary" data-place-res-action="arrive">הלקוח הגיע</button>
            <button type="button" class="admin-btn admin-btn--ghost" data-place-res-action="cancel">בטל</button>
          </div>`;
    } else if (status === 'arrived') {
      actionsHtml = `<div class="reservation-card__actions">
            ${whatsAppButtonHtml()}
            ${editButtonHtml('data-place-res-action')}
            ${shelveBtn}
            <button type="button" class="admin-btn admin-btn--ghost" data-place-res-action="cancel">בטל</button>
          </div>`;
    }
    return `
        <article class="reservation-card reservation-card--request${arrivedClass}${confirmedClass}" data-id="${escapeHtml(r.id)}" data-card-kind="place">
          <button type="button" class="reservation-card__dismiss" data-place-res-action="delete" aria-label="מחק מהרשימה" title="מחק">×</button>
          <p class="reservation-card__time">${escapeHtml(formatTime(r.arrival_time))}</p>
          <p class="reservation-card__date">${escapeHtml(formatDateDisplay(r.reservation_date))}</p>
          <span class="reservation-card__status reservation-card__status--${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
          <p class="reservation-card__name">${escapeHtml(r.customer_name)}</p>
          <p class="reservation-card__phone">${escapeHtml(r.customer_phone)}</p>
          <p class="reservation-card__meta">${escapeHtml(String(r.party_size || '—'))} סועדים</p>
          ${notesHtml}
          ${created ? `<p class="reservation-card__created">נוצר: ${escapeHtml(created)}</p>` : ''}
          ${actionsHtml}
        </article>`;
  }

  function sortMixedCards(entries) {
    return [...entries].sort((a, b) => {
      const da = normalizeDateStr(a.record.reservation_date);
      const db = normalizeDateStr(b.record.reservation_date);
      if (da !== db) return da < db ? -1 : 1;
      const ta = timeSortKey(a.record.arrival_time);
      const tb = timeSortKey(b.record.arrival_time);
      if (ta !== tb) return ta - tb;
      if (a.kind === 'place' && b.kind === 'place') {
        return statusRank(a.record.status) - statusRank(b.record.status);
      }
      return 0;
    });
  }

  function renderMixed(grid, empty, entries, emptyText, opts = {}) {
    if (!grid) return;
    const rows = sortMixedCards(entries);
    if (empty) {
      empty.hidden = rows.length > 0;
      if (!rows.length) empty.textContent = emptyText;
    }
    grid.innerHTML = rows.map((entry) => (
      entry.kind === 'place'
        ? placeRequestCardHtml(entry.record, opts)
        : holdCardHtml(entry.record, opts)
    )).join('');
  }

  function render() {
    const day = getViewDate();
    if (dayTitleEl) {
      dayTitleEl.textContent = day === todayDateStr()
        ? 'הזמנות להיום'
        : `הזמנות ל־${formatDateDisplay(day)}`;
    }

    const dayPlace = (requestsCache || []).filter(
      (r) => normalizeDateStr(r.reservation_date) === day
    );
    const futurePlace = (requestsCache || []).filter(
      (r) => normalizeDateStr(r.reservation_date) > day
        && !isShelvedFromFuture('place', r.id)
    );

    const dayEntries = [
      ...(cache || []).map((record) => ({ kind: 'hold', record })),
      ...dayPlace.map((record) => ({ kind: 'place', record })),
    ];
    const futureEntries = [
      ...(futureHoldsCache || [])
        .filter((record) => !isShelvedFromFuture('hold', record.id))
        .map((record) => ({ kind: 'hold', record })),
      ...futurePlace.map((record) => ({ kind: 'place', record })),
    ];

    renderMixed(
      gridEl,
      emptyEl,
      dayEntries,
      day === todayDateStr() ? 'אין הזמנות להיום' : `אין הזמנות ל־${formatDateDisplay(day)}`
    );
    renderMixed(
      requestsGridEl,
      requestsEmptyEl,
      futureEntries,
      'אין הזמנות מקום עתידיות',
      { showShelveToDate: true }
    );
  }

  async function refresh() {
    viewDate = getViewDate();
    if (dateFilter && dateFilter.value !== viewDate) {
      dateFilter.value = viewDate;
    }
    const [holds, futureHolds, requests, daily] = await Promise.all([
      listOpenForDate(viewDate),
      listOpenAfterDate(viewDate).catch((err) => {
        console.warn('[admin-reservations] future holds failed', err);
        return [];
      }),
      listUpcomingPlaceRequests().catch((err) => {
        console.warn('[admin-reservations] upcoming place requests failed', err);
        return [];
      }),
      (typeof global.LechaimPlaceReservations?.getDailyOccupancy === 'function'
        ? global.LechaimPlaceReservations.getDailyOccupancy(viewDate).catch((err) => {
          console.warn('[admin-reservations] occupancy failed', err);
          return { occupied: 0, capacity: 60 };
        })
        : Promise.resolve({ occupied: 0, capacity: 60 })),
    ]);
    cache = holds || [];
    futureHoldsCache = futureHolds || [];
    /* Keep pending + confirmed (+ arrived) so WhatsApp stays available after approve */
    requestsCache = (requests || []).filter((r) => String(r.status || '') !== 'cancelled');
    updateOccupancyMeter(daily?.occupied, daily?.capacity);
    render();
    await refreshTodayBadge();
  }

  function closeModal() {
    if (!modal) return;
    if (typeof focusTrapRelease === 'function') focusTrapRelease();
    focusTrapRelease = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    showFormError('');
  }

  function openModal(record, opts = {}) {
    if (!modal || !form) return;
    showFormError('');
    const editing = Boolean(record?.id);
    /* New cards are always manual holds; place kind only when editing a website request */
    const modalKind = opts.kind === 'place' || (editing && findPlaceRecord(record.id))
      ? 'place'
      : 'hold';

    if (titleEl) {
      titleEl.textContent = editing ? 'עריכת כרטיס' : 'כרטיס שמירת מקום';
    }
    if (kindInput) kindInput.value = modalKind;
    if (idInput) idInput.value = editing ? record.id : '';
    if (nameInput) nameInput.value = editing ? (record.customer_name || '') : '';
    if (phoneInput) phoneInput.value = editing ? (record.customer_phone || '') : '';
    if (notesInput) notesInput.value = editing ? (record.notes || '') : '';
    if (partyField) partyField.hidden = modalKind !== 'place';
    if (partyInput) {
      partyInput.value = modalKind === 'place' && editing
        ? String(record.party_size || '')
        : '';
      partyInput.required = modalKind === 'place';
    }
    if (dateInput) {
      dateInput.value = editing
        ? normalizeDateStr(record.reservation_date)
        : (global.LechaimPlaceReservations?.nextOpenPlaceResDate?.(getViewDate()) || getViewDate());
      dateInput.min = todayDateStr();
    }
    fillArrivalSlots(editing ? record.arrival_time : '');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    if (typeof focusTrapRelease === 'function') focusTrapRelease();
    const release = global.LechaimFocusTrap?.activate?.(modal);
    focusTrapRelease = typeof release === 'function' ? release : null;
    nameInput?.focus();
  }

  function readFormPayload() {
    const kind = String(kindInput?.value || 'hold');
    const customer_name = String(nameInput?.value || '').trim();
    const customer_phone = String(phoneInput?.value || '').trim();
    const notes = String(notesInput?.value || '').trim();
    const reservation_date = String(dateInput?.value || '').trim();
    const arrival_time = String(arrivalSelect?.value || '').trim();
    if (!customer_name) {
      showFormError('נא להזין שם לקוח');
      nameInput?.focus();
      return null;
    }
    if (!isValidPhone(customer_phone)) {
      showFormError('נא להזין טלפון תקין');
      phoneInput?.focus();
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation_date)) {
      showFormError('נא לבחור תאריך');
      dateInput?.focus();
      return null;
    }
    if (global.LechaimPlaceReservations?.isPlaceResWeekend?.(reservation_date)) {
      showFormError('לא ניתן להזמין מקום בשישי ובשבת — המסעדה סגורה');
      dateInput?.focus();
      return null;
    }
    if (!arrival_time) {
      showFormError('נא לבחור שעת הגעה');
      arrivalSelect?.focus();
      return null;
    }
    const payload = { kind, customer_name, customer_phone, notes, reservation_date, arrival_time };
    if (kind === 'place') {
      const party_size = Math.floor(Number(partyInput?.value));
      if (!Number.isFinite(party_size) || party_size < 1) {
        showFormError('נא להזין מספר סועדים');
        partyInput?.focus();
        return null;
      }
      payload.party_size = party_size;
    }
    return payload;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const payload = readFormPayload();
    if (!payload) return;
    const id = String(idInput?.value || '').trim();
    const saveBtn = document.getElementById('reservation-save-btn');
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (payload.kind === 'place') {
        if (!id) throw new Error('חסר מזהה בקשה');
        await global.LechaimPlaceReservations.updateRequest(id, payload);
      } else if (id) {
        await updateReservation(id, payload);
      } else {
        await createReservation(payload);
      }
      closeModal();
      if (dateFilter) dateFilter.value = payload.reservation_date;
      viewDate = payload.reservation_date;
      await refresh();
    } catch (err) {
      if (err?.code === 'CAPACITY_EXCEEDED' || String(err?.message || '').includes('CAPACITY_EXCEEDED')) {
        showFormError('אין מספיק מקומות פנויים לשעה זו');
      } else {
        showFormError(err?.message || 'השמירה נכשלה');
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function onGridClick(event) {
    const btn = event.target.closest('[data-res-action]');
    if (!btn) return;
    const card = btn.closest('.reservation-card');
    const id = card?.dataset?.id;
    if (!id) return;
    const action = btn.dataset.resAction;

    if (action === 'whatsapp') {
      const record = findHoldRecord(id);
      if (!record) return;
      /* Manual cards are admin-created — use confirmed WhatsApp text */
      openWhatsAppWeb({ ...record, status: 'confirmed' });
      return;
    }

    if (action === 'edit') {
      const record = findHoldRecord(id);
      if (record) openModal(record, { kind: 'hold' });
      return;
    }

    if (action === 'arrive' || action === 'close') {
      const ok = await showConfirm(
        action === 'arrive'
          ? 'לסמן שהלקוח הגיע ולהסיר מהלוח?'
          : 'לבטל את ההזמנה ולהסיר מהלוח?',
        action === 'arrive' ? 'הלקוח הגיע' : 'בטל'
      );
      if (!ok) return;
      try {
        await closeReservation(id);
        await refresh();
        showNotice(action === 'arrive' ? 'סומן שהלקוח הגיע' : 'ההזמנה בוטלה');
      } catch (err) {
        showNotice(err?.message || 'העדכון נכשל');
      }
    }
  }

  async function onRequestsGridClick(event) {
    const btn = event.target.closest('[data-place-res-action]');
    if (!btn) return;
    const card = btn.closest('.reservation-card');
    const id = card?.dataset?.id;
    if (!id) return;
    const action = btn.dataset.placeResAction;

    if (action === 'delete') {
      const ok = await showConfirm('למחוק את הכרטיס מהרשימה?', 'מחק');
      if (!ok) return;
      try {
        await global.LechaimPlaceReservations.deleteRequest(id);
        await refresh();
      } catch (err) {
        showNotice(err?.message || 'המחיקה נכשלה');
      }
      return;
    }

    if (action === 'edit') {
      const record = findPlaceRecord(id);
      if (record) openModal(record, { kind: 'place' });
      return;
    }

    if (action === 'whatsapp') {
      const record = findPlaceRecord(id);
      if (!record) return;
      openWhatsAppWeb(record);
      return;
    }

    const nextStatus = action === 'confirm'
      ? 'confirmed'
      : action === 'arrive'
        ? 'arrived'
        : action === 'cancel'
          ? 'cancelled'
          : '';
    if (!nextStatus) return;

    const messages = {
      confirmed: {
        ask: 'לאשר את בקשת ההזמנה?',
        yes: 'אשר הזמנה',
        done: 'הבקשה אושרה — ניתן לשלוח WhatsApp ללקוח',
      },
      arrived: { ask: 'לסמן שהלקוח הגיע?', yes: 'הלקוח הגיע', done: 'סומן שהלקוח הגיע' },
      cancelled: { ask: 'לדחות את בקשת ההזמנה?', yes: 'דחייה', done: 'הבקשה נדחתה' },
    };
    const copy = messages[nextStatus];
    const ok = await showConfirm(copy.ask, copy.yes);
    if (!ok) return;

    try {
      if (nextStatus === 'cancelled') {
        const record = findPlaceRecord(id);
        if (record && String(record.status || 'pending') === 'pending') {
          openWhatsAppWeb(record, { blank: true });
        }
      }
      await global.LechaimPlaceReservations.setStatus(id, nextStatus);
      /* Optimistic local update so the card stays visible as confirmed + WhatsApp */
      const idx = requestsCache.findIndex((r) => String(r.id) === String(id));
      if (idx >= 0) {
        if (nextStatus === 'cancelled') {
          requestsCache.splice(idx, 1);
        } else {
          requestsCache[idx] = { ...requestsCache[idx], status: nextStatus };
        }
        render();
      }
      await refresh();
      showNotice(copy.done);
    } catch (err) {
      if (err?.code === 'CAPACITY_EXCEEDED' || String(err?.message || '').includes('CAPACITY_EXCEEDED')) {
        showNotice('אין מספיק מקומות פנויים לאישור ההזמנה בשעה זו');
      } else {
        showNotice(err?.message || 'עדכון הבקשה נכשל');
      }
    }
  }

  function stopPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = window.setInterval(() => {
      if (!active) return;
      const view = document.getElementById('admin-view-reservations');
      if (view && !view.hidden) {
        refresh().catch(() => { /* silent poll */ });
      } else {
        refreshTodayBadge().catch(() => { /* silent poll */ });
      }
    }, 4000);
  }

  function stopRealtime() {
    const sb = getClient();
    if (realtimeChannel && sb) {
      try {
        sb.removeChannel(realtimeChannel);
      } catch (_) { /* ignore */ }
    }
    realtimeChannel = null;
  }

  function startRealtime() {
    stopRealtime();
    const sb = getClient();
    if (!sb?.channel) return;
    realtimeChannel = sb
      .channel('admin-place-reservations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'place_reservation_requests' },
        () => {
          if (!active) return;
          const view = document.getElementById('admin-view-reservations');
          if (view && !view.hidden) {
            refresh().catch(() => { /* ignore */ });
          } else {
            refreshTodayBadge().catch(() => { /* ignore */ });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        () => {
          if (!active) return;
          const view = document.getElementById('admin-view-reservations');
          if (view && !view.hidden) {
            refresh().catch(() => { /* ignore */ });
          } else {
            refreshTodayBadge().catch(() => { /* ignore */ });
          }
        }
      )
      .subscribe();
  }

  function bindOnce() {
    if (bindOnce.done) return;
    bindOnce.done = true;
    newBtn?.addEventListener('click', () => openModal(null));
    cancelBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);
    form?.addEventListener('submit', onSubmit);
    const onAnyCardClick = (event) => {
      const shelveBtn = event.target.closest('[data-shelve-future]');
      if (shelveBtn) {
        const card = shelveBtn.closest('.reservation-card');
        const id = card?.dataset?.id;
        const kind = card?.dataset?.cardKind === 'hold' ? 'hold' : 'place';
        if (id) shelveCardToItsDate(kind, id);
        return;
      }
      if (event.target.closest('[data-place-res-action]')) {
        onRequestsGridClick(event);
        return;
      }
      if (event.target.closest('[data-res-action]')) {
        onGridClick(event);
      }
    };
    gridEl?.addEventListener('click', onAnyCardClick);
    requestsGridEl?.addEventListener('click', onAnyCardClick);
    dateFilter?.addEventListener('change', () => {
      viewDate = getViewDate();
      refresh().catch((err) => {
        showNotice(err?.message || 'טעינת ההזמנות נכשלה');
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
    });
  }

  async function start() {
    bindOnce();
    const alreadyActive = active;
    active = true;
    if (!viewDate) viewDate = todayDateStr();
    if (dateFilter && !dateFilter.value) dateFilter.value = viewDate;
    try {
      if (alreadyActive) {
        await refreshTodayBadge();
        /* Full list refresh only when the reservations tab is visible */
        const view = document.getElementById('admin-view-reservations');
        if (view && !view.hidden) await refresh();
      } else {
        await refresh();
      }
    } catch (err) {
      await refreshTodayBadge().catch(() => {});
      const view = document.getElementById('admin-view-reservations');
      if (view && !view.hidden) {
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.textContent = err?.message || 'טעינת ההזמנות נכשלה';
        }
        if (gridEl) gridEl.innerHTML = '';
        if (requestsEmptyEl) {
          requestsEmptyEl.hidden = false;
          requestsEmptyEl.textContent = err?.message || 'טעינת הבקשות נכשלה';
        }
        if (requestsGridEl) requestsGridEl.innerHTML = '';
        showNotice(err?.message || 'טעינת ההזמנות נכשלה');
      }
    }
    startPolling();
    startRealtime();
  }

  function stop() {
    active = false;
    stopPolling();
    stopRealtime();
    closeModal();
  }

  global.LechaimAdminReservations = {
    start,
    stop,
    refresh,
    refreshTodayBadge,
    listTodayOpen: () => listOpenForDate(todayDateStr()),
    create: createReservation,
    update: updateReservation,
    close: closeReservation,
  };
})(window);
