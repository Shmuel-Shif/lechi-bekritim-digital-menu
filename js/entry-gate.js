/**
 * LECHAIM — Entry gate (Stage 1 + Stage 2 session resume)
 * Home welcome → order type → table (dine-in only).
 * Persists dine-in table session via LechaimOrderSession (localStorage).
 */
(function () {
  'use strict';

  const Session = window.LechaimOrderSession;
  const TABLE_MIN = Session?.TABLE_MIN || 60;
  const TABLE_MAX = Session?.TABLE_MAX || 73;

  const COPY = {
    en: {
      welcome: 'Welcome',
      title: 'Lechaim Restaurant in Crete',
      kosher: 'Mehadrin Kosher',
      promptOrder: 'How would you like to order?',
      promptTable: 'Choose your table',
      promptPickup: 'Takeaway details',
      dineIn: 'Dine In',
      takeAway: 'Takeaway',
      delivery: 'Delivery',
      back: 'Back',
      comingSoon: 'Coming Soon',
      occupied: 'Occupied',
      tableOccupied: 'This table is occupied',
      langAria: 'Switch language – Hebrew / English',
      customerName: 'Customer Name *',
      customerPhone: 'Phone Number *',
      customerNotes: 'Notes (English only, optional)',
      pickupTime: 'Pickup Time',
      pickupAsap: 'ASAP',
      pickupSelect: 'Select Time',
      continueToMenu: 'Continue to menu',
      pickupNameRequired: 'Please enter your name',
      pickupPhoneRequired: 'Please enter a valid phone number',
      pickupPhoneInvalid: 'Please enter a valid phone number',
      pickupNotesEnglishOnly: 'Notes must be in English only',
      pickupTimeRequired: 'Please select a pickup time',
      pickupNoSlots: 'No pickup times left today — choose ASAP',
      closedTitle: 'We are currently closed',
      closedText: 'Our opening hours are 14:00 to 21:00',
      closedBrowse: 'Click here to view the menu',
    },
    he: {
      welcome: 'ברוכים הבאים',
      title: 'מסעדת לחיים בכרתים',
      kosher: 'כשר למהדרין',
      promptOrder: 'איך תרצו להזמין?',
      promptTable: 'בחרו מספר שולחן',
      promptPickup: 'פרטי איסוף עצמי',
      dineIn: 'ישיבה במקום',
      takeAway: 'איסוף עצמי',
      delivery: 'משלוח',
      back: 'חזרה',
      comingSoon: 'Coming Soon',
      occupied: 'תפוס',
      tableOccupied: 'השולחן תפוס',
      langAria: 'החלפת שפה – עברית / English',
      customerName: 'שם הלקוח *',
      customerPhone: 'טלפון *',
      customerNotes: 'Notes (אופציונלי, אנגלית בלבד)',
      pickupTime: 'שעת איסוף',
      pickupAsap: 'בהקדם האפשרי',
      pickupSelect: 'בחירת שעה',
      continueToMenu: 'המשך לתפריט',
      pickupNameRequired: 'נא להזין שם',
      pickupPhoneRequired: 'נא להזין מספר טלפון תקין',
      pickupPhoneInvalid: 'נא להזין מספר טלפון תקין',
      pickupNotesEnglishOnly: 'ההערות חייבות להיות באנגלית בלבד',
      pickupTimeRequired: 'נא לבחור שעת איסוף',
      pickupNoSlots: 'אין שעות פנויות היום — בחרו בהקדם האפשרי',
      closedTitle: 'המקום סגור כרגע',
      closedText: 'שעות הפעילות שלנו בין השעות 14:00 עד 21:00',
      closedBrowse: 'לצפייה בתפריט לחץ כאן',
    },
  };

  const gate = document.getElementById('entry-gate');
  if (!gate) return;

  const stepOrder = document.getElementById('entry-step-order');
  const stepTable = document.getElementById('entry-step-table');
  const stepPickup = document.getElementById('entry-step-pickup');
  const tablesEl = document.getElementById('entry-tables');
  const noticeEl = document.getElementById('entry-notice');
  const promptEl = document.getElementById('entry-prompt');
  const welcomeEl = document.getElementById('entry-hero-welcome');
  const titleEl = document.getElementById('entry-hero-title');
  const kosherEl = document.getElementById('entry-hero-kosher');
  const langToggle = document.getElementById('entry-lang-toggle');
  const tableBackBtn = stepTable?.querySelector('[data-entry-back]');
  const pickupForm = document.getElementById('entry-pickup-form');
  const pickupName = document.getElementById('entry-pickup-name');
  const pickupPhone = document.getElementById('entry-pickup-phone');
  const pickupNotes = document.getElementById('entry-pickup-notes');
  const pickupAsap = document.getElementById('entry-pickup-asap');
  const pickupSelect = document.getElementById('entry-pickup-select');
  const pickupSlot = document.getElementById('entry-pickup-slot');
  const pickupError = document.getElementById('entry-pickup-error');
  const closedModal = document.getElementById('entry-closed-modal');
  const closedTitle = document.getElementById('entry-closed-title');
  const closedText = document.getElementById('entry-closed-text');
  const closedBrowseBtn = document.getElementById('entry-closed-browse');
  const closedBrowseLabel = document.getElementById('entry-closed-browse-label');

  const state = {
    orderType: null, // 'dine-in' | 'takeaway'
    lang: 'he',
    tableNumber: null,
    customerName: '',
    customerPhone: '',
    customerNotes: '',
    pickupType: 'ASAP', // 'ASAP' | 'TIME'
    pickupTime: null,
  };

  let noticeTimer = null;
  let started = false;
  let changingTable = false;

  function t(key) {
    return (COPY[state.lang] || COPY.en)[key] || key;
  }

  function applyDocumentDir() {
    const dir = state.lang === 'he' ? 'rtl' : 'ltr';
    const shell = document.getElementById('entry-shell');
    if (shell) shell.dir = dir;
  }

  function updateLangToggleUI() {
    langToggle?.querySelectorAll('[data-lang]').forEach((opt) => {
      opt.classList.toggle('lang-toggle__option--active', opt.dataset.lang === state.lang);
    });
    if (langToggle) langToggle.setAttribute('aria-label', t('langAria'));
  }

  function applyEntryCopy() {
    if (welcomeEl) welcomeEl.textContent = t('welcome');
    if (titleEl) titleEl.textContent = t('title');
    if (kosherEl) kosherEl.textContent = t('kosher');

    gate.querySelectorAll('[data-entry-i18n]').forEach((el) => {
      const key = el.getAttribute('data-entry-i18n');
      if (key && COPY.en[key] != null) el.textContent = t(key);
    });

    if (closedTitle) closedTitle.textContent = t('closedTitle');
    if (closedText) closedText.textContent = t('closedText');
    if (closedBrowseLabel) closedBrowseLabel.textContent = t('closedBrowse');

    if (promptEl) {
      promptEl.hidden = false;
      if (stepPickup && !stepPickup.hidden) promptEl.textContent = t('promptPickup');
      else if (stepTable && !stepTable.hidden) promptEl.textContent = t('promptTable');
      else promptEl.textContent = t('promptOrder');
    }

    if (tableBackBtn) tableBackBtn.textContent = t('back');
    if (pickupSlot) pickupSlot.setAttribute('aria-label', t('pickupSelect'));

    updateLangToggleUI();
    applyDocumentDir();
  }

  function isOrderingHoursOpen() {
    if (typeof window.LechaimMenu?.isOrderingAllowed === 'function') {
      return window.LechaimMenu.isOrderingAllowed();
    }
    /* Fallback if menu not ready yet — same window as main.js */
    const hour = new Date().getHours();
    return hour >= 14 && hour < 21;
  }

  function showClosedGate() {
    /* Keep the normal home UI underneath; float overlay with blur */
    goToOrderType();
    if (closedModal) {
      closedModal.hidden = false;
      closedModal.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('entry-closed-open');
    applyEntryCopy();
    closedBrowseBtn?.focus();
  }

  function hideClosedGate() {
    if (closedModal) {
      closedModal.hidden = true;
      closedModal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('entry-closed-open');
  }

  function enterBrowseOnly() {
    hideClosedGate();
    enterMenu(buildMenuContext({
      browseOnly: true,
      orderType: null,
      tableNumber: null,
      lang: state.lang,
    }));
  }

  function showStep(step) {
    [stepOrder, stepTable, stepPickup].forEach((el) => {
      if (!el) return;
      el.hidden = el !== step;
    });
    applyEntryCopy();
  }

  function showNotice(message) {
    if (!noticeEl) return;
    noticeEl.hidden = false;
    noticeEl.textContent = message;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      noticeEl.hidden = true;
      noticeEl.textContent = '';
    }, 2600);
  }

  function buildTables() {
    if (!tablesEl) return;
    if (!tablesEl.childElementCount) {
      const fragment = document.createDocumentFragment();
      for (let n = TABLE_MIN; n <= TABLE_MAX; n += 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'entry-gate__table';
        btn.dataset.table = String(n);
        btn.textContent = String(n);
        btn.setAttribute('aria-label', `Table ${n}`);
        fragment.appendChild(btn);
      }
      tablesEl.appendChild(fragment);
    }
  }

  function collectLocalOccupiedTables() {
    const occupied = new Set();
    const board = window.LechaimOrderEngine?.getTablesBoard?.() || [];
    board.forEach((row) => {
      if (row?.uiStatus === 'active' || row?.uiStatus === 'bill_requested') {
        occupied.add(Number(row.tableNumber));
      }
    });
    return occupied;
  }

  /**
   * Same rule as Admin: a table is occupied only when an open Supabase
   * session has at least one order with items (or a positive total).
   * Empty "active" sessions must not block table selection.
   */
  function remoteSessionHasLiveOrder(session, orders) {
    if (!session) return false;
    const list = Array.isArray(orders) ? orders : [];
    if (!list.length) return false;

    let hasItems = false;
    let total = 0;
    list.forEach((order) => {
      const lines = order?.order_items || [];
      lines.forEach((row) => {
        const qty = Number(row?.quantity ?? row?.qty) || 0;
        if (qty > 0) {
          hasItems = true;
          total += (Number(row.price ?? row.unit_price) || 0) * qty;
        }
      });
      if (!lines.length && Number(order?.total) > 0) {
        total += Number(order.total) || 0;
      }
    });
    return hasItems || total > 0;
  }

  async function collectRemoteOccupiedTables() {
    const occupied = new Set();
    const api = window.LechaimSupabaseOrders;

    if (api?.isConfigured?.() && typeof api.getOpenSessionsWithOrders === 'function') {
      try {
        const rows = await api.getOpenSessionsWithOrders();
        (rows || []).forEach(({ session, orders }) => {
          if (!session || session.table_number == null) return;
          const type = String(session.order_type || '');
          if (type !== 'dine_in' && type !== 'dinein') return;
          if (!remoteSessionHasLiveOrder(session, orders)) return;
          occupied.add(Number(session.table_number));
        });
        return occupied;
      } catch (err) {
        console.warn('[entry-gate] occupied tables (with orders) failed', err);
      }
    }

    /* Fallback: sessions only — may over-mark; prefer API path above. */
    const cfg = window.LECHAIM_SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.anonKey || !window.supabase?.createClient) {
      return occupied;
    }

    try {
      const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
      const { data, error } = await sb
        .from('order_sessions')
        .select('table_number, session_id')
        .eq('order_type', 'dine_in')
        .in('status', ['active', 'bill_requested'])
        .not('table_number', 'is', null);

      if (error) {
        console.warn('[entry-gate] occupied tables query failed', error.message || error);
        return occupied;
      }

      const sessions = data || [];
      if (!sessions.length) return occupied;

      const ids = sessions.map((row) => row.session_id).filter(Boolean);
      const { data: orderRows, error: orderErr } = await sb
        .from('orders')
        .select('session_id, total, order_items(quantity, price)')
        .in('session_id', ids);

      if (orderErr) {
        console.warn('[entry-gate] occupied orders query failed', orderErr.message || orderErr);
        return occupied;
      }

      const bySession = new Map();
      ids.forEach((id) => bySession.set(id, []));
      (orderRows || []).forEach((order) => {
        const list = bySession.get(order.session_id);
        if (list) list.push(order);
      });

      sessions.forEach((session) => {
        if (remoteSessionHasLiveOrder(session, bySession.get(session.session_id) || [])) {
          occupied.add(Number(session.table_number));
        }
      });
    } catch (err) {
      console.warn('[entry-gate] occupied tables fetch failed', err);
    }

    return occupied;
  }

  async function refreshOccupiedTables() {
    if (!tablesEl) return;

    const occupied = collectLocalOccupiedTables();
    const remote = await collectRemoteOccupiedTables();
    remote.forEach((n) => occupied.add(n));

    /* While changing table, keep the current table selectable */
    if (changingTable && state.tableNumber != null) {
      occupied.delete(Number(state.tableNumber));
    }

    tablesEl.querySelectorAll('.entry-gate__table').forEach((btn) => {
      const n = Number(btn.dataset.table);
      const isOccupied = occupied.has(n);
      btn.classList.toggle('is-occupied', isOccupied);
      btn.disabled = isOccupied;
      btn.setAttribute('aria-disabled', isOccupied ? 'true' : 'false');
      if (isOccupied) {
        btn.textContent = t('occupied');
        btn.setAttribute('aria-label', `${t('occupied')} — Table ${n}`);
      } else {
        btn.textContent = String(n);
        btn.setAttribute('aria-label', `Table ${n}`);
      }
    });
  }

  function highlightSelectedTable(tableNumber) {
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.toggle('is-selected', Number(btn.dataset.table) === tableNumber);
    });
  }

  function openGate() {
    document.body.classList.add('entry-pending');
    gate.hidden = false;
    gate.setAttribute('aria-hidden', 'false');
  }

  function closeGate() {
    hideClosedGate();
    document.body.classList.remove('entry-pending');
    document.body.classList.remove('entry-closed-open');
    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');
    changingTable = false;
  }

  function buildMenuContext(extra = {}) {
    const fromSession = Session?.toMenuContext?.({ lang: state.lang }) || {};
    const browseOnly = Boolean(extra.browseOnly);
    const orderType = browseOnly
      ? null
      : (extra.orderType != null
        ? extra.orderType
        : (state.orderType || fromSession.orderType || null));
    const isTakeaway = orderType === 'takeaway';

    return {
      browseOnly,
      orderType,
      tableNumber: browseOnly
        ? null
        : (isTakeaway
          ? null
          : (extra.tableNumber !== undefined
            ? extra.tableNumber
            : (state.tableNumber != null ? state.tableNumber : fromSession.tableNumber))),
      lang: extra.lang || state.lang || fromSession.lang || null,
      sessionId: browseOnly ? null : (fromSession.sessionId || null),
      openedAt: browseOnly ? null : (fromSession.openedAt || null),
      status: browseOnly ? null : (fromSession.status || null),
      customerName: isTakeaway
        ? (extra.customerName ?? state.customerName ?? fromSession.customerName ?? '')
        : null,
      customerPhone: isTakeaway
        ? (extra.customerPhone ?? state.customerPhone ?? fromSession.customerPhone ?? '')
        : null,
      customerNotes: isTakeaway
        ? (extra.customerNotes ?? state.customerNotes ?? fromSession.customerNotes ?? '')
        : null,
      pickupType: isTakeaway
        ? (extra.pickupType ?? state.pickupType ?? fromSession.pickupType ?? 'ASAP')
        : null,
      pickupTime: isTakeaway
        ? (extra.pickupTime ?? state.pickupTime ?? fromSession.pickupTime ?? null)
        : null,
      publicOrderNo: isTakeaway
        ? (extra.publicOrderNo ?? fromSession.publicOrderNo ?? null)
        : null,
    };
  }

  function enterMenu(context) {
    window.LechaimOrderContext = context;
    closeGate();

    if (!started) {
      started = true;
      if (typeof window.LechaimMenu?.start === 'function') {
        window.LechaimMenu.start(context);
      } else {
        console.error('[entry-gate] LechaimMenu.start is missing');
      }
      return;
    }

    if (typeof window.LechaimMenu?.updateOrderContext === 'function') {
      window.LechaimMenu.updateOrderContext(context);
    }
  }

  function setLang(lang) {
    if (lang !== 'he' && lang !== 'en') return;
    state.lang = lang;
    Session?.setLang?.(lang);
    applyEntryCopy();
    if (stepTable && !stepTable.hidden) {
      refreshOccupiedTables();
    }
  }

  function goToOrderType() {
    state.orderType = null;
    state.tableNumber = null;
    state.customerName = '';
    state.customerPhone = '';
    state.customerNotes = '';
    state.pickupType = 'ASAP';
    state.pickupTime = null;
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.remove('is-selected');
    });
    if (tableBackBtn) tableBackBtn.dataset.entryBack = 'order';
    resetPickupForm();
    showStep(stepOrder);
  }

  function goToTable() {
    buildTables();
    highlightSelectedTable(state.tableNumber);
    if (tableBackBtn) tableBackBtn.dataset.entryBack = 'order';
    showStep(stepTable);
    refreshOccupiedTables();
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Hebrew → Latin for thermal printers (readable names). */
  function transliterateToEnglish(raw) {
    const text = String(raw || '').normalize('NFKC').trim();
    if (!text) return '';
    if (!/[\u0590-\u05FF]/.test(text)) {
      return text.replace(/\s+/g, ' ').trim();
    }

    return text
      .split(/\s+/)
      .map((word) => titleCaseLatin(transliterateHebrewWord(word)))
      .filter(Boolean)
      .join(' ');
  }

  function titleCaseLatin(value) {
    const s = String(value || '').toLowerCase();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function transliterateHebrewWord(word) {
    const chars = [...String(word || '')];
    let out = '';
    let i = 0;

    while (i < chars.length) {
      const ch = chars[i];
      const next = chars[i + 1];

      if (ch === '\u05E9') { out += 'sh'; i += 1; continue; } // ש
      if (ch === '\u05D7') { out += 'ch'; i += 1; continue; } // ח
      if (ch === '\u05E6' || ch === '\u05E5') { out += 'tz'; i += 1; continue; } // צץ

      if (ch === '\u05D5') { // ו
        if (next === '\u05D0' || next === '\u05E2') { // וא / וע → ue (שמואל)
          out += 'ue';
          i += 2;
          continue;
        }
        if (next === '\u05D9') { // וי
          out += 'oi';
          i += 2;
          continue;
        }
        out += i === 0 ? 'v' : 'o';
        i += 1;
        continue;
      }

      if (ch === '\u05D9') { // י
        out += i === 0 ? 'y' : 'i';
        i += 1;
        continue;
      }

      if (ch === '\u05D0') { // א
        if (i === 0) out += 'a';
        i += 1;
        continue;
      }

      if (ch === '\u05D4') { // ה
        if (i !== chars.length - 1) out += 'h';
        i += 1;
        continue;
      }

      if (ch === '\u05E2') { // ע
        out += 'a';
        i += 1;
        continue;
      }

      if (ch === '\u05E4' || ch === '\u05E3') { // פ ף
        out += (ch === '\u05E3' || i === chars.length - 1) ? 'f' : 'p';
        i += 1;
        continue;
      }

      const simple = {
        '\u05D1': 'b', '\u05D2': 'g', '\u05D3': 'd', '\u05D6': 'z', '\u05D8': 't',
        '\u05DB': 'k', '\u05DA': 'k', '\u05DC': 'l', '\u05DE': 'm', '\u05DD': 'm',
        '\u05E0': 'n', '\u05DF': 'n', '\u05E1': 's', '\u05E7': 'k', '\u05E8': 'r',
        '\u05EA': 't',
      };
      if (simple[ch]) {
        out += simple[ch];
        i += 1;
        continue;
      }

      if (/[A-Za-z0-9]/.test(ch)) {
        out += ch;
      }
      i += 1;
    }

    return out.replace(/(.)\1+/g, '$1$1');
  }

  function isValidPhone(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }

  function isEnglishNotes(value) {
    const s = String(value || '').trim();
    if (!s) return true;
    return /^[A-Za-z0-9\s.,!?'"()\-+:;/&@#]+$/.test(s);
  }

  function buildPickupSlots() {
    const slots = [];
    const openMinutes = 15 * 60;
    const closeMinutes = 21 * 60;
    const now = new Date();
    let startMinutes = now.getHours() * 60 + now.getMinutes();
    startMinutes = Math.ceil((startMinutes + 1) / 15) * 15;

    let cursor = Math.max(startMinutes, openMinutes);
    if (cursor % 15 !== 0) cursor = Math.ceil(cursor / 15) * 15;

    /* If nothing left today, still offer the full service window */
    if (cursor > closeMinutes) {
      cursor = openMinutes;
    }

    for (let m = cursor; m <= closeMinutes; m += 15) {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      if (hh > 23) break;
      slots.push(`${pad2(hh)}:${pad2(mm)}`);
    }
    return slots;
  }

  function fillPickupSlots() {
    if (!pickupSlot) return;
    const slots = buildPickupSlots();
    if (!slots.length) {
      pickupSlot.innerHTML = '<option value="">—</option>';
      return;
    }
    pickupSlot.innerHTML = slots.map((slot) => (
      `<option value="${slot}">${slot}</option>`
    )).join('');
  }

  function resetPickupForm() {
    if (pickupForm) pickupForm.reset();
    if (pickupAsap) pickupAsap.checked = true;
    if (pickupSlot) {
      pickupSlot.hidden = true;
      pickupSlot.required = false;
    }
    if (pickupError) {
      pickupError.hidden = true;
      pickupError.textContent = '';
    }
  }

  function syncPickupTimeUi() {
    const useTime = Boolean(pickupSelect?.checked);
    if (pickupSlot) {
      pickupSlot.hidden = !useTime;
      pickupSlot.required = useTime;
      if (useTime) fillPickupSlots();
    }
  }

  function showPickupError(message) {
    if (!pickupError) return;
    pickupError.hidden = false;
    pickupError.textContent = message;
  }

  function goToPickup() {
    state.orderType = 'takeaway';
    state.tableNumber = null;
    resetPickupForm();
    fillPickupSlots();
    syncPickupTimeUi();
    showStep(stepPickup);
    pickupName?.focus();
  }

  function finishWithTable(table) {
    state.orderType = 'dine-in';
    state.tableNumber = table;
    highlightSelectedTable(table);

    if (Session) {
      if (changingTable || Session.hasActiveDineInSession()) {
        Session.updateTable(table, { lang: state.lang });
      } else {
        Session.startDineIn(table, { lang: state.lang });
      }
    }

    enterMenu(buildMenuContext({
      orderType: 'dine-in',
      tableNumber: table,
      lang: state.lang,
    }));
  }

  function finishTakeaway(details = {}) {
    state.orderType = 'takeaway';
    state.tableNumber = null;
    state.customerName = details.customerName || '';
    state.customerPhone = details.customerPhone || '';
    state.customerNotes = details.customerNotes || '';
    state.pickupType = details.pickupType === 'TIME' ? 'TIME' : 'ASAP';
    state.pickupTime = state.pickupType === 'TIME' ? (details.pickupTime || null) : null;
    changingTable = false;
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.remove('is-selected');
    });

    if (Session) {
      Session.startTakeaway({
        lang: state.lang,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        customerNotes: state.customerNotes,
        pickupType: state.pickupType,
        pickupTime: state.pickupTime,
      });
    }

    enterMenu(buildMenuContext({
      orderType: 'takeaway',
      tableNumber: null,
      lang: state.lang,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      customerNotes: state.customerNotes,
      pickupType: state.pickupType,
      pickupTime: state.pickupTime,
    }));
  }

  function submitPickupForm(event) {
    event?.preventDefault?.();
    const nameRaw = String(pickupName?.value || '').trim();
    const phone = String(pickupPhone?.value || '').trim();
    const notes = String(pickupNotes?.value || '').trim();
    const pickupType = pickupSelect?.checked ? 'TIME' : 'ASAP';
    const pickupTime = pickupType === 'TIME' ? String(pickupSlot?.value || '').trim() : null;
    const nameEn = transliterateToEnglish(nameRaw);

    if (!nameRaw || !nameEn) {
      showPickupError(t('pickupNameRequired'));
      pickupName?.focus();
      return;
    }
    if (!phone) {
      showPickupError(t('pickupPhoneRequired'));
      pickupPhone?.focus();
      return;
    }
    if (!isValidPhone(phone)) {
      showPickupError(t('pickupPhoneInvalid'));
      pickupPhone?.focus();
      return;
    }
    if (notes && !isEnglishNotes(notes)) {
      showPickupError(t('pickupNotesEnglishOnly'));
      pickupNotes?.focus();
      return;
    }
    if (pickupType === 'TIME' && !pickupTime) {
      showPickupError(t('pickupTimeRequired'));
      pickupSlot?.focus();
      return;
    }

    if (pickupError) {
      pickupError.hidden = true;
      pickupError.textContent = '';
    }

    finishTakeaway({
      customerName: nameEn,
      customerPhone: phone,
      customerNotes: notes,
      pickupType,
      pickupTime,
    });
  }

  function reopenTablePicker() {
    const order = window.LechaimOrderEngine?.getOrder?.();
    const locked = Boolean(order?.items?.some((item) => item && Number(item.qty) > 0));
    if (locked) {
      if (typeof window.LechaimMenu?.notifyTableLocked === 'function') {
        window.LechaimMenu.notifyTableLocked();
      }
      return false;
    }

    const ctx = window.LechaimOrderContext || Session?.toMenuContext?.() || {};
    if (ctx.orderType !== 'dine-in') return false;

    changingTable = true;
    started = true;
    state.orderType = 'dine-in';
    state.lang = ctx.lang || state.lang || 'he';
    state.tableNumber = ctx.tableNumber != null ? Number(ctx.tableNumber) : null;

    openGate();
    goToTable();
    return true;
  }

  function reopenOrderTypePicker() {
    const ctx = window.LechaimOrderContext || Session?.toMenuContext?.() || {};
    started = true;
    changingTable = false;
    state.lang = ctx.lang || state.lang || 'he';
    state.orderType = null;
    state.tableNumber = null;

    setLang(state.lang);
    openGate();
    if (!isOrderingHoursOpen()) {
      showClosedGate();
      return true;
    }
    goToOrderType();
    return true;
  }

  /**
   * Called by the customer app when Supabase marks the session closed.
   * Does not clear storage itself — main.js clears local state first.
   */
  function resetToEntry() {
    started = true;
    changingTable = false;
    state.orderType = null;
    state.tableNumber = null;
    state.customerName = '';
    state.customerPhone = '';
    state.customerNotes = '';
    state.pickupType = 'ASAP';
    state.pickupTime = null;
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.remove('is-selected');
    });
    setLang(state.lang || 'he');
    openGate();
    if (!isOrderingHoursOpen()) {
      showClosedGate();
      return;
    }
    goToOrderType();
  }

  function clearLocalSessionMapEntry(localSessionId) {
    if (!localSessionId) return;
    try {
      const raw = localStorage.getItem('lechaim-supabase-session-map');
      const map = raw ? JSON.parse(raw) : {};
      if (!map || typeof map !== 'object') return;
      delete map[String(localSessionId)];
      localStorage.setItem('lechaim-supabase-session-map', JSON.stringify(map));
    } catch (err) {
      console.warn('[entry-gate] session map clear failed', err);
    }
  }

  async function isMappedRemoteSessionClosed(localSessionId) {
    const api = window.LechaimSupabaseOrders;
    if (!localSessionId || !api?.isConfigured?.() || typeof api.getSession !== 'function') {
      return false;
    }

    let remoteId = null;
    try {
      const raw = localStorage.getItem('lechaim-supabase-session-map');
      const map = raw ? JSON.parse(raw) : {};
      remoteId = map?.[String(localSessionId)] || null;
    } catch (_) {
      return false;
    }
    if (!remoteId) return false;

    try {
      const remote = await api.getSession(remoteId);
      return Boolean(remote && remote.status === 'closed');
    } catch (err) {
      console.warn('[entry-gate] getSession failed', err);
      return false;
    }
  }

  async function discardClosedLocalSession(session) {
    if (!session) return;
    clearLocalSessionMapEntry(session.sessionId);
    try {
      Session?.clearSession?.();
    } catch (err) {
      console.warn('[entry-gate] clearSession failed', err);
    }
    try {
      if (session.tableNumber != null && window.LechaimOrderEngine?.closeTable) {
        window.LechaimOrderEngine.closeTable(session.tableNumber);
      }
    } catch (err) {
      console.warn('[entry-gate] local closeTable failed', err);
    }
  }

  /**
   * Resume an open dine-in session into the menu (unless Supabase says closed).
   */
  async function tryResumeSession() {
    if (!Session?.hasActiveDineInSession()) return false;

    const session = Session.getSession();
    if (!session) return false;

    if (await isMappedRemoteSessionClosed(session.sessionId)) {
      console.log('[entry-gate] mapped Supabase session is closed — not resuming');
      await discardClosedLocalSession(session);
      return false;
    }

    state.orderType = 'dine-in';
    state.tableNumber = session.tableNumber;
    if (session.lang === 'he' || session.lang === 'en') {
      state.lang = session.lang;
    }

    setLang(state.lang);
    enterMenu(buildMenuContext({
      orderType: 'dine-in',
      tableNumber: session.tableNumber,
      lang: state.lang,
    }));
    return true;
  }

  langToggle?.addEventListener('click', (event) => {
    const picked = event.target.closest('[data-lang]')?.dataset.lang;
    const next = picked === 'he' || picked === 'en'
      ? picked
      : (state.lang === 'he' ? 'en' : 'he');
    setLang(next);
  });

  gate.addEventListener('click', (event) => {
    if (event.target.closest('#entry-lang-toggle')) return;

    const orderBtn = event.target.closest('[data-order-type]');
    if (orderBtn) {
      const type = orderBtn.dataset.orderType;
      if (type === 'delivery') {
        showNotice(t('comingSoon'));
        return;
      }
      if (type === 'dine-in') {
        state.orderType = 'dine-in';
        /* Existing active table → skip picker and resume (unless remote closed) */
        if (!changingTable && Session?.hasActiveDineInSession()) {
          const session = Session.getSession();
          (async () => {
            if (await isMappedRemoteSessionClosed(session?.sessionId)) {
              console.log('[entry-gate] mapped Supabase session is closed — show table picker');
              await discardClosedLocalSession(session);
              goToTable();
              return;
            }
            state.tableNumber = session.tableNumber;
            Session.setLang?.(state.lang);
            enterMenu(buildMenuContext({
              orderType: 'dine-in',
              tableNumber: session.tableNumber,
              lang: state.lang,
            }));
          })();
          return;
        }
        goToTable();
        return;
      }
      if (type === 'takeaway') {
        state.orderType = 'takeaway';
        goToPickup();
      }
      return;
    }

    const tableBtn = event.target.closest('[data-table]');
    if (tableBtn && stepTable && !stepTable.hidden) {
      if (tableBtn.disabled || tableBtn.classList.contains('is-occupied')) {
        showNotice(t('tableOccupied'));
        return;
      }
      const table = Number(tableBtn.dataset.table);
      if (!Number.isInteger(table) || table < TABLE_MIN || table > TABLE_MAX) return;
      finishWithTable(table);
      return;
    }

    const backBtn = event.target.closest('[data-entry-back]');
    if (backBtn) goToOrderType();
  });

  pickupForm?.addEventListener('submit', submitPickupForm);
  pickupAsap?.addEventListener('change', syncPickupTimeUi);
  pickupSelect?.addEventListener('change', syncPickupTimeUi);
  pickupNotes?.addEventListener('input', () => {
    /* Soft guide: keep English-friendly characters while typing */
    const cleaned = String(pickupNotes.value || '').replace(/[^\x20-\x7E\n\r\t]/g, '');
    if (cleaned !== pickupNotes.value) pickupNotes.value = cleaned;
  });

  closedBrowseBtn?.addEventListener('click', () => {
    enterBrowseOnly();
  });

  window.LechaimEntryGate = {
    reopenTablePicker,
    reopenOrderTypePicker,
    resetToEntry,
  };

  document.body.classList.add('entry-pending');
  gate.hidden = false;
  gate.setAttribute('aria-hidden', 'false');

  (async function bootEntryGate() {
    setLang('he');

    /* Outside opening hours — closed modal; browse skips order/table/name */
    if (!isOrderingHoursOpen()) {
      showClosedGate();
      return;
    }

    if (await tryResumeSession()) return;
    goToOrderType();
  })();
})();
