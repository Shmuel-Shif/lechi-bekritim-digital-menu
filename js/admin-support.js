/**
 * LECHAIM — Admin customer-support inbox.
 * Isolated from orders / till / print / reservations.
 */
(function (global) {
  'use strict';

  const viewEl = document.getElementById('admin-view-support');
  const gridEl = document.getElementById('support-inbox-grid');
  const emptyEl = document.getElementById('support-inbox-empty');
  const badgeEl = document.getElementById('tab-badge-support');
  const filtersEl = document.getElementById('support-inbox-filters');
  const toastEl = document.getElementById('support-undo-toast');
  const dateLabelEl = document.getElementById('support-date-label');
  const dateInputEl = document.getElementById('support-date-input');
  const dateNavEl = document.querySelector('.support-date-nav');
  const errorEl = document.getElementById('support-inbox-error');
  const deleteModal = document.getElementById('support-delete-modal');
  const deleteTextEl = document.getElementById('support-delete-text');
  const deleteCancelEl = document.getElementById('support-delete-cancel');
  const deleteConfirmEl = document.getElementById('support-delete-confirm');
  const deleteBackdropEl = document.getElementById('support-delete-backdrop');
  const UNDO_MS = 7000;
  const LONG_MESSAGE = 360;
  const TZ = 'Europe/Athens';

  const EMPTY = {
    new: 'אין פניות חדשות',
    closed: 'אין פניות שטופלו',
    date: 'אין פניות בתאריך זה',
  };

  let client = null;
  let cache = [];
  let filter = 'new';
  let active = false;
  let realtimeChannel = null;
  let pollTimer = null;
  let undoTimer = null;
  let undoSnapshot = null;
  let selectedYmd = '';
  let pendingDeleteId = null;
  let deleteBusy = false;
  let deleteFocusRelease = null;

  function getClient() {
    if (client) return client;
    const cfg = global.LECHAIM_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey || !global.supabase?.createClient) return null;
    client = global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function athensParts(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    const map = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d).forEach((part) => {
      if (part.type !== 'literal') map[part.type] = part.value;
    });
    const hour = map.hour === '24' ? '00' : map.hour;
    return {
      year: map.year,
      month: map.month,
      day: map.day,
      hour,
      minute: map.minute,
      ymd: `${map.year}-${map.month}-${map.day}`,
      hm: `${hour}:${map.minute}`,
    };
  }

  function todayYmd() {
    return athensParts(new Date())?.ymd || '';
  }

  function ensureSelectedDay() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedYmd)) selectedYmd = todayYmd();
  }

  function addDaysYmd(ymd, delta) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return todayYmd();
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(delta)));
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
  }

  function formatYmdDisplay(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '—';
    return `${m[3]}.${m[2]}.${m[1]}`;
  }

  function athensDayStartIso(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return new Date().toISOString();
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const target = `${m[1]}-${m[2]}-${m[3]} 00:00`;
    let lo = Date.UTC(year, month - 1, day, -4, 0, 0);
    let hi = Date.UTC(year, month - 1, day, 4, 0, 0);
    for (let i = 0; i < 48; i += 1) {
      const mid = Math.floor((lo + hi) / 2);
      const p = athensParts(new Date(mid));
      const wall = p ? `${p.ymd} ${p.hm}` : '';
      if (wall >= target) hi = mid;
      else lo = mid + 1;
    }
    return new Date(hi).toISOString();
  }

  function selectedDayRange(ymd) {
    return {
      startIso: athensDayStartIso(ymd),
      endIso: athensDayStartIso(addDaysYmd(ymd, 1)),
    };
  }

  function syncDateNav() {
    ensureSelectedDay();
    if (dateLabelEl) dateLabelEl.textContent = formatYmdDisplay(selectedYmd);
    if (dateInputEl && dateInputEl.value !== selectedYmd) dateInputEl.value = selectedYmd;
    dateNavEl?.querySelector('[data-support-today]')?.classList.toggle('is-active', selectedYmd === todayYmd());
  }

  function setInboxError(message) {
    if (!errorEl) return;
    const text = String(message || '').trim();
    errorEl.textContent = text;
    errorEl.hidden = !text;
  }

  async function goToDate(ymd) {
    const next = String(ymd || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      syncDateNav();
      return;
    }
    if (next === selectedYmd) {
      syncDateNav();
      return;
    }
    selectedYmd = next;
    syncDateNav();
    setInboxError('');
    await refresh();
  }

  function formatWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return { date: `${dd}.${mm}.${yy}`, time: `${hh}:${mi}` };
  }

  function formatClosedLine(iso) {
    const parts = formatWhen(iso);
    if (!parts) return '';
    return `טופל בתאריך ${parts.date} בשעה ${parts.time}`;
  }

  function firstMessage(row) {
    const list = Array.isArray(row?.support_messages) ? row.support_messages.slice() : [];
    list.sort((a, b) => (Date.parse(a.created_at || 0) || 0) - (Date.parse(b.created_at || 0) || 0));
    const customer = list.find((item) => item.sender === 'customer') || list[0];
    return String(customer?.body || '').trim();
  }

  function isOpenTicket(row) {
    return String(row?.status || '') !== 'closed';
  }

  function setBadge(count) {
    if (!badgeEl) return;
    const n = Number(count) || 0;
    badgeEl.textContent = String(n);
    badgeEl.dataset.count = String(n);
    badgeEl.hidden = n <= 0;
  }

  function updateFilterCounts() {
    if (!filtersEl) return;
    const newCount = cache.filter(isOpenTicket).length;
    const closedCount = cache.length - newCount;
    const newEl = filtersEl.querySelector('[data-support-count="new"]');
    const closedEl = filtersEl.querySelector('[data-support-count="closed"]');
    if (newEl) newEl.textContent = String(newCount);
    if (closedEl) closedEl.textContent = String(closedCount);
    filtersEl.querySelectorAll('[data-support-filter]').forEach((btn) => {
      const on = btn.dataset.supportFilter === filter;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function isLongMessage(text) {
    const value = String(text || '');
    if (!value) return false;
    return value.length > LONG_MESSAGE || value.split('\n').length > 8;
  }

  function hideUndoToast() {
    window.clearTimeout(undoTimer);
    undoTimer = null;
    undoSnapshot = null;
    if (toastEl) toastEl.hidden = true;
    const undoBtn = toastEl?.querySelector('[data-support-undo]');
    if (undoBtn) undoBtn.hidden = false;
  }

  function showToast(message, options = {}) {
    const withUndo = options.undo === true;
    window.clearTimeout(undoTimer);
    if (!withUndo) undoSnapshot = null;
    const msg = toastEl?.querySelector('.support-undo-toast__msg');
    const undoBtn = toastEl?.querySelector('[data-support-undo]');
    if (msg) msg.textContent = message;
    if (undoBtn) undoBtn.hidden = !withUndo;
    if (toastEl) toastEl.hidden = false;
    undoTimer = window.setTimeout(() => {
      hideUndoToast();
    }, withUndo ? UNDO_MS : 2800);
  }

  function showUndoToast(snapshot) {
    undoSnapshot = snapshot;
    showToast('הפנייה סומנה כטופלה', { undo: true });
  }

  function handledAt(row) {
    return Date.parse(row?.closed_at || row?.updated_at || 0) || 0;
  }

  function createdAt(row) {
    return Date.parse(row?.created_at || 0) || 0;
  }

  function visibleTickets() {
    const list = cache.filter((row) => (filter === 'closed' ? !isOpenTicket(row) : isOpenTicket(row)));
    if (filter === 'closed') {
      return list.sort((a, b) => handledAt(b) - handledAt(a));
    }
    return list.sort((a, b) => createdAt(b) - createdAt(a));
  }

  function toWhatsAppDigits(raw) {
    const original = String(raw || '').trim();
    let digits = original.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (!digits) return '';
    if (/^\s*\+|^\s*00/.test(original)) {
      return digits.length >= 10 && digits.length <= 15 ? digits : '';
    }
    if (digits.startsWith('972') && digits.length >= 11 && digits.length <= 15) return digits;
    if (digits.startsWith('30') && digits.length >= 11 && digits.length <= 15) return digits;
    if (digits.startsWith('05') && digits.length === 10) return `972${digits.slice(1)}`;
    if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`;
    if (digits.startsWith('069') && digits.length === 11) return `30${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('69')) return `30${digits}`;
    if (!digits.startsWith('0') && digits.length >= 10 && digits.length <= 15) return digits;
    return '';
  }

  function isValidIntlPhone(raw) {
    const digits = toWhatsAppDigits(raw);
    return digits.length >= 10 && digits.length <= 15;
  }

  function isValidEmail(raw) {
    const email = String(raw || '').trim();
    if (email.length < 3 || email.length > 120) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function contactPreferenceOf(row) {
    const raw = String(row?.contact_preference || '').trim();
    if (raw === 'email' || raw === 'whatsapp_email' || raw === 'whatsapp') return raw;
    return 'whatsapp';
  }

  function preferenceLabel(pref) {
    if (pref === 'email') return 'אימייל';
    if (pref === 'whatsapp_email') return 'WhatsApp + אימייל';
    return 'WhatsApp';
  }

  function isMobileDevice() {
    const ua = navigator.userAgent || '';
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
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

  function openCustomerWhatsApp(phoneRaw) {
    const phone = toWhatsAppDigits(phoneRaw);
    if (!phone) return false;
    if (!isMobileDevice()) {
      openExternalUrl(`https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}`);
      return true;
    }
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      const fallback = `https://wa.me/${phone}`;
      openExternalUrl(
        `intent://send/?phone=${phone}`
        + '#Intent;scheme=whatsapp;package=com.whatsapp.w4b;'
        + `S.browser_fallback_url=${encodeURIComponent(fallback)};end`
      );
      return true;
    }
    openExternalUrl(`https://wa.me/${phone}`);
    return true;
  }

  function supportEmailSubject(row) {
    const order = String(row?.public_order_no || '').trim();
    if (order) return `פנייה לשירות לקוחות - הזמנה #${order}`;
    return 'פנייה לשירות לקוחות - Lechaim';
  }

  function supportEmailBody(row) {
    const name = String(row?.customer_name || '').trim();
    const greeting = name ? `שלום ${name},` : 'שלום,';
    let message = firstMessage(row);
    if (message.length > 1500) message = `${message.slice(0, 1500)}…`;
    const quoted = message ? `"${message}"` : '"—"';
    return `${greeting}\n\nתודה שפניתם אלינו.\n\nקיבלנו את פנייתכם:\n${quoted}\n\nבברכה,\nצוות Lechaim`;
  }

  function gmailComposeUrl(to, subject, body) {
    return 'https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=cm'
      + `&to=${encodeURIComponent(to)}`
      + `&su=${encodeURIComponent(subject)}`
      + `&body=${encodeURIComponent(body)}`;
  }

  function openCustomerEmail(row) {
    const email = String(row?.customer_email || '').trim();
    if (!isValidEmail(email)) return false;
    openExternalUrl(gmailComposeUrl(email, supportEmailSubject(row), supportEmailBody(row)));
    return true;
  }

  function render() {
    syncDateNav();
    updateFilterCounts();
    const list = visibleTickets();
    if (emptyEl) {
      if (!cache.length) emptyEl.textContent = EMPTY.date;
      else emptyEl.textContent = EMPTY[filter] || 'אין פניות';
      emptyEl.hidden = list.length > 0;
    }
    if (!gridEl) return;
    gridEl.innerHTML = list.map((row) => {
      const body = firstMessage(row);
      const order = String(row.public_order_no || '').trim();
      const email = String(row.customer_email || '').trim();
      const phone = String(row.customer_phone || '').trim();
      const pref = contactPreferenceOf(row);
      const wantsWa = pref === 'whatsapp' || pref === 'whatsapp_email';
      const wantsEmail = pref === 'email' || pref === 'whatsapp_email';
      const waOk = wantsWa && isValidIntlPhone(phone);
      const emailOk = wantsEmail && isValidEmail(email);
      const open = isOpenTicket(row);
      const longBody = isLongMessage(body);
      const phoneHtml = phone
        ? `<p class="support-ticket__meta">טלפון <span dir="ltr">${escapeHtml(phone)}</span></p>`
        : '';
      const emailHtml = email
        ? `<p class="support-ticket__meta">אימייל <span dir="ltr">${escapeHtml(email)}</span></p>`
        : '';
      const orderHtml = order
        ? `<p class="support-ticket__order">הזמנה #${escapeHtml(order)}</p>`
        : '';
      const closedAt = row.closed_at || row.updated_at;
      const closedHtml = !open && closedAt
        ? `<p class="support-ticket__closed">${escapeHtml(formatClosedLine(closedAt))}</p>`
        : '';
      const badgeHtml = open ? '<span class="support-ticket__badge">חדש</span>' : '';
      const moreHtml = longBody
        ? '<button type="button" class="support-ticket__more" data-support-more>הצג עוד</button>'
        : '';
      return `
        <article class="support-ticket ${open ? 'support-ticket--new' : 'support-ticket--closed'}" data-support-id="${escapeHtml(row.id)}" data-support-status="${escapeHtml(open ? 'new' : 'closed')}">
          <div class="support-ticket__top">
            <div class="support-ticket__identity">
              <h3 class="support-ticket__name">${escapeHtml(row.customer_name || '—')}</h3>
              ${orderHtml}
            </div>
            ${badgeHtml}
          </div>
          ${closedHtml}
          <div class="support-ticket__contact">
            <p class="support-ticket__pref"><span class="support-ticket__pref-label">העדפת קשר</span> ${escapeHtml(preferenceLabel(pref))}</p>
            ${phoneHtml}
            ${emailHtml}
          </div>
          <div class="support-ticket__message">
            <p class="support-ticket__label">הודעת הלקוח</p>
            <p class="support-ticket__body${longBody ? ' is-collapsed' : ''}">${body ? escapeHtml(body) : '—'}</p>
            ${moreHtml}
          </div>
          <div class="support-ticket__actions">
            ${waOk ? `<button type="button" class="admin-btn admin-btn--whatsapp" data-support-wa>WhatsApp</button>` : ''}
            ${emailOk ? `<button type="button" class="admin-btn admin-btn--soft" data-support-email>אימייל</button>` : ''}
            ${open ? `<button type="button" class="admin-btn" data-support-done>טופל</button>` : ''}
          </div>
          <button type="button" class="support-ticket__delete" data-support-delete>מחיקה</button>
        </article>
      `;
    }).join('');
  }

  async function loadTickets() {
    const sb = getClient();
    if (!sb) throw new Error('חסר חיבור');
    ensureSelectedDay();
    const { startIso, endIso } = selectedDayRange(selectedYmd);
    let { data, error } = await sb
      .from('support_tickets')
      .select('id, status, customer_name, customer_phone, customer_email, public_order_no, contact_preference, created_at, updated_at, closed_at, support_messages(body, sender, created_at)')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error && /contact_preference/i.test(String(error.message || error.code || ''))) {
      const retry = await sb
        .from('support_tickets')
        .select('id, status, customer_name, customer_phone, customer_email, public_order_no, created_at, updated_at, closed_at, support_messages(body, sender, created_at)')
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(200);
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    cache = (Array.isArray(data) ? data : []).filter((row) => athensParts(row.created_at)?.ymd === selectedYmd);
  }

  async function refreshBadgeOnly() {
    const sb = getClient();
    if (!sb) return;
    const { count, error } = await sb
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'closed');
    if (!error) setBadge(count || 0);
  }

  async function refresh() {
    syncDateNav();
    await loadTickets();
    render();
    await refreshBadgeOnly().catch(() => {});
  }

  async function applyTicketPatch(id, patch) {
    const sb = getClient();
    if (!sb || !id || !patch) return false;
    const { error } = await sb.from('support_tickets').update(patch).eq('id', id);
    if (error) {
      console.warn('[admin-support] status update failed', error);
      return false;
    }
    const row = cache.find((item) => item.id === id);
    if (row) {
      Object.assign(row, patch);
      render();
    } else {
      await refresh();
    }
    return true;
  }

  async function setStatus(id, status) {
    if (!id || status !== 'closed') return false;
    const row = cache.find((item) => item.id === id);
    const snapshot = row
      ? { id, status: row.status, closed_at: row.closed_at || null }
      : { id, status: 'new', closed_at: null };
    const now = new Date().toISOString();
    const ok = await applyTicketPatch(id, {
      status,
      updated_at: now,
      closed_at: now,
    });
    if (ok) showUndoToast(snapshot);
    return ok;
  }

  async function undoClose() {
    const snapshot = undoSnapshot;
    if (!snapshot?.id) return;
    hideUndoToast();
    const prev = snapshot.status && snapshot.status !== 'closed' ? snapshot.status : 'new';
    const ok = await applyTicketPatch(snapshot.id, {
      status: prev,
      updated_at: new Date().toISOString(),
      closed_at: snapshot.closed_at || null,
    });
    if (!ok) showUndoToast(snapshot);
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    deleteBusy = false;
    if (deleteConfirmEl) deleteConfirmEl.disabled = false;
    if (deleteModal) {
      deleteModal.hidden = true;
      deleteModal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('admin-modal-open');
    if (typeof deleteFocusRelease === 'function') {
      try { deleteFocusRelease(); } catch (_) { /* ignore */ }
    }
    deleteFocusRelease = null;
  }

  function openDeleteModal(row) {
    if (!row?.id || !deleteModal) return;
    pendingDeleteId = row.id;
    const name = String(row.customer_name || '').trim() || 'הלקוח';
    if (deleteTextEl) {
      deleteTextEl.textContent = `האם אתה בטוח שברצונך למחוק את הפנייה של ${name}?`;
    }
    deleteModal.hidden = false;
    deleteModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    deleteFocusRelease = global.LechaimFocusTrap?.activate?.(deleteModal) || null;
    deleteCancelEl?.focus();
  }

  async function confirmDeleteTicket() {
    const id = pendingDeleteId;
    if (!id || deleteBusy) return;
    const sb = getClient();
    if (!sb) {
      setInboxError('המחיקה נכשלה — אין חיבור.');
      return;
    }
    deleteBusy = true;
    if (deleteConfirmEl) deleteConfirmEl.disabled = true;
    const { data, error } = await sb.rpc('delete_support_ticket', { p_id: id });
    deleteBusy = false;
    if (deleteConfirmEl) deleteConfirmEl.disabled = false;
    const ok = !error && data && data.ok !== false;
    if (!ok) {
      const missingFn = /could not find|does not exist|schema cache/i.test(String(error?.message || error?.code || ''));
      setInboxError(
        missingFn
          ? 'המחיקה נכשלה — הריצו את supabase-support-ticket-admin-delete.sql ב-Supabase.'
          : (error?.message || 'המחיקה נכשלה. הפנייה לא נמחקה.')
      );
      closeDeleteModal();
      return;
    }
    closeDeleteModal();
    if (undoSnapshot?.id === id) hideUndoToast();
    cache = cache.filter((item) => item.id !== id);
    setInboxError('');
    render();
    showToast('פנייה נמחקה בהצלחה');
    await refreshBadgeOnly().catch(() => {});
  }

  function startRealtime() {
    stopRealtime();
    const sb = getClient();
    if (!sb?.channel) return;
    realtimeChannel = sb
      .channel('admin-support-tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        () => {
          if (!active) return;
          if (viewEl && !viewEl.hidden) {
            refresh().catch(() => {});
          } else {
            refreshBadgeOnly().catch(() => {});
          }
        }
      )
      .subscribe();
  }

  function stopRealtime() {
    const sb = getClient();
    if (realtimeChannel && sb) {
      try { sb.removeChannel(realtimeChannel); } catch (_) { /* ignore */ }
    }
    realtimeChannel = null;
  }

  function startPolling() {
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      if (!active) return;
      if (viewEl && !viewEl.hidden) refresh().catch(() => {});
      else refreshBadgeOnly().catch(() => {});
    }, 20000);
  }

  function stopPolling() {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  function bindOnce() {
    if (bindOnce.done) return;
    bindOnce.done = true;
    filtersEl?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-support-filter]');
      if (!btn) return;
      filter = btn.dataset.supportFilter === 'closed' ? 'closed' : 'new';
      render();
    });
    dateNavEl?.addEventListener('click', (event) => {
      if (event.target.closest('[data-support-today]')) {
        goToDate(todayYmd()).catch(() => {});
        return;
      }
      const dayBtn = event.target.closest('[data-support-day]');
      if (!dayBtn) return;
      ensureSelectedDay();
      goToDate(addDaysYmd(selectedYmd, Number(dayBtn.dataset.supportDay) || 0)).catch(() => {});
    });
    dateInputEl?.addEventListener('change', () => {
      goToDate(dateInputEl.value).catch(() => {});
    });
    deleteCancelEl?.addEventListener('click', closeDeleteModal);
    deleteBackdropEl?.addEventListener('click', closeDeleteModal);
    deleteConfirmEl?.addEventListener('click', () => {
      confirmDeleteTicket().catch(() => {});
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && deleteModal && !deleteModal.hidden) closeDeleteModal();
    });
    toastEl?.addEventListener('click', (event) => {
      if (event.target.closest('[data-support-undo]')) {
        undoClose();
      }
    });
    gridEl?.addEventListener('click', (event) => {
      const moreBtn = event.target.closest('[data-support-more]');
      if (moreBtn) {
        const card = moreBtn.closest('[data-support-id]');
        const bodyEl = card?.querySelector('.support-ticket__body');
        if (!bodyEl) return;
        const collapsed = bodyEl.classList.toggle('is-collapsed');
        moreBtn.textContent = collapsed ? 'הצג עוד' : 'הצג פחות';
        return;
      }
      const card = event.target.closest('[data-support-id]');
      const id = card?.dataset.supportId;
      if (!id) return;
      const row = cache.find((item) => item.id === id);
      if (event.target.closest('[data-support-wa]')) {
        if (row) openCustomerWhatsApp(row.customer_phone);
        return;
      }
      if (event.target.closest('[data-support-email]')) {
        if (row) openCustomerEmail(row);
        return;
      }
      if (event.target.closest('[data-support-done]')) {
        setStatus(id, 'closed');
        return;
      }
      if (event.target.closest('[data-support-delete]')) {
        if (row) openDeleteModal(row);
      }
    });
  }

  async function start() {
    bindOnce();
    const already = active;
    active = true;
    ensureSelectedDay();
    syncDateNav();
    try {
      if (already) {
        await refreshBadgeOnly();
        if (viewEl && !viewEl.hidden) await refresh();
      } else {
        await refresh();
      }
    } catch (err) {
      console.warn('[admin-support] load failed', err);
      await refreshBadgeOnly().catch(() => {});
      if (viewEl && !viewEl.hidden && emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'טעינת הפניות נכשלה — הריצו supabase-support-tickets.sql';
      }
    }
    startPolling();
    startRealtime();
  }

  function stop() {
    active = false;
    stopPolling();
    stopRealtime();
    hideUndoToast();
    closeDeleteModal();
  }

  global.LechaimAdminSupport = { start, stop, refresh };
})(window);
