/**
 * LECHAIM — Admin "הזמנות להיום" seat-hold cards (not food orders).
 */
(function (global) {
  'use strict';

  const gridEl = document.getElementById('reservations-grid');
  const emptyEl = document.getElementById('reservations-empty');
  const newBtn = document.getElementById('reservations-new-btn');
  const dateFilter = document.getElementById('reservations-date-filter');
  const modal = document.getElementById('reservation-modal');
  const backdrop = document.getElementById('reservation-modal-backdrop');
  const form = document.getElementById('reservation-form');
  const idInput = document.getElementById('reservation-id');
  const nameInput = document.getElementById('reservation-name');
  const phoneInput = document.getElementById('reservation-phone');
  const notesInput = document.getElementById('reservation-notes');
  const dateInput = document.getElementById('reservation-date');
  const arrivalSelect = document.getElementById('reservation-arrival');
  const formError = document.getElementById('reservation-form-error');
  const cancelBtn = document.getElementById('reservation-cancel-btn');
  const titleEl = document.getElementById('reservation-modal-title');

  let client = null;
  let cache = [];
  let viewDate = '';
  let focusTrapRelease = null;

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

  function timeSortKey(value) {
    const t = formatTime(value);
    const m = t.match(/^(\d{2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function buildArrivalSlots() {
    const slots = [];
    const openMinutes = 14 * 60;
    const closeMinutes = 23 * 60;
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

  function render() {
    if (!gridEl) return;
    const rows = [...cache].sort((a, b) => timeSortKey(a.arrival_time) - timeSortKey(b.arrival_time));
    if (emptyEl) {
      emptyEl.hidden = rows.length > 0;
      if (!rows.length) {
        emptyEl.textContent = getViewDate() === todayDateStr()
          ? 'אין הזמנות להיום'
          : `אין הזמנות ל־${formatDateDisplay(getViewDate())}`;
      }
    }
    if (!rows.length) {
      gridEl.innerHTML = '';
      return;
    }
    gridEl.innerHTML = rows.map((r) => {
      const notes = truncateNotes(r.notes, 80);
      const notesHtml = notes
        ? `<p class="reservation-card__notes">${escapeHtml(notes)}</p>`
        : '';
      return `
        <article class="reservation-card" data-id="${escapeHtml(r.id)}">
          <p class="reservation-card__time">${escapeHtml(formatTime(r.arrival_time))}</p>
          <p class="reservation-card__date">${escapeHtml(formatDateDisplay(r.reservation_date))}</p>
          <p class="reservation-card__name">${escapeHtml(r.customer_name)}</p>
          <p class="reservation-card__phone">${escapeHtml(r.customer_phone)}</p>
          ${notesHtml}
          <div class="reservation-card__actions">
            <button type="button" class="admin-btn admin-btn--soft" data-res-action="edit">עריכה</button>
            <button type="button" class="admin-btn admin-btn--ghost" data-res-action="close">סגור</button>
          </div>
        </article>`;
    }).join('');
  }

  async function refresh() {
    viewDate = getViewDate();
    if (dateFilter && dateFilter.value !== viewDate) {
      dateFilter.value = viewDate;
    }
    cache = await listOpenForDate(viewDate);
    render();
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

  function openModal(record) {
    if (!modal || !form) return;
    showFormError('');
    const editing = Boolean(record?.id);
    if (titleEl) {
      titleEl.textContent = editing ? 'עריכת כרטיס' : 'כרטיס שמירת מקום';
    }
    if (idInput) idInput.value = editing ? record.id : '';
    if (nameInput) nameInput.value = editing ? (record.customer_name || '') : '';
    if (phoneInput) phoneInput.value = editing ? (record.customer_phone || '') : '';
    if (notesInput) notesInput.value = editing ? (record.notes || '') : '';
    if (dateInput) {
      dateInput.value = editing
        ? normalizeDateStr(record.reservation_date)
        : getViewDate();
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
    if (!arrival_time) {
      showFormError('נא לבחור שעת הגעה');
      arrivalSelect?.focus();
      return null;
    }
    return { customer_name, customer_phone, notes, reservation_date, arrival_time };
  }

  async function onSubmit(event) {
    event.preventDefault();
    const payload = readFormPayload();
    if (!payload) return;
    const id = String(idInput?.value || '').trim();
    const saveBtn = document.getElementById('reservation-save-btn');
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (id) await updateReservation(id, payload);
      else await createReservation(payload);
      closeModal();
      if (dateFilter) dateFilter.value = payload.reservation_date;
      viewDate = payload.reservation_date;
      await refresh();
    } catch (err) {
      showFormError(err?.message || 'השמירה נכשלה');
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
    if (action === 'edit') {
      const record = cache.find((r) => r.id === id);
      if (record) openModal(record);
      return;
    }
    if (action === 'close') {
      const ok = await showConfirm('לסגור את הכרטיס ולהסיר מהלוח?', 'סגור כרטיס');
      if (!ok) return;
      try {
        await closeReservation(id);
        await refresh();
      } catch (err) {
        showNotice(err?.message || 'הסגירה נכשלה');
      }
    }
  }

  function bindOnce() {
    if (bindOnce.done) return;
    bindOnce.done = true;
    newBtn?.addEventListener('click', () => openModal(null));
    cancelBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);
    form?.addEventListener('submit', onSubmit);
    gridEl?.addEventListener('click', onGridClick);
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
    if (!viewDate) viewDate = todayDateStr();
    if (dateFilter && !dateFilter.value) dateFilter.value = viewDate;
    try {
      await refresh();
    } catch (err) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = err?.message || 'טעינת ההזמנות נכשלה';
      }
      if (gridEl) gridEl.innerHTML = '';
      showNotice(err?.message || 'טעינת ההזמנות נכשלה');
    }
  }

  function stop() {
    closeModal();
  }

  global.LechaimAdminReservations = {
    start,
    stop,
    refresh,
    listTodayOpen: () => listOpenForDate(todayDateStr()),
    create: createReservation,
    update: updateReservation,
    close: closeReservation,
  };
})(window);
