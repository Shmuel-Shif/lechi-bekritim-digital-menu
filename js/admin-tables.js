/**
 * LECHAIM — Admin Tables board (Stage 5 + Stage 4 Supabase read)
 * Prefers live data from LechaimSupabaseOrders; falls back to localStorage Order Engine.
 * In-admin menu picker to add dishes by category.
 */
(function () {
  'use strict';

  const Engine = () => window.LechaimOrderEngine;
  const OrdersApi = () => window.LechaimSupabaseOrders;
  const gridEl = document.getElementById('tables-grid');
  const takeawaySection = document.getElementById('tables-takeaway');
  const takeawayGridToday = document.getElementById('tables-takeaway-grid-today');
  const takeawayGridFuture = document.getElementById('tables-takeaway-grid-future');
  const takeawayEmpty = document.getElementById('tables-takeaway-empty');
  const takeawayEmptyToday = document.getElementById('tables-takeaway-empty-today');
  const takeawayEmptyFuture = document.getElementById('tables-takeaway-empty-future');
  const closeDeliveriesBtn = document.getElementById('takeaway-close-deliveries-btn');
  const butcherSection = document.getElementById('tables-butcher');
  const butcherGridToday = document.getElementById('tables-butcher-grid-today');
  const butcherGridFuture = document.getElementById('tables-butcher-grid-future');
  const butcherEmpty = document.getElementById('tables-butcher-empty');
  const butcherEmptyToday = document.getElementById('tables-butcher-empty-today');
  const butcherEmptyFuture = document.getElementById('tables-butcher-empty-future');
  const dineInSection = document.getElementById('tables-dinein');
  const tabBadgeTables = document.getElementById('tab-badge-tables');
  const tabBadgePickup = document.getElementById('tab-badge-pickup');
  const tabBadgeDelivery = document.getElementById('tab-badge-delivery');
  const tabBadgeButcher = document.getElementById('tab-badge-butcher');
  const takeawayTitleEl = document.getElementById('tables-takeaway-title');
  const takeawaySubtitleEl = document.getElementById('tables-takeaway-subtitle');
  const drawer = document.getElementById('table-drawer');
  const drawerBackdrop = document.getElementById('table-drawer-backdrop');
  const drawerClose = document.getElementById('table-drawer-close');
  const drawerTitle = document.getElementById('table-drawer-title');
  const drawerType = document.getElementById('table-drawer-type');
  const drawerMeta = document.getElementById('table-drawer-meta');
  const drawerItems = document.getElementById('table-drawer-items');
  const drawerTotal = document.getElementById('table-drawer-total');
  const drawerDetail = document.getElementById('table-drawer-detail');
  const drawerMenu = document.getElementById('table-drawer-menu');
  const drawerBody = document.getElementById('table-drawer-body');
  const menuBack = document.getElementById('table-menu-back');
  const menuSearch = document.getElementById('table-menu-search');
  const menuCats = document.getElementById('table-menu-cats');
  const menuList = document.getElementById('table-menu-list');
  const successModal = document.getElementById('admin-success-modal');
  const successText = document.getElementById('admin-success-text');
  const successOk = document.getElementById('admin-success-ok');
  const successBackdrop = document.getElementById('admin-success-backdrop');
  const confirmModal = document.getElementById('admin-confirm-modal');
  const confirmText = document.getElementById('admin-confirm-text');
  const confirmYes = document.getElementById('admin-confirm-yes');
  const confirmCancel = document.getElementById('admin-confirm-cancel');
  const confirmBackdrop = document.getElementById('admin-confirm-backdrop');
  const couponModal = document.getElementById('admin-coupon-modal');
  const couponBackdrop = document.getElementById('admin-coupon-backdrop');
  const couponInput = document.getElementById('admin-coupon-input');
  const couponApply = document.getElementById('admin-coupon-apply');
  const couponStatus = document.getElementById('admin-coupon-status');
  const couponTotals = document.getElementById('admin-coupon-totals');
  const couponPrint = document.getElementById('admin-coupon-print');
  const couponCancel = document.getElementById('admin-coupon-cancel');

  let pollTimer = null;
  let selectedKey = null;
  let menuMode = false;
  let menuCategoryId = 'all';
  let menuQuery = '';
  let catalogCache = [];
  let boardCache = [];
  let takeawayCache = [];
  let butcherCache = [];
  let dataSource = 'local'; /* 'supabase' | 'local' */
  let hasSupabaseSnapshot = false;
  let unsubscribeRealtime = null;
  let refreshTimer = null;
  let loadPromise = null;
  const knownOrderIds = new Set();
  let orderIdsSeeded = false;
  const knownEntryStatuses = new Map();
  let entryStatusesSeeded = false;
  let pendingReminderTimer = null;
  let suppressNotifyUntil = 0;
  let approvePrintBusy = false;
  let addProductBusy = false;
  let removeItemBusy = false;
  let confirmResolver = null;
  let pendingOptionMain = null;
  let pendingOptionSideId = null;
  let pendingOptionDonenessId = null;
  let pendingOptionStep = 'options';
  let pendingQtyProduct = null;
  let pendingQtySide = null;
  let pendingQty = 1;
  /** 'add' | 'remove' — shared #admin-qty-modal */
  let pendingQtyMode = 'add';
  let pendingRemoveItemId = null;
  let pendingRemoveMaxQty = 1;
  const QTY_MIN = 1;
  const QTY_MAX = 99;
  let pendingBillEntry = null;
  let pendingBillCoupon = null;
  let paymentResolver = null;
  let pendingPaymentTotal = 0;
  let boardFilter = 'tables'; /* 'tables' | 'pickup' | 'delivery' | 'butcher' */

  function pickupCaches() {
    return [...(takeawayCache || []), ...(butcherCache || [])];
  }
  let watchRunning = false;
  /** Session ids with order_type=shabbat — excluded from dine-in/takeaway boards */
  const shabbatSessionIds = new Set();
  const focusTrapReleases = {
    drawer: null,
    success: null,
    confirm: null,
    coupon: null,
    courier: null,
    whatsapp: null,
  };

  function setFocusTrap(key, root) {
    if (typeof focusTrapReleases[key] === 'function') {
      focusTrapReleases[key]();
      focusTrapReleases[key] = null;
    }
    if (!root) return;
    const release = window.LechaimFocusTrap?.activate?.(root);
    focusTrapReleases[key] = typeof release === 'function' ? release : null;
  }

  let successAutoCloseTimer = null;

  function clearFocusTrap(key) {
    if (typeof focusTrapReleases[key] === 'function') {
      focusTrapReleases[key]();
    }
    focusTrapReleases[key] = null;
  }

  function showToast(message, options) {
    showSuccessModal(message, options);
  }

  /**
   * Success feedback: animated checkmark, auto-closes (no OK click).
   * @param {string} message
   * @param {{ checkOnly?: boolean, autoCloseMs?: number }} [options]
   */
  function showSuccessModal(message, options = {}) {
    if (!successModal) return;
    window.clearTimeout(successAutoCloseTimer);
    successAutoCloseTimer = null;

    const checkOnly = Boolean(options.checkOnly);
    const autoCloseMs = Number.isFinite(options.autoCloseMs)
      ? Math.max(200, Number(options.autoCloseMs))
      : 500;

    const panel = successModal.querySelector('.admin-modal__panel');
    panel?.classList.toggle('is-check-only', checkOnly);

    if (successText) successText.textContent = message || '';
    if (successOk) successOk.hidden = true;

    /* Restart SVG draw animation */
    const svg = successModal.querySelector('.admin-success-check__svg');
    if (svg) {
      const clone = svg.cloneNode(true);
      svg.replaceWith(clone);
    }

    successModal.hidden = false;
    successModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setFocusTrap('success', successModal);

    successAutoCloseTimer = window.setTimeout(() => {
      successAutoCloseTimer = null;
      closeSuccessModal();
    }, autoCloseMs);
  }

  function closeSuccessModal() {
    if (!successModal) return;
    window.clearTimeout(successAutoCloseTimer);
    successAutoCloseTimer = null;
    clearFocusTrap('success');
    successModal.hidden = true;
    successModal.setAttribute('aria-hidden', 'true');
    successModal.querySelector('.admin-modal__panel')?.classList.remove('is-check-only');
    if (!confirmModal || confirmModal.hidden) {
      document.body.classList.remove('admin-modal-open');
    }
  }

  function closeConfirmModal(result) {
    if (!confirmModal) return;
    clearFocusTrap('confirm');
    confirmModal.hidden = true;
    confirmModal.setAttribute('aria-hidden', 'true');
    const paymentModal = document.getElementById('admin-payment-modal');
    const paymentOpen = Boolean(paymentModal && !paymentModal.hidden);
    if ((!successModal || successModal.hidden) && !paymentOpen) {
      document.body.classList.remove('admin-modal-open');
    }
    if (confirmCancel) {
      confirmCancel.textContent = 'ביטול';
    }
    const resolve = confirmResolver;
    confirmResolver = null;
    if (typeof resolve === 'function') resolve(Boolean(result));
  }

  function showConfirmModal(message, options = {}) {
    if (!confirmModal) {
      return Promise.resolve(window.confirm(String(message || '')));
    }
    if (typeof confirmResolver === 'function') {
      confirmResolver(false);
      confirmResolver = null;
    }
    if (confirmText) confirmText.textContent = message;
    if (confirmYes) {
      confirmYes.textContent = options.yesLabel || 'כן';
    }
    if (confirmCancel) {
      confirmCancel.textContent = options.noLabel || 'ביטול';
    }
    confirmModal.hidden = false;
    confirmModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setFocusTrap('confirm', confirmModal);
    confirmYes?.focus();
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  async function requestPaymentCancel() {
    const ok = await showConfirmModal(
      'האם אתה בטוח? השולחן/ההזמנה ייסגרו בלי רישום מזומן או אשראי בקופה.',
      { yesLabel: 'כן', noLabel: 'לא' }
    );
    if (ok) {
      closePaymentModal({
        method: 'void',
        paidTotal: null,
        paidCash: null,
        paidCredit: null,
      });
    } else {
      document.getElementById('admin-payment-cancel')?.focus();
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;');
  }

  function splitDeliveryAddress(raw) {
    const api = window.LechaimOrderSession;
    if (typeof api?.splitCustomerAddress === 'function') {
      return api.splitCustomerAddress(raw);
    }
    return { address: String(raw || '').trim(), locationUrl: '' };
  }

  function locationLinkHtml(url, label) {
    if (!url) return '';
    return `<a class="admin-location-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }

  function deliveryAddressRowsHtml(raw, options = {}) {
    const parts = splitDeliveryAddress(raw);
    const showEmpty = options.showEmpty === true;
    if (!parts.address && !parts.locationUrl && !showEmpty) return '';
    const addressLabel = options.addressLabel || 'כתובת';
    const locationLabel = options.locationLabel || 'מיקום';
    const openLabel = options.openLabel || 'פתח במפות';
    const addr = parts.address || (showEmpty ? '—' : '');
    const addrRow = addr
      ? `<div class="table-drawer__pickup-row">
          <span>${escapeHtml(addressLabel)}</span>
          <strong dir="auto">${escapeHtml(addr)}</strong>
        </div>`
      : '';
    const locRow = parts.locationUrl
      ? `<div class="table-drawer__pickup-row">
          <span>${escapeHtml(locationLabel)}</span>
          <strong>${locationLinkHtml(parts.locationUrl, openLabel)}</strong>
        </div>`
      : '';
    return `${addrRow}${locRow}`;
  }

  /**
   * Convert local / Israeli / Greek phone to WhatsApp international digits.
   * 0587701009 → 972587701009 · 6946502236 → 306946502236
   */
  function toWhatsAppPhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('972') || digits.startsWith('30')) return digits;
    if (digits.startsWith('0')) {
      if (digits.startsWith('069') || digits.startsWith('06')) return `30${digits.slice(1)}`;
      return `972${digits.slice(1)}`;
    }
    if (digits.length === 10 && digits.startsWith('69')) return `30${digits}`;
    if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`;
    return digits;
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

  function stripKgFromWhatsAppName(name) {
    return String(name || '')
      .replace(/\s*\d+(?:[.,]\d+)?\s*ק["״']?ג\.?/gi, '')
      .replace(/\s*\d+(?:[.,]\d+)?\s*kg\b/gi, '')
      .trim();
  }

  function formatWhatsAppProductLines(order) {
    return buildDrawerItemGroups(order?.items).map((group) => {
      const item = group.main;
      const qty = Number(item.qty) || 0;
      if (!(qty > 0)) return '';
      const isPack = String(item.unitType || '') === 'pack';
      const name = stripKgFromWhatsAppName(item.name || item.productId || '');
      const extras = [];
      (group.sides || []).forEach((side) => {
        const sn = stripKgFromWhatsAppName(side.name || side.productId || '');
        if (sn) extras.push(sn);
      });
      const notes = String(item.notes || '').trim();
      if (notes) extras.push(notes);
      const label = extras.length ? `${name}, ${extras.join(', ')}` : name;
      /* Qty at start of the string → right side in Hebrew RTL WhatsApp. */
      const qtyLabel = isPack ? `${qty} חבילות` : `${qty}x`;
      return `${qtyLabel}  ${label}`;
    }).filter(Boolean);
  }

  function buildOrderWhatsAppText(entry) {
    const order = entry?.order || {};
    const name = String(order.customerName || '').trim() || 'לקוח';
    const delivery = isDeliveryOrder(order);
    const kind = entry?.orderType === 'shabbat'
      ? 'הזמנות לשבת'
      : (entry?.orderType === 'butcher'
        ? (delivery ? 'משלוח חנות בשר' : 'איסוף חנות בשר')
        : (delivery ? 'משלוח' : 'איסוף עצמי'));
    const no = order.publicOrderNo != null ? ` #${order.publicOrderNo}` : '';
    const when = formatPickupLabel(order);
    const isAsap = !when || when === '—' || when === 'בהקדם האפשרי' || when === 'בהקדם';
    const header = `${kind}${no}${isAsap ? '' : ` ${when}`}`;
    const total = formatMoney(calcOrderPaidTotal(order));
    const footer = delivery
      ? [
        `נא לאשר את ההזמנה סה"כ ${total}`,
        'תשלום מזומן לשליח',
        'צריכים עודף? אם כן תכתבו לנו כמה',
        'ברגע שיהיה מוכן השליח מיד יצא אליכם',
      ]
      : [`נא לאשר את ההזמנה סה"כ ${total}`];
    return [
      `שלום ${name}`,
      header,
      '',
      ...formatWhatsAppProductLines(order),
      '',
      ...footer,
    ].join('\n');
  }

  function whatsappCustomerName(entry) {
    return String(entry?.order?.customerName || '').trim() || 'לקוח';
  }

  function whatsappOrderNoSuffix(entry) {
    const no = entry?.order?.publicOrderNo;
    return no != null ? ` #${no}` : '';
  }

  function whatsappOrderTotal(entry) {
    return formatMoney(calcOrderPaidTotal(entry?.order));
  }

  function isWhatsAppDeliveryEntry(entry) {
    return isDeliveryOrder(entry?.order);
  }

  function isWhatsAppTemplateAllowed(template, delivery) {
    if (template === 'confirm') return true;
    if (delivery) return template === 'left' || template === 'outside';
    return template === 'ready';
  }

  function buildWhatsAppCourierLeftText(entry) {
    const name = whatsappCustomerName(entry);
    const no = whatsappOrderNoSuffix(entry);
    const total = whatsappOrderTotal(entry);
    return [
      `שלום ${name}`,
      '',
      `השליח יצא אליך עם ההזמנה${no}.`,
      `סה"כ ${total}`,
      'נתראה בקרוב 🚚',
    ].join('\n');
  }

  function buildWhatsAppCourierOutsideText(entry) {
    const name = whatsappCustomerName(entry);
    const no = whatsappOrderNoSuffix(entry);
    return [
      `שלום ${name}`,
      '',
      'השליח בחוץ 🚪',
      `נא לצאת לקבל את ההזמנה${no}.`,
    ].join('\n');
  }

  function buildWhatsAppPickupReadyText(entry) {
    const name = whatsappCustomerName(entry);
    const no = whatsappOrderNoSuffix(entry);
    const total = whatsappOrderTotal(entry);
    return [
      `שלום ${name}`,
      '',
      `ההזמנה${no} מוכנה לאיסוף.`,
      `סה"כ ${total}`,
      'מחכים לכם 🛍️',
    ].join('\n');
  }

  function buildWhatsAppTemplateText(entry, template) {
    if (template === 'left') return buildWhatsAppCourierLeftText(entry);
    if (template === 'outside') return buildWhatsAppCourierOutsideText(entry);
    if (template === 'ready') return buildWhatsAppPickupReadyText(entry);
    return buildOrderWhatsAppText(entry);
  }

  function sendWhatsAppText(phoneRaw, text) {
    const phone = toWhatsAppPhone(phoneRaw);
    if (!phone) return false;
    const textEnc = encodeURIComponent(String(text || ''));
    const textQuery = textEnc ? `&text=${textEnc}` : '';

    if (!isMobileDevice()) {
      openExternalUrl(
        `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}${textQuery}`
      );
      return true;
    }

    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      const fallback = `https://wa.me/${phone}?text=${textEnc}`;
      openExternalUrl(
        `intent://send/?phone=${phone}&text=${textEnc}`
        + '#Intent;scheme=whatsapp;package=com.whatsapp.w4b;'
        + `S.browser_fallback_url=${encodeURIComponent(fallback)};end`
      );
      return true;
    }

    openExternalUrl(`https://wa.me/${phone}?text=${textEnc}`);
    return true;
  }

  const whatsappModal = document.getElementById('admin-whatsapp-modal');
  const whatsappPreview = document.getElementById('admin-whatsapp-preview');
  let whatsappModalEntry = null;
  let whatsappModalTemplate = 'confirm';

  function syncWhatsAppChoices(delivery) {
    const title = document.getElementById('admin-whatsapp-title');
    const hint = whatsappModal?.querySelector('.admin-wa-modal__hint');
    if (title) title.textContent = delivery ? 'WhatsApp · משלוח' : 'WhatsApp · איסוף עצמי';
    if (hint) {
      hint.textContent = delivery
        ? 'בחרו הודעה למשלוח — ואז שלחו ללקוח'
        : 'בחרו הודעה לאיסוף — ואז שלחו ללקוח';
    }
    whatsappModal?.querySelectorAll('[data-wa-template]').forEach((btn) => {
      const forMode = btn.getAttribute('data-wa-for');
      if (forMode === 'delivery') btn.hidden = !delivery;
      else if (forMode === 'pickup') btn.hidden = delivery;
      else btn.hidden = false;
    });
  }

  function setWhatsAppTemplate(template) {
    const delivery = isWhatsAppDeliveryEntry(whatsappModalEntry);
    const next = isWhatsAppTemplateAllowed(template, delivery) ? template : 'confirm';
    whatsappModalTemplate = next;
    whatsappModal?.querySelectorAll('[data-wa-template]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-wa-template') === next);
    });
    if (whatsappPreview) {
      whatsappPreview.textContent = whatsappModalEntry
        ? buildWhatsAppTemplateText(whatsappModalEntry, next)
        : '';
    }
  }

  function closeWhatsAppModal() {
    if (!whatsappModal) return;
    clearFocusTrap('whatsapp');
    whatsappModal.hidden = true;
    whatsappModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    whatsappModalEntry = null;
    whatsappModalTemplate = 'confirm';
  }

  function openWhatsAppModal(entry) {
    const phone = String(entry?.order?.customerPhone || '').trim();
    if (!toWhatsAppPhone(phone)) {
      showToast('אין מספר טלפון להודעת WhatsApp');
      return;
    }
    if (!whatsappModal) {
      sendWhatsAppText(phone, buildOrderWhatsAppText(entry));
      return;
    }
    whatsappModalEntry = entry;
    syncWhatsAppChoices(isWhatsAppDeliveryEntry(entry));
    setWhatsAppTemplate('confirm');
    whatsappModal.hidden = false;
    whatsappModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setFocusTrap('whatsapp', whatsappModal);
    whatsappModal.querySelector('[data-wa-template="confirm"]')?.focus();
  }

  function confirmWhatsAppSend() {
    const entry = whatsappModalEntry;
    if (!entry) return;
    const phone = entry.order?.customerPhone;
    const text = buildWhatsAppTemplateText(entry, whatsappModalTemplate);
    closeWhatsAppModal();
    if (!sendWhatsAppText(phone, text)) {
      showToast('אין מספר טלפון להודעת WhatsApp');
    }
  }

  function openOrderWhatsApp(entry) {
    openWhatsAppModal(entry);
  }

  async function copyTextToClipboard(text) {
    const value = String(text || '');
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) { /* fallback */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  const COURIER_HE_EN = {
    'מלון': 'hotel',
    'הוטל': 'hotel',
    'דירה': 'apartment',
    'דירות': 'apartments',
    'אפרטמנט': 'apartment',
    'אפרטמנטס': 'apartments',
    'אפארטמנט': 'apartment',
    'וילה': 'villa',
    'בית': 'house',
    'רחוב': 'street',
    'שדרה': 'avenue',
    'כיכר': 'square',
    'כפר': 'village',
    'עיר': 'city',
    'נמל': 'port',
    'חוף': 'beach',
    'חדר': 'room',
    'קומה': 'floor',
    'מספר': 'no.',
    'מס': 'no.',
    'בניין': 'building',
    'בנין': 'building',
    'כניסה': 'entrance',
    'ליד': 'near',
    'מול': 'opposite',
    'אחרי': 'after',
    'לפני': 'before',
    'פינה': 'corner',
    'סוויטה': 'suite',
    'ריזורט': 'resort',
    'סטודיו': 'studio',
    'בריכה': 'pool',
    'איסוף': 'pickup',
    'שישי': 'Friday',
    'שבת': 'Shabbat',
    'משלוח': 'delivery',
    'עצמי': 'pickup',
    'חרסוניסוס': 'Hersonissos',
    'הרקליון': 'Heraklion',
    'אירקליו': 'Heraklion',
    'סטלידה': 'Stalida',
    'מליה': 'Malia',
    'גובס': 'Gouves',
    'כרתים': 'Crete',
    'כריתים': 'Crete',
  };

  function stripNikud(value) {
    return String(value || '').replace(/[\u0591-\u05C7]/g, '');
  }

  function titleCaseLatin(value) {
    const s = String(value || '').toLowerCase();
    if (!s) return '';
    if (s === 'no.') return 'No.';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function transliterateHebrewWord(word) {
    const chars = [...String(word || '')];
    let out = '';
    let i = 0;
    while (i < chars.length) {
      const ch = chars[i];
      const next = chars[i + 1];
      if (ch === '\u05E9') { out += 'sh'; i += 1; continue; }
      if (ch === '\u05D7') { out += 'ch'; i += 1; continue; }
      if (ch === '\u05E6' || ch === '\u05E5') { out += 'tz'; i += 1; continue; }
      if (ch === '\u05D5') {
        if (next === '\u05D0' || next === '\u05E2') { out += 'ue'; i += 2; continue; }
        if (next === '\u05D9') { out += 'oi'; i += 2; continue; }
        out += i === 0 ? 'v' : 'o';
        i += 1;
        continue;
      }
      if (ch === '\u05D9') { out += i === 0 ? 'y' : 'i'; i += 1; continue; }
      if (ch === '\u05D0') { if (i === 0) out += 'a'; i += 1; continue; }
      if (ch === '\u05D4') { // ה
        out += i === chars.length - 1 ? 'a' : 'h';
        i += 1;
        continue;
      }
      if (ch === '\u05E2') { out += 'a'; i += 1; continue; }
      if (ch === '\u05E4' || ch === '\u05E3') {
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
      if (simple[ch]) { out += simple[ch]; i += 1; continue; }
      if (/[A-Za-z0-9]/.test(ch)) out += ch;
      i += 1;
    }
    return out.replace(/(.)\1+/g, '$1$1');
  }

  function lookupCourierWord(heWord) {
    const clean = stripNikud(heWord);
    if (COURIER_HE_EN[clean]) return COURIER_HE_EN[clean];
    if (clean.length > 2 && 'ושהבלכמ'.includes(clean[0])) {
      const rest = clean.slice(1);
      if (COURIER_HE_EN[rest]) return COURIER_HE_EN[rest];
    }
    return '';
  }

  function transliterateCourierText(raw) {
    const text = stripNikud(String(raw || '')).normalize('NFKC').trim();
    if (!text) return '';
    if (text === '—') return '—';
    if (!/[\u0590-\u05FF]/.test(text)) return text.replace(/\s+/g, ' ').trim();
    return text
      .split(/(\s+)/)
      .map((token) => {
        if (/^\s+$/.test(token)) return ' ';
        const match = token.match(/^([^A-Za-z0-9\u0590-\u05FF]*)(.+?)([^A-Za-z0-9\u0590-\u05FF]*)$/);
        if (!match) return token;
        const [, lead, core, trail] = match;
        if (!/[\u0590-\u05FF]/.test(core)) return token;
        const mapped = lookupCourierWord(core) || transliterateHebrewWord(core);
        return `${lead}${titleCaseLatin(mapped)}${trail}`;
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildCourierDetails(entry) {
    const order = entry?.order || {};
    const delivery = isDeliveryOrder(order);
    const kindHe = entry?.orderType === 'shabbat'
      ? 'הזמנות לשבת'
      : (entry?.orderType === 'butcher'
        ? (delivery ? 'משלוח חנות בשר' : 'איסוף חנות בשר')
        : (delivery ? 'משלוח' : 'איסוף עצמי'));
    const kindEn = entry?.orderType === 'shabbat'
      ? 'Shabbat orders'
      : (entry?.orderType === 'butcher'
        ? (delivery ? 'Butcher delivery' : 'Butcher pickup')
        : (delivery ? 'Delivery' : 'Pickup'));
    const no = order.publicOrderNo != null ? ` #${order.publicOrderNo}` : '';
    const nameHe = String(order.customerName || '').trim() || '—';
    const phone = String(order.customerPhone || '').trim() || '—';
    const pickupTime = String(order.pickupTime || '14:00').trim();
    const parts = splitDeliveryAddress(order.customerAddress);
    const hasAddress = Boolean(parts.address || parts.locationUrl);
    const addressHe = parts.address
      || (entry?.orderType === 'shabbat' ? `איסוף שישי ${pickupTime}` : (hasAddress ? '—' : '—'));
    const headingHe = `${kindHe}${no}`;
    const headingEn = `${kindEn}${no}`;
    const nameEn = transliterateCourierText(nameHe) || nameHe;
    const addressEn = parts.address
      ? (transliterateCourierText(parts.address) || parts.address)
      : (entry?.orderType === 'shabbat' ? `Friday pickup ${pickupTime}` : '—');
    const locationUrl = parts.locationUrl || '';
    const total = formatMoney(calcOrderPaidTotal(order) || Number(entry?.total) || 0);
    const copyHe = [
      headingHe,
      `שם: ${nameHe}`,
      `טלפון: ${phone}`,
      `כתובת: ${addressHe}`,
      ...(locationUrl ? [`מיקום: ${locationUrl}`] : []),
      `סכום כולל: ${total}`,
    ].join('\n');
    const copyEn = [
      headingEn,
      `Name: ${nameEn}`,
      `Phone: ${phone}`,
      `Address: ${addressEn}`,
      ...(locationUrl ? [`Location: ${locationUrl}`] : []),
      `Total: ${total}`,
    ].join('\n');
    return {
      he: { heading: headingHe, name: nameHe, phone, address: addressHe, locationUrl, total, copyText: copyHe },
      en: { heading: headingEn, name: nameEn, phone, address: addressEn, locationUrl, total, copyText: copyEn },
    };
  }

  const courierModal = document.getElementById('admin-courier-modal');
  const courierBackdrop = document.getElementById('admin-courier-backdrop');
  const courierCopyHeBtn = document.getElementById('admin-courier-copy-he');
  const courierCopyEnBtn = document.getElementById('admin-courier-copy-en');
  let courierCopyHe = '';
  let courierCopyEn = '';
  let courierCopyResetTimer = null;

  function resetCourierCopyButtons() {
    if (courierCopyHeBtn) courierCopyHeBtn.textContent = 'העתק';
    if (courierCopyEnBtn) courierCopyEnBtn.textContent = 'Copy';
  }

  function fillCourierCard(lang, details) {
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText(`admin-courier-order-${lang}`, details.heading);
    setText(`admin-courier-name-${lang}`, details.name);
    setText(`admin-courier-phone-${lang}`, details.phone);
    setText(`admin-courier-address-${lang}`, details.address);
    const locEl = document.getElementById(`admin-courier-location-${lang}`);
    const locRow = locEl?.closest('.admin-courier-modal__row');
    if (locEl) {
      if (details.locationUrl) {
        locEl.innerHTML = locationLinkHtml(details.locationUrl, details.locationUrl);
        if (locRow) locRow.hidden = false;
      } else {
        locEl.textContent = '—';
        if (locRow) locRow.hidden = true;
      }
    }
    setText(`admin-courier-total-${lang}`, details.total);
  }

  function closeCourierModal() {
    if (!courierModal) return;
    window.clearTimeout(courierCopyResetTimer);
    courierCopyResetTimer = null;
    clearFocusTrap('courier');
    courierModal.hidden = true;
    courierModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    courierCopyHe = '';
    courierCopyEn = '';
    resetCourierCopyButtons();
  }

  function openCourierModal(entry) {
    if (!courierModal) return;
    const details = buildCourierDetails(entry);
    courierCopyHe = details.he.copyText;
    courierCopyEn = details.en.copyText;
    fillCourierCard('he', details.he);
    fillCourierCard('en', details.en);
    resetCourierCopyButtons();
    courierModal.hidden = false;
    courierModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setFocusTrap('courier', courierModal);
    courierCopyHeBtn?.focus();
  }

  async function copyCourierDetails(lang) {
    const isEn = lang === 'en';
    const ok = await copyTextToClipboard(isEn ? courierCopyEn : courierCopyHe);
    const btn = isEn ? courierCopyEnBtn : courierCopyHeBtn;
    if (btn) btn.textContent = ok
      ? (isEn ? 'Copied' : 'הועתק')
      : (isEn ? 'Not copied' : 'לא הועתק');
    window.clearTimeout(courierCopyResetTimer);
    courierCopyResetTimer = window.setTimeout(() => {
      resetCourierCopyButtons();
    }, 1600);
  }

  const WA_ICON = `<svg class="admin-wa-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatClock(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatElapsed(iso) {
    if (!iso) return '—';
    const start = new Date(iso).getTime();
    if (Number.isNaN(start)) return '—';
    const diff = Math.max(0, Date.now() - start);
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hours > 0) return `${hours}ש׳ ${rem}דק׳`;
    return `${mins} דק׳`;
  }

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  }

  function statusLabel(uiStatus) {
    if (uiStatus === 'pending_print') return 'ממתין לאישור';
    if (uiStatus === 'preparing') return 'בהכנה';
    if (uiStatus === 'waiter_called') return 'צריך מלצר';
    if (uiStatus === 'active') return 'פעיל';
    if (uiStatus === 'bill_requested') return 'ביקש חשבון';
    return 'פנוי';
  }

  const locallyPrintedOrderIds = new Set();

  function rememberLocallyPrinted(orderId) {
    const id = String(orderId || '');
    if (!id) return;
    locallyPrintedOrderIds.add(id);
    if (locallyPrintedOrderIds.size > 200) {
      const oldest = locallyPrintedOrderIds.values().next().value;
      locallyPrintedOrderIds.delete(oldest);
    }
  }

  function isRemoteOrderPrinted(order) {
    if (!order) return false;
    if (order.printed_at) return true;
    return locallyPrintedOrderIds.has(String(order.id || ''));
  }

  function orderHasLiveItems(order) {
    const lines = Array.isArray(order?.order_items) ? order.order_items : [];
    return lines.some((row) => (Number(row?.quantity) || 0) > 0);
  }

  function orderNeedsApprove(order) {
    if (!order?.id || isRemoteOrderPrinted(order) || !orderHasLiveItems(order)) return false;
    const status = String(order.status || 'submitted').toLowerCase();
    return status === 'submitted' || status === '';
  }

  function orderNeedsPrint(order) {
    if (!order?.id || isRemoteOrderPrinted(order) || !orderHasLiveItems(order)) return false;
    return String(order.status || '').toLowerCase() === 'preparing';
  }

  function hasUnprintedRemoteOrders(orders) {
    return (orders || []).some((order) => (
      order && order.id && !isRemoteOrderPrinted(order) && orderHasLiveItems(order)
    ));
  }

  function wavesToMarkPrinted(entry) {
    return (entry?.order?._remoteOrders || []).filter((order) => (
      order && order.id && !isRemoteOrderPrinted(order) && orderHasLiveItems(order)
    ));
  }

  function hasOrdersNeedingApprove(orders) {
    return (orders || []).some(orderNeedsApprove);
  }

  function hasOrdersNeedingPrint(orders) {
    return (orders || []).some(orderNeedsPrint);
  }

  function resolveEntryUiStatus(synthetic) {
    if (!synthetic) return 'free';
    if (synthetic.waiterCalled && synthetic.orderType === 'dinein') return 'waiter_called';
    const remote = synthetic._remoteOrders || [];
    if (hasOrdersNeedingApprove(remote)) return 'pending_print';
    if (hasOrdersNeedingPrint(remote)) return 'preparing';
    if (hasUnprintedRemoteOrders(remote)) return 'pending_print';
    if (synthetic.status === 'bill_requested') return 'bill_requested';
    return 'active';
  }

  function isDeliveryOrder(order) {
    if (!order) return false;
    if (String(order.fulfillmentType || '') === 'delivery') return true;
    return Boolean(String(order.customerAddress || '').trim());
  }

  /** Existing session.deliveryFee — only when fulfillmentType is delivery. */
  function getOrderDeliveryFee(order) {
    if (!order || String(order.fulfillmentType || '') !== 'delivery') return 0;
    if (order.deliveryFee == null || order.deliveryFee === '') return 10;
    const fee = Number(order.deliveryFee);
    return Number.isFinite(fee) && fee >= 0 ? fee : 10;
  }

  function fulfillmentBadgeLabel(order, orderType) {
    if (orderType === 'butcher') {
      return isDeliveryOrder(order) ? '🚚 חנות בשר · משלוח' : 'חנות בשר';
    }
    if (orderType === 'takeaway') {
      return isDeliveryOrder(order) ? '🚚 משלוח' : '🛍️ איסוף עצמי';
    }
    return orderTypeLabel(orderType, order);
  }

  function orderTypeLabel(orderType, order) {
    if (orderType === 'butcher') return 'חנות בשר';
    if (orderType === 'takeaway') {
      return isDeliveryOrder(order) ? 'משלוח' : 'איסוף עצמי';
    }
    if (orderType === 'dinein') return 'ישיבה במקום';
    return '—';
  }

  function formatPickupLabel(order) {
    if (!order) return 'בהקדם';
    if (order.pickupType === 'ASAP') return 'בהקדם האפשרי';
    if (order.pickupType === 'TIME' && order.pickupTime) {
      if (order.pickupDate) {
        const m = String(order.pickupDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const dateLabel = m ? `${m[3]}/${m[2]}/${m[1]}` : String(order.pickupDate);
        return `${dateLabel} · ${order.pickupTime}`;
      }
      return String(order.pickupTime);
    }
    return 'בהקדם';
  }

  function formatMoneyEuro(amount) {
    const n = Number(amount) || 0;
    return `€${n.toFixed(2)}`;
  }

  function calcOrderSubtotal(order) {
    if (!order) return 0;
    const items = order.items || [];
    const itemsSum = items.reduce((sum, item) => (
      sum + (Number(item.price) || 0) * (Number(item.qty) || 0)
    ), 0);
    if (items.length) return Math.round(itemsSum * 100) / 100;
    if (order.subtotal != null && Number.isFinite(Number(order.subtotal))) {
      return Number(order.subtotal);
    }
    if (order._sessionTotal != null) return Number(order._sessionTotal) || 0;
    return 0;
  }

  /** Products (± discount) only — delivery fee is NOT included here. */
  function calcOrderProductsPayable(order) {
    if (!order) return 0;
    const sub = calcOrderSubtotal(order);
    const disc = Number(order.discountAmount) || 0;
    if (order.couponCode && disc > 0) {
      return Math.max(0, Math.round((sub - disc) * 100) / 100);
    }
    return Math.max(0, Math.round(sub * 100) / 100);
  }

  /** Products (± discount) + deliveryFee once. */
  function calcOrderPaidTotal(order) {
    if (!order) return 0;
    const products = calcOrderProductsPayable(order);
    const fee = getOrderDeliveryFee(order);
    return Math.max(0, Math.round((products + fee) * 100) / 100);
  }

  function withPayableTotal(entry) {
    if (!entry) return entry;
    return {
      ...entry,
      total: calcOrderPaidTotal(entry.order),
    };
  }

  function roundMoney(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function hidePaymentSplitPanel() {
    const panel = document.getElementById('admin-payment-split-panel');
    if (panel) panel.hidden = true;
  }

  function syncPaymentSplitFields(fromCash = true) {
    const total = roundMoney(pendingPaymentTotal);
    const cashInput = document.getElementById('admin-payment-cash-input');
    const creditInput = document.getElementById('admin-payment-credit-input');
    const hint = document.getElementById('admin-payment-split-hint');
    if (!cashInput || !creditInput) return;

    let cash = roundMoney(cashInput.value);
    if (!Number.isFinite(cash) || cash < 0) cash = 0;
    if (cash > total) cash = total;
    const credit = roundMoney(total - cash);

    if (fromCash) {
      cashInput.value = String(cash);
      creditInput.value = String(credit);
    }

    if (hint) {
      hint.textContent = cash > 0 && credit > 0
        ? `מזומן ${formatMoney(cash)} · אשראי ${formatMoney(credit)}`
        : 'הזינו סכום מזומן בין 0 לסכום המלא';
    }
  }

  function showPaymentSplitPanel() {
    const panel = document.getElementById('admin-payment-split-panel');
    const cashInput = document.getElementById('admin-payment-cash-input');
    if (!panel) return;
    panel.hidden = false;
    const half = roundMoney(pendingPaymentTotal / 2);
    if (cashInput) {
      cashInput.value = String(half);
      syncPaymentSplitFields(true);
      cashInput.focus();
      cashInput.select();
    }
  }

  function closePaymentModal(result = null) {
    const modal = document.getElementById('admin-payment-modal');
    hidePaymentSplitPanel();
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('admin-modal-open');
    }
    clearFocusTrap('payment');
    pendingPaymentTotal = 0;
    const resolve = paymentResolver;
    paymentResolver = null;
    if (typeof resolve === 'function') resolve(result);
  }

  function buildPaymentResult(method, paidTotal, paidCash, paidCredit) {
    return {
      method,
      paidTotal: roundMoney(paidTotal),
      paidCash: roundMoney(paidCash),
      paidCredit: roundMoney(paidCredit),
    };
  }

  function showPaymentModal(entry) {
    const modal = document.getElementById('admin-payment-modal');
    const subtitle = document.getElementById('admin-payment-subtitle');
    const amountEl = document.getElementById('admin-payment-amount');
    if (!modal) return Promise.resolve(null);

    if (typeof paymentResolver === 'function') {
      paymentResolver(null);
      paymentResolver = null;
    }

    const deliveryClose = entry?.orderType === 'takeaway' && isDeliveryOrder(entry.order);
    let label = `שולחן ${entry?.tableNumber ?? ''}`;
    if (entry?.orderType === 'butcher') label = 'חנות בשר';
    else if (entry?.orderType === 'takeaway') label = deliveryClose ? 'משלוח' : 'איסוף עצמי';

    const paid = calcOrderPaidTotal(entry?.order);
    pendingPaymentTotal = paid;
    hidePaymentSplitPanel();
    if (subtitle) subtitle.textContent = `${label} · בחרו אמצעי תשלום לסגירה`;
    if (amountEl) amountEl.textContent = formatMoney(paid);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setFocusTrap('payment', modal);
    document.getElementById('admin-payment-cash')?.focus();

    return new Promise((resolve) => {
      paymentResolver = resolve;
    });
  }

  function confirmPaymentSplit() {
    const total = roundMoney(pendingPaymentTotal);
    const cashInput = document.getElementById('admin-payment-cash-input');
    let cash = roundMoney(cashInput?.value);
    if (!Number.isFinite(cash) || cash < 0) cash = 0;
    if (cash > total) cash = total;
    const credit = roundMoney(total - cash);
    if (cash <= 0 || credit <= 0) {
      showToast('בתשלום מפוצל צריך גם מזומן וגם אשראי');
      return;
    }
    closePaymentModal(buildPaymentResult('split', total, cash, credit));
  }

  function entryKey(entry) {
    if (entry.orderType === 'takeaway' || entry.orderType === 'butcher') {
      const prefix = entry.orderType === 'butcher' ? 'butcher' : 'takeaway';
      return entry.order?.orderId
        ? `${prefix}:${entry.order.orderId}`
        : prefix;
    }
    return `table:${entry.tableNumber}`;
  }

  function findEntryByKey(key, board, takeaway, butcher) {
    if (!key) return null;
    const tables = board || boardCache;
    const pickups = takeaway || takeawayCache;
    const meat = butcher || butcherCache;
    if (String(key).startsWith('takeaway')) {
      return (pickups || []).find((row) => entryKey(row) === key) || null;
    }
    if (String(key).startsWith('butcher')) {
      return (meat || []).find((row) => entryKey(row) === key) || null;
    }
    const num = Number(String(key).replace('table:', ''));
    return (tables || []).find((row) => row.tableNumber === num) || null;
  }

  function findSelectedEntry(board, takeaway, butcher) {
    return findEntryByKey(selectedKey, board, takeaway, butcher);
  }

  function getSelectedEntry() {
    if (!selectedKey) return null;
    return findSelectedEntry(boardCache, takeawayCache, butcherCache);
  }

  function stripWeightFromProductName(name) {
    return String(name || '')
      .replace(/\s*[–-]\s*\d+(?:[.,]\d+)?\s*ק["״]?ג\.?/gi, '')
      .replace(/\s*[–-]\s*\d+(?:[.,]\d+)?\s*kg\b/gi, '')
      .trim();
  }

  function mapRemoteItem(row, extras = {}) {
    const weight = Number(row.selected_weight);
    const name = stripWeightFromProductName(
      row.product_name || row.print_name || row.product_id || ''
    );
    return {
      itemId: String(row.id),
      productId: String(row.product_id || ''),
      name,
      printName: row.print_name || '',
      price: Number(row.price) || 0,
      qty: Number(row.quantity) || 0,
      notes: row.notes == null ? '' : String(row.notes),
      printed: true,
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      createdAt: row.created_at || null,
      isLateAdd: Boolean(extras.isLateAdd),
      selectedWeight: Number.isFinite(weight) && weight > 0 ? weight : null,
      pricePerKg: row.price_per_kg == null ? null : Number(row.price_per_kg),
      unitType: row.unit_type || null,
      thawCount: row.thaw_count == null ? null : Number(row.thaw_count),
    };
  }

  function flattenSessionOrders(session, orders) {
    const items = [];
    let total = 0;
    const sortedOrders = [...(orders || [])].sort((a, b) => {
      const ta = Date.parse(a?.created_at || '') || 0;
      const tb = Date.parse(b?.created_at || '') || 0;
      if (ta !== tb) return ta - tb;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });

    sortedOrders.forEach((order) => {
      /* Blue = not printed yet. After Approve & Print → normal color again. */
      const isLateAdd = !isRemoteOrderPrinted(order);
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      lines.forEach((row) => {
        const mapped = mapRemoteItem(row, { isLateAdd });
        if (mapped.qty > 0) {
          items.push(mapped);
          total += mapped.price * mapped.qty;
        }
      });
      if (!lines.length && Number(order.total) > 0) {
        total += Number(order.total) || 0;
      }
    });

    const classified = window.LechaimOrderTypes?.classifyOrderType?.(session.order_type, 'admin-tables.flatten')
      ?? (() => {
        const raw = String(session.order_type || '');
        if (raw === 'takeaway') return 'takeaway';
        if (raw === 'butcher') return 'butcher';
        if (raw === 'dine_in' || raw === 'dinein') return 'dine_in';
        if (raw === 'shabbat') return 'shabbat';
        if (raw) console.warn(`[admin-tables] Unknown order type: ${raw}`);
        return null;
      })();
    const uiOrderType = classified === 'butcher'
      ? 'butcher'
      : (classified === 'takeaway'
        ? 'takeaway'
        : (classified === 'dine_in' ? 'dinein' : null));
    let status = 'active';
    if (session.status === 'bill_requested' || session.bill_requested) {
      status = 'bill_requested';
    }

    return {
      orderId: String(session.session_id),
      sessionId: String(session.session_id),
      tableNumber: session.table_number == null ? null : Number(session.table_number),
      orderType: uiOrderType,
      status,
      createdAt: session.created_at || null,
      updatedAt: session.updated_at || null,
      closedAt: session.closed_at || null,
      items,
      couponCode: session.coupon_code || null,
      discountPercent: session.discount_percent == null ? null : Number(session.discount_percent),
      discountAmount: session.discount_amount == null ? null : Number(session.discount_amount),
      subtotal: session.subtotal == null ? null : Number(session.subtotal),
      billTotal: (session.subtotal != null && session.discount_amount != null)
        ? Math.max(0, Number(session.subtotal) - Number(session.discount_amount))
        : null,
      customerName: session.customer_name || null,
      customerPhone: session.customer_phone || null,
      customerNotes: session.notes || null,
      waiterCalled: Boolean(session.waiter_called),
      waiterNeed: session.waiter_need || '',
      customerAddress: session.customer_address || null,
      fulfillmentType: session.fulfillment_type === 'delivery' ? 'delivery' : (session.fulfillment_type === 'pickup' ? 'pickup' : null),
      pickupType: session.pickup_type || null,
      pickupTime: session.pickup_time || null,
      pickupDate: session.pickup_date || null,
      deliveryFee: session.delivery_fee == null ? null : Number(session.delivery_fee),
      publicOrderNo: session.public_order_no == null
        ? null
        : Number(session.public_order_no),
      _source: 'supabase',
      _supabaseSessionId: String(session.session_id),
      _remoteOrders: orders || [],
      _sessionTotal: total,
    };
  }

  function buildBoardsFromSupabase(rows) {
    const sessionApi = window.LechaimOrderSession;
    const min = sessionApi?.TABLE_MIN || 60;
    const max = sessionApi?.TABLE_MAX || 73;

    const dineInByTable = new Map();
    const takeaway = [];
    const butcher = [];
    const shabbatOrderIds = [];
    shabbatSessionIds.clear();

    (rows || []).forEach(({ session, orders }) => {
      const classified = window.LechaimOrderTypes?.classifyOrderType?.(session?.order_type, 'admin-tables.board')
        ?? null;

      switch (classified) {
        case 'shabbat':
          if (session?.session_id) shabbatSessionIds.add(String(session.session_id));
          (orders || []).forEach((order) => {
            if (order?.id) shabbatOrderIds.push(String(order.id));
          });
          return; /* Shabbat has its own Admin tab */
        case 'dine_in':
        case 'takeaway':
        case 'butcher':
          break;
        case 'unknown':
          return;
        default:
          if (session?.order_type) {
            window.LechaimOrderTypes?.warnUnknownOrderType?.(session.order_type, 'admin-tables.board');
          }
          return;
      }

      const synthetic = flattenSessionOrders(session, orders);
      if (!synthetic?.orderType) return;
      const isPickupBoard = synthetic.orderType === 'takeaway' || synthetic.orderType === 'butcher';
      /* Keep takeaway/butcher visible even if admin removed all line items. */

      if (isPickupBoard) {
        const entry = withPayableTotal({
          tableNumber: null,
          uiStatus: resolveEntryUiStatus(synthetic),
          orderType: synthetic.orderType,
          order: synthetic,
          total: 0,
          itemCount: synthetic.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
          openedAt: synthetic.createdAt,
          updatedAt: synthetic.updatedAt,
        });
        if (synthetic.orderType === 'butcher') butcher.push(entry);
        else takeaway.push(entry);
        return;
      }

      if (synthetic.tableNumber != null) {
        dineInByTable.set(Number(synthetic.tableNumber), synthetic);
      }
    });

    const board = [];
    for (let n = min; n <= max; n += 1) {
      const match = dineInByTable.get(n) || null;
      let uiStatus = 'free';
      if (match) uiStatus = resolveEntryUiStatus(match);
      const entry = withPayableTotal({
        tableNumber: n,
        uiStatus,
        orderType: match?.orderType || 'dinein',
        order: match,
        total: 0,
        itemCount: match
          ? match.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
          : 0,
        openedAt: match?.createdAt || null,
        updatedAt: match?.updatedAt || null,
      });
      board.push(entry);
    }

    return { board, takeaway, butcher, shabbatOrderIds };
  }

  function loadLocalBoards() {
    const engine = Engine();
    return {
      board: engine?.getTablesBoard?.() || [],
      takeaway: engine?.getTakeawayBoard?.() || [],
      butcher: engine?.getButcherBoard?.() || [],
      shabbatOrderIds: [],
      source: 'local',
    };
  }

  async function loadBoardData() {
    const api = OrdersApi();
    if (api?.isConfigured?.()) {
      try {
        const rows = await api.getOpenSessionsWithOrders();
        const built = buildBoardsFromSupabase(rows);
        hasSupabaseSnapshot = true;
        return { ...built, source: 'supabase' };
      } catch (err) {
        console.warn('[admin-tables] Supabase board failed', err);
        /* Keep last successful Supabase board — do not wipe with empty Admin localStorage. */
        if (hasSupabaseSnapshot) {
          console.warn('[admin-tables] keeping last Supabase snapshot (stale-while-revalidate)');
          return {
            board: boardCache,
            takeaway: takeawayCache,
            butcher: butcherCache,
            shabbatOrderIds: [],
            source: 'supabase',
            stale: true,
          };
        }
        console.warn('[admin-tables] no Supabase snapshot yet — falling back to localStorage');
      }
    }
    return loadLocalBoards();
  }

  function setCategoryBadge(el, count) {
    if (!el) return;
    const n = Math.max(0, Number(count) || 0);
    el.textContent = String(n);
    el.setAttribute('data-count', String(n));
    el.hidden = n <= 0;
  }

  function setBoardFilter(filter) {
    if (filter === 'pickup' || filter === 'takeaway') boardFilter = 'pickup';
    else if (filter === 'delivery') boardFilter = 'delivery';
    else if (filter === 'butcher') boardFilter = 'butcher';
    else boardFilter = 'tables';
    paintBoard(boardCache, takeawayCache, butcherCache);
  }

  function isTakeawayDeliveryEntry(entry) {
    return isDeliveryOrder(entry?.order);
  }

  function filterTakeawayByBoard(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (boardFilter === 'delivery') {
      return list.filter(isTakeawayDeliveryEntry);
    }
    if (boardFilter === 'pickup') {
      return list.filter((entry) => !isTakeawayDeliveryEntry(entry));
    }
    return list;
  }

  function splitTakeawayCounts(rows) {
    let pickup = 0;
    let delivery = 0;
    (rows || []).forEach((entry) => {
      if (isTakeawayDeliveryEntry(entry)) delivery += 1;
      else pickup += 1;
    });
    return { pickup, delivery };
  }

  function todayIsoLocal() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function entryPickupDateIso(entry) {
    const raw = String(entry?.order?.pickupDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return todayIsoLocal();
  }

  function splitPickupByDate(rows) {
    const today = todayIsoLocal();
    const list = Array.isArray(rows) ? rows.slice() : [];
    const todays = [];
    const future = [];
    list.forEach((entry) => {
      const date = entryPickupDateIso(entry);
      if (date > today) future.push(entry);
      else todays.push(entry);
    });
    const byTime = (a, b) => {
      const ta = String(a?.order?.pickupTime || '');
      const tb = String(b?.order?.pickupTime || '');
      if (ta !== tb) return ta.localeCompare(tb);
      return String(a?.openedAt || '').localeCompare(String(b?.openedAt || ''));
    };
    todays.sort(byTime);
    future.sort((a, b) => {
      const da = entryPickupDateIso(a);
      const db = entryPickupDateIso(b);
      if (da !== db) return da.localeCompare(db);
      return byTime(a, b);
    });
    return { today: todays, future };
  }

  function paintPickupGrid(grid, emptyEl, rows) {
    if (!grid) return;
    const list = Array.isArray(rows) ? rows : [];
    if (list.length) {
      grid.innerHTML = list.map(renderCard).join('');
      if (emptyEl) emptyEl.hidden = true;
    } else {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
    }
  }

  function paintSplitPickupBoard(todayGrid, futureGrid, emptyToday, emptyFuture, emptyAll, rows) {
    const split = splitPickupByDate(rows);
    paintPickupGrid(todayGrid, emptyToday, split.today);
    paintPickupGrid(futureGrid, emptyFuture, split.future);
    if (emptyAll) emptyAll.hidden = split.today.length + split.future.length > 0;
  }

  function paintBoard(board, takeaway, butcher) {
    if (!gridEl) return;

    const occupiedTables = (board || []).filter((row) => row && row.uiStatus && row.uiStatus !== 'free').length;
    const takeawayCounts = splitTakeawayCounts(takeaway);
    const butcherCount = (butcher || []).length;
    setCategoryBadge(tabBadgeTables, occupiedTables);
    setCategoryBadge(tabBadgePickup, takeawayCounts.pickup);
    setCategoryBadge(tabBadgeDelivery, takeawayCounts.delivery);
    setCategoryBadge(tabBadgeButcher, butcherCount);

    const showPickupBoard = boardFilter === 'pickup' || boardFilter === 'delivery';
    const showButcher = boardFilter === 'butcher';
    if (dineInSection) dineInSection.hidden = showPickupBoard || showButcher;
    if (takeawaySection) takeawaySection.hidden = !showPickupBoard;
    if (butcherSection) butcherSection.hidden = !showButcher;

    if (takeawayTitleEl) {
      takeawayTitleEl.textContent = boardFilter === 'delivery' ? 'משלוחים' : 'איסוף עצמי';
    }
    if (takeawaySubtitleEl) {
      takeawaySubtitleEl.textContent = boardFilter === 'delivery'
        ? 'הזמנות משלוח פעילות'
        : 'הזמנות איסוף עצמי פעילות';
    }
    if (takeawayEmpty) {
      takeawayEmpty.textContent = boardFilter === 'delivery'
        ? 'אין הזמנות משלוח כרגע'
        : 'אין הזמנות איסוף עצמי כרגע';
    }
    if (closeDeliveriesBtn) closeDeliveriesBtn.hidden = false;

    if (!showPickupBoard && !showButcher) {
      gridEl.innerHTML = board.map(renderCard).join('');
    }

    paintSplitPickupBoard(
      takeawayGridToday,
      takeawayGridFuture,
      takeawayEmptyToday,
      takeawayEmptyFuture,
      takeawayEmpty,
      filterTakeawayByBoard(takeaway)
    );
    paintSplitPickupBoard(
      butcherGridToday,
      butcherGridFuture,
      butcherEmptyToday,
      butcherEmptyFuture,
      butcherEmpty,
      butcher
    );

    const selected = findSelectedEntry(board, takeaway, butcher);
    if (selectedKey && selected?.order) {
      fillDrawer(selected);
    } else if (selectedKey && (!selected || !selected.order)) {
      closeDrawer();
    }
  }

  async function refreshBoardData() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const data = await loadBoardData();
      boardCache = (data.board || []).map(withPayableTotal);
      takeawayCache = (data.takeaway || []).map(withPayableTotal);
      butcherCache = (data.butcher || []).map(withPayableTotal);
      dataSource = data.source;
      if (!data.stale) {
        syncKnownOrderIdsAfterBoardLoad(boardCache, pickupCaches(), data.shabbatOrderIds);
      }
      paintBoard(boardCache, takeawayCache, butcherCache);
    })().finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  }

  function scheduleBoardRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshBoardData().catch((err) => {
        console.warn('[admin-tables] refresh failed', err);
      });
      /* Keep קופה totals live whenever sessions/orders change */
      window.LechaimAdminTill?.refresh?.();
    }, 250);
  }

  function loadCatalog() {
    catalogCache = window.LechaimInventory?.getCatalog?.() || [];
    return catalogCache;
  }

  function getCategories(catalog) {
    const map = new Map();
    catalog.forEach((item) => {
      const id = item.categoryId || 'other';
      if (!map.has(id)) {
        map.set(id, {
          id,
          title: item.categoryTitle || id,
        });
      }
    });
    return [...map.values()];
  }

  function formatDineInNotesLabel(order) {
    const text = stripPlaceResFromNotes(order?.customerNotes);
    return text ? `הערות: ${text}` : 'אין הערות';
  }

  const WAITER_NEED_LABELS = {
    water: 'מים',
    cutlery: 'סכום',
    napkin: 'מפיות',
    other: 'כללי / אחר',
  };

  function waiterNeedsLabel(order) {
    const ids = String(order?.waiterNeed || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (!ids.length) return 'קריאה למלצר';
    return ids.map((id) => WAITER_NEED_LABELS[id] || id).join(' · ');
  }

  function stripPlaceResFromNotes(notes) {
    const strip = window.LechaimOrderSession?.stripPlaceReservationNote;
    if (typeof strip === 'function') return strip(notes);
    return String(notes || '').trim();
  }

  function dineInReservationFromOrder(order) {
    const name = String(order?.customerName || '').trim();
    const party = window.LechaimOrderSession?.parsePlaceReservationParty?.(order?.customerNotes)
      ?? null;
    return {
      name,
      party,
      reserved: Boolean(name),
    };
  }

  function renderCard(entry) {
    const free = entry.uiStatus === 'free';
    const coupon = entry.order?.couponCode;
    const discountPct = entry.order?.discountPercent;
    const isPickup = entry.orderType === 'takeaway' || entry.orderType === 'butcher';
    const isDelivery = isDeliveryOrder(entry.order)
      && (entry.orderType === 'takeaway' || entry.orderType === 'butcher');
    const badgeText = fulfillmentBadgeLabel(entry.order, entry.orderType);
    const customerPhone = String(entry.order?.customerPhone || '').trim();
    const dineRes = !isPickup && !free ? dineInReservationFromOrder(entry.order) : { name: '', party: null, reserved: false };
    const waBtn = isPickup && customerPhone
      ? `<button type="button" class="admin-btn admin-btn--whatsapp table-card__wa" data-table-action="whatsapp">${WA_ICON}<span>WhatsApp</span></button>`
      : '';
    const courierBtn = isPickup
      ? `<button type="button" class="admin-btn admin-btn--soft table-card__courier" data-table-action="courier">${isDelivery ? 'לשליח' : 'פרטים'}</button>`
      : '';
    const cardActions = isPickup && (waBtn || courierBtn)
      ? `<div class="table-card__actions">${waBtn}${courierBtn}</div>`
      : '';
    const pickupBlock = isPickup
      ? `
        <span class="table-card__badge${entry.orderType === 'butcher' ? ' table-card__badge--butcher' : ''}${isDelivery ? ' table-card__badge--delivery' : ''}${!isDelivery && entry.orderType === 'takeaway' ? ' table-card__badge--pickup' : ''}">${escapeHtml(badgeText)}</span>
        <span class="table-card__customer">${escapeHtml(entry.order?.customerName || '—')}</span>
        <span class="table-card__phone" dir="ltr">${escapeHtml(customerPhone || '—')}</span>
        ${cardActions}
        ${(entry.orderType === 'takeaway' || entry.orderType === 'butcher') && entry.order?.customerAddress
          ? (() => {
            const parts = splitDeliveryAddress(entry.order.customerAddress);
            const street = parts.address || '';
            const loc = parts.locationUrl
              ? locationLinkHtml(parts.locationUrl, 'מיקום')
              : '';
            if (!street && !loc) return '';
            return `<span class="table-card__pickup">${
              street ? `כתובת: ${escapeHtml(street)}` : ''
            }${street && loc ? ' · ' : ''}${loc}</span>`;
          })()
          : ''}
        <span class="table-card__pickup">${isDelivery ? 'משלוח' : 'איסוף'}: ${escapeHtml(formatPickupLabel(entry.order))}</span>
      `
      : (dineRes.reserved
        ? `<span class="table-card__customer">${escapeHtml(dineRes.name)}${
          dineRes.party ? ` · ${escapeHtml(String(dineRes.party))}` : ''
        }</span>`
        : '');
    const tag = isPickup ? 'article' : 'button';
    const typeAttr = isPickup ? '' : ' type="button"';
    const roleAttr = isPickup ? ' role="button" tabindex="0"' : '';
    return `
      <${tag}${typeAttr}
        class="table-card table-card--${escapeHtml(entry.uiStatus)}${isPickup ? ' table-card--pickup' : ''}${dineRes.reserved ? ' table-card--reserved' : ''}"
        data-entry-key="${escapeAttr(entryKey(entry))}"${roleAttr}
      >
        <span class="table-card__num${dineRes.reserved ? ' table-card__num--hug' : ''}">${
          isPickup
            ? escapeHtml(
              entry.order?.publicOrderNo != null
                ? `#${entry.order.publicOrderNo}`
                : 'TA'
            )
            : `${dineRes.reserved ? '<span class="table-card__hug" aria-hidden="true">🤗</span>' : ''}${escapeHtml(String(entry.tableNumber))}`
        }</span>
        <span class="table-card__status">${escapeHtml(statusLabel(entry.uiStatus))}</span>
        <span class="table-card__type">${escapeHtml(orderTypeLabel(entry.orderType, entry.order))}</span>
        ${
          entry.uiStatus === 'waiter_called'
            ? `<span class="table-card__waiter">${escapeHtml(waiterNeedsLabel(entry.order))}</span>`
            : ''
        }
        ${pickupBlock}
        <span class="table-card__total">${free ? '€0' : escapeHtml(formatMoney(entry.total))}</span>
        <span class="table-card__items">${free ? '0 פריטים' : `${entry.itemCount} פריטים`}</span>
        ${
          coupon
            ? `<span class="table-card__coupon">קופון −${escapeHtml(String(discountPct != null ? discountPct : ''))}%</span>`
            : ''
        }
        <span class="table-card__time">${
          free
            ? '—'
            : `נפתח ${escapeHtml(formatClock(entry.openedAt))} · ${escapeHtml(formatElapsed(entry.openedAt))}`
        }</span>
      </${tag}>
    `;
  }

  function setDrawerView(view) {
    menuMode = view === 'menu';
    if (drawerDetail) drawerDetail.hidden = menuMode;
    if (drawerBody) drawerBody.hidden = menuMode;
    if (drawerMenu) drawerMenu.hidden = !menuMode;
  }

  function buildDrawerItemGroups(items) {
    const list = (Array.isArray(items) ? items : []).filter((item) => item && Number(item.qty) > 0);
    const sidesByParent = new Map();
    list.forEach((item) => {
      const parentId = item.linkedToMainItemId ? String(item.linkedToMainItemId) : '';
      if (!parentId) return;
      if (!sidesByParent.has(parentId)) sidesByParent.set(parentId, []);
      sidesByParent.get(parentId).push(item);
    });

    const usedSideIds = new Set();
    const groups = [];

    list.forEach((item) => {
      if (item.linkedToMainItemId) return;
      const id = String(item.itemId || '');
      const sides = (sidesByParent.get(id) || []).slice();
      sides.forEach((side) => usedSideIds.add(String(side.itemId)));
      groups.push({
        kind: sides.length ? 'main-group' : 'single',
        main: item,
        sides,
      });
    });

    list.forEach((item) => {
      if (!item.linkedToMainItemId) return;
      if (usedSideIds.has(String(item.itemId))) return;
      groups.push({ kind: 'single', main: item, sides: [] });
    });

    return groups;
  }

  function isShakeBaseProduct(productId) {
    return Boolean(window.SHAKE_BASE_IDS?.has?.(String(productId || '')));
  }

  function isLimonanaAlcoholProduct(productId) {
    return Boolean(window.LIMONANA_ALCOHOL_IDS?.has?.(String(productId || '')));
  }

  function isFruitShakeProduct(productId) {
    return String(productId || '') === String(window.FRUIT_SHAKE_ID || 'fruit-shake');
  }

  function isLimonanaProduct(productId) {
    return String(productId || '') === String(window.LIMONANA_ID || 'limonana');
  }

  function renderDrawerItemLine(item, options = {}) {
    const isSide = Boolean(options.isSide);
    const lateClass = item.isLateAdd ? ' table-drawer__item--late' : '';
    const sideClass = isSide ? ' table-drawer__item--side' : '';
    const nameLate = item.isLateAdd ? ' table-drawer__name--late' : '';
    const sideBadge = isShakeBaseProduct(item.productId)
      ? 'בסיס'
      : (isLimonanaAlcoholProduct(item.productId) ? 'אלכוהול' : 'תוספת');
    const isPack = String(item.unitType || '') === 'pack';
    const thawRaw = Number(item.thawCount);
    const thawLabel = isPack && Number.isFinite(thawRaw)
      ? `<span class="table-drawer__thaw">להפשיר: ${escapeHtml(String(Math.max(0, Math.floor(thawRaw))))}</span>`
      : '';
    const qtyLabel = isPack
      ? `${escapeHtml(String(item.qty))} חבילות`
      : `${escapeHtml(String(item.qty))}×`;
    const priceHtml = isPack
      ? (item.pricePerKg != null
        ? `<span class="table-drawer__price">${escapeHtml(formatMoney(item.pricePerKg))}/ק״ג</span>`
        : '')
      : (isSide && !(Number(item.price) > 0)
        ? ''
        : escapeHtml(formatMoney((Number(item.price) || 0) * (Number(item.qty) || 0))));
    return `
      <div class="table-drawer__line${sideClass}${lateClass}">
        ${isSide ? `<span class="table-drawer__side-badge">${sideBadge}</span>` : ''}
        <span class="table-drawer__qty">${qtyLabel}</span>
        <span class="table-drawer__name${nameLate}">${escapeHtml(item.name || item.productId || '')}</span>
        <span class="table-drawer__price">${priceHtml}</span>
        ${item.itemId
          ? `<button
              type="button"
              class="table-drawer__remove"
              data-remove-item-id="${escapeHtml(String(item.itemId))}"
              aria-label="הסר"
              title="הסר"
            >×</button>`
          : ''}
      </div>
      ${thawLabel}
      ${item.notes ? `<p class="table-drawer__notes" dir="auto">${escapeHtml(item.notes)}</p>` : ''}
    `;
  }

  function renderDrawerItemsHtml(items) {
    const groups = buildDrawerItemGroups(items);
    if (!groups.length) {
      return `<p class="table-drawer__empty">אין פריטים בהזמנה</p>`;
    }

    return `
      <ul class="table-drawer__list">
        ${groups.map((group) => {
          const lateClass = group.main.isLateAdd ? ' table-drawer__item--late' : '';
          if (group.kind === 'main-group') {
            const sideNames = group.sides
              .map((side) => side.name || side.productId || '')
              .filter(Boolean)
              .join(', ');
            return `
              <li class="table-drawer__group${lateClass}">
                ${renderDrawerItemLine(group.main)}
                ${sideNames
                  ? `<p class="table-drawer__served">מוגש עם: ${escapeHtml(sideNames)}</p>`
                  : ''}
                <div class="table-drawer__sides">
                  ${group.sides.map((side) => renderDrawerItemLine(side, { isSide: true })).join('')}
                </div>
              </li>
            `;
          }
          return `
            <li class="${lateClass}">
              ${renderDrawerItemLine(group.main)}
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }

  function fillDrawer(entry) {
    const order = entry.order;
    if (!order || !drawer) return;

    if (drawerTitle) {
      if (entry.orderType === 'butcher') {
        drawerTitle.textContent = isDeliveryOrder(order)
          ? '🚚 חנות בשר · משלוח'
          : 'חנות בשר';
      } else if (entry.orderType === 'takeaway') {
        const no = order.publicOrderNo != null ? ` #${order.publicOrderNo}` : '';
        drawerTitle.textContent = `${isDeliveryOrder(order) ? '🚚 משלוח' : '🛍️ איסוף עצמי'}${no}`;
      } else {
        drawerTitle.textContent = `שולחן ${entry.tableNumber}`;
      }
    }

    const closeTableBtn = drawer?.querySelector('[data-table-action="close-table"]');
    if (closeTableBtn) {
      if (entry.orderType === 'takeaway' && isDeliveryOrder(order)) {
        closeTableBtn.textContent = 'סגור משלוח';
      } else if (entry.orderType === 'takeaway' || entry.orderType === 'butcher') {
        closeTableBtn.textContent = 'סגור הזמנה';
      } else {
        closeTableBtn.textContent = 'סגור שולחן';
      }
    }
    if (drawerType) {
      drawerType.textContent = menuMode
        ? `${orderTypeLabel(entry.orderType, order)} · הוספת מנות`
        : `${orderTypeLabel(entry.orderType, order)} · ${statusLabel(entry.uiStatus)}`;
    }

    if (drawerMeta) {
      if (entry.orderType === 'butcher') {
        const delivery = isDeliveryOrder(order);
        const pickupAsap = order.pickupType === 'ASAP' || !order.pickupTime;
        const dateLabel = (() => {
          const raw = String(order.pickupDate || '');
          const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          return m ? `${m[3]}/${m[2]}/${m[1]}` : (raw || '—');
        })();
        const fee = Number(order.deliveryFee);
        drawerMeta.innerHTML = `
          <div class="table-drawer__pickup">
            <div class="table-drawer__pickup-badge table-drawer__pickup-badge--butcher">${
              delivery ? '🚚 חנות בשר · משלוח' : 'חנות בשר'
            }</div>
            <div class="table-drawer__pickup-grid">
              <div class="table-drawer__pickup-row">
                <span>שם</span>
                <strong>${escapeHtml(order.customerName || '—')}</strong>
              </div>
              <div class="table-drawer__pickup-row">
                <span>טלפון</span>
                <strong dir="ltr">${escapeHtml(order.customerPhone || '—')}</strong>
              </div>
              <div class="table-drawer__pickup-row">
                <span>סוג הזמנה</span>
                <strong>${escapeHtml(delivery ? 'משלוח' : 'איסוף עצמי')}</strong>
              </div>
              ${delivery
                ? `${deliveryAddressRowsHtml(order.customerAddress, { showEmpty: true })}
                  <div class="table-drawer__pickup-row">
                    <span>עלות משלוח</span>
                    <strong>${escapeHtml(Number.isFinite(fee) ? formatMoney(fee) : '€10')}</strong>
                  </div>`
                : ''}
              <div class="table-drawer__pickup-row">
                <span>${delivery ? 'משלוח' : 'איסוף'}</span>
                <strong>${escapeHtml(pickupAsap ? 'בהקדם האפשרי' : dateLabel)}</strong>
              </div>
              ${pickupAsap ? '' : `
              <div class="table-drawer__pickup-row">
                <span>שעה</span>
                <strong dir="ltr">${escapeHtml(order.pickupTime || '—')}</strong>
              </div>`}
              ${order.customerNotes
                ? `<div class="table-drawer__pickup-row">
                    <span>הערות</span>
                    <strong dir="auto">${escapeHtml(order.customerNotes)}</strong>
                  </div>`
                : ''}
            </div>
          </div>
        `;
      } else if (entry.orderType === 'takeaway') {
        const delivery = isDeliveryOrder(order);
        const pickupAsap = order.pickupType === 'ASAP' || !order.pickupTime;
        const dateLabel = (() => {
          const raw = String(order.pickupDate || '');
          const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          return m ? `${m[3]}/${m[2]}/${m[1]}` : (raw || '—');
        })();
        drawerMeta.innerHTML = `
          <div class="table-drawer__pickup">
            <div class="table-drawer__pickup-badge${delivery ? ' table-drawer__pickup-badge--delivery' : ' table-drawer__pickup-badge--pickup'}">${
              delivery ? '🚚 משלוח' : '🛍️ איסוף עצמי'
            }${
              order.publicOrderNo != null
                ? ` · #${escapeHtml(String(order.publicOrderNo))}`
                : ''
            }</div>
            <div class="table-drawer__pickup-grid">
              ${order.publicOrderNo != null
                ? `<div class="table-drawer__pickup-row">
                    <span>מס׳ הזמנה</span>
                    <strong>#${escapeHtml(String(order.publicOrderNo))}</strong>
                  </div>`
                : ''}
              <div class="table-drawer__pickup-row">
                <span>שם הלקוח</span>
                <strong>${escapeHtml(order.customerName || '—')}</strong>
              </div>
              ${delivery || order.customerAddress
                ? deliveryAddressRowsHtml(order.customerAddress, { showEmpty: delivery })
                : ''}
              <div class="table-drawer__pickup-row">
                <span>טלפון</span>
                <strong dir="ltr">${escapeHtml(order.customerPhone || '—')}</strong>
              </div>
              <div class="table-drawer__pickup-row">
                <span>${delivery ? 'משלוח' : 'איסוף'}</span>
                <strong>${escapeHtml(pickupAsap ? 'בהקדם האפשרי' : dateLabel)}</strong>
              </div>
              ${pickupAsap ? '' : `
              <div class="table-drawer__pickup-row">
                <span>שעה</span>
                <strong dir="ltr">${escapeHtml(order.pickupTime || '—')}</strong>
              </div>`}
              ${order.customerNotes
                ? `<div class="table-drawer__pickup-row">
                    <span>הערות</span>
                    <strong class="table-drawer__customer-notes" dir="auto">${escapeHtml(order.customerNotes)}</strong>
                  </div>`
                : ''}
            </div>
          </div>
          <div class="table-drawer__meta-row">
            <div class="table-drawer__meta-item"><span>שעת פתיחה</span><strong>${escapeHtml(formatClock(entry.openedAt))}</strong></div>
            <div class="table-drawer__meta-item"><span>משך</span><strong>${escapeHtml(formatElapsed(entry.openedAt))}</strong></div>
            <div class="table-drawer__meta-item"><span>פריטים</span><strong>${escapeHtml(String(entry.itemCount))}</strong></div>
          </div>
        `;
      } else {
        const dineRes = dineInReservationFromOrder(order);
        const extraNotes = stripPlaceResFromNotes(order.customerNotes);
        const waiterOn = Boolean(order.waiterCalled);
        drawerMeta.innerHTML = `
          ${waiterOn
            ? `<div class="table-drawer__waiter">
                <p class="table-drawer__waiter-title">השולחן קרא למלצר</p>
                <p class="table-drawer__waiter-needs">${escapeHtml(waiterNeedsLabel(order))}</p>
              </div>`
            : ''}
          <div class="table-drawer__pickup">
            <div class="table-drawer__pickup-grid">
              ${dineRes.reserved
                ? `<div class="table-drawer__pickup-row">
                    <span>שם ההזמנה</span>
                    <strong dir="auto">${escapeHtml(dineRes.name)}</strong>
                  </div>`
                : ''}
              ${dineRes.party
                ? `<div class="table-drawer__pickup-row">
                    <span>סועדים</span>
                    <strong>${escapeHtml(String(dineRes.party))}</strong>
                  </div>`
                : ''}
              <div class="table-drawer__pickup-row">
                <strong class="table-drawer__customer-notes" dir="auto">${escapeHtml(
                  extraNotes ? `הערות: ${extraNotes}` : formatDineInNotesLabel(order)
                )}</strong>
              </div>
            </div>
          </div>
          <div class="table-drawer__meta-row">
            <div class="table-drawer__meta-item"><span>שעת פתיחה</span><strong>${escapeHtml(formatClock(entry.openedAt))}</strong></div>
            <div class="table-drawer__meta-item"><span>משך</span><strong>${escapeHtml(formatElapsed(entry.openedAt))}</strong></div>
            <div class="table-drawer__meta-item"><span>פריטים</span><strong>${escapeHtml(String(entry.itemCount))}</strong></div>
          </div>
        `;
      }
    }

    if (drawerItems) {
      drawerItems.innerHTML = renderDrawerItemsHtml(order.items);
    }

    if (drawerTotal) {
      const order = entry.order;
      const products = calcOrderProductsPayable(order);
      const fee = getOrderDeliveryFee(order);
      const payable = calcOrderPaidTotal(order);
      const showDeliveryLine = fee > 0;

      if (order?.couponCode && order.discountAmount != null) {
        const beforeDiscount = calcOrderSubtotal(order);
        drawerTotal.innerHTML = `
          <div class="table-drawer__coupon">
            <span>קופון</span>
            <strong dir="ltr">${escapeHtml(order.couponCode)}</strong>
          </div>
          <div class="table-drawer__total-line"><span>לפני הנחה</span><strong>${escapeHtml(formatMoney(beforeDiscount))}</strong></div>
          <div class="table-drawer__total-line"><span>הנחה (${escapeHtml(String(order.discountPercent))}%)</span><strong>−${escapeHtml(formatMoney(order.discountAmount))}</strong></div>
          <div class="table-drawer__total-line"><span>מוצרים</span><strong>${escapeHtml(formatMoney(products))}</strong></div>
          ${showDeliveryLine
            ? `<div class="table-drawer__total-line table-drawer__total-line--delivery"><span>משלוח</span><strong>${escapeHtml(formatMoney(fee))}</strong></div>`
            : ''}
          <div class="table-drawer__total-line table-drawer__total-line--pay"><span>סה״כ לתשלום</span><strong>${escapeHtml(formatMoney(payable))}</strong></div>
        `;
      } else if (showDeliveryLine) {
        drawerTotal.innerHTML = `
          <div class="table-drawer__total-line"><span>מוצרים</span><strong>${escapeHtml(formatMoney(products))}</strong></div>
          <div class="table-drawer__total-line table-drawer__total-line--delivery"><span>משלוח</span><strong>${escapeHtml(formatMoney(fee))}</strong></div>
          <div class="table-drawer__total-line table-drawer__total-line--pay"><span>סה״כ לתשלום</span><strong>${escapeHtml(formatMoney(payable))}</strong></div>
        `;
      } else {
        drawerTotal.innerHTML = `<span>סה״כ לתשלום</span><strong>${escapeHtml(formatMoney(payable))}</strong>`;
      }
    }

    updateApprovePrintButton(entry);
    updateWaiterArrivedButton(entry);
  }

  function updateApprovePrintButton(entry) {
    const approveBtn = document.getElementById('table-approve-order');
    const printBtn = document.getElementById('table-print-order');
    const approvePrintBtn = document.getElementById('table-approve-print-order');
    const remote = entry?.order?._remoteOrders || [];
    const needsApprove = hasOrdersNeedingApprove(remote);
    const isDineIn = entry?.orderType !== 'takeaway' && entry?.orderType !== 'butcher';

    if (isDineIn) {
      if (approveBtn) approveBtn.hidden = true;
      if (printBtn) printBtn.hidden = true;
      if (approvePrintBtn) {
        approvePrintBtn.hidden = false;
        approvePrintBtn.disabled = approvePrintBusy;
        approvePrintBtn.textContent = needsApprove ? 'אשר והדפס' : 'הדפס';
      }
      return;
    }

    if (approvePrintBtn) approvePrintBtn.hidden = true;
    if (approveBtn) {
      approveBtn.hidden = !needsApprove;
      approveBtn.disabled = approvePrintBusy;
    }
    if (printBtn) {
      printBtn.hidden = false;
      printBtn.disabled = approvePrintBusy;
    }
  }

  function updateWaiterArrivedButton(entry) {
    const btn = document.getElementById('table-waiter-arrived');
    if (!btn) return;
    const dineIn = entry?.orderType !== 'takeaway' && entry?.orderType !== 'butcher';
    const on = dineIn && Boolean(entry?.order?.waiterCalled);
    btn.hidden = !on;
  }

  async function handleApproveAndPrint(entry) {
    if (approvePrintBusy || !entry?.order) return;
    const lockedKey = entryKey(entry);

    approvePrintBusy = true;
    suppressCustomerNotify();
    updateApprovePrintButton(entry);

    try {
      const remote = entry.order._remoteOrders || [];
      if (hasOrdersNeedingApprove(remote)) {
        const approved = await approvePendingOrders(entry);
        if (!approved) return;
      }

      /* Always print the same table/order we started with — never the newly selected card. */
      const fresh = findEntryByKey(lockedKey) || entry;
      await printPendingOrder(fresh);
    } catch (err) {
      console.error('[admin-tables] approve-and-print failed', err);
      showToast('האישור או ההדפסה נכשלו');
    } finally {
      approvePrintBusy = false;
      const next = getSelectedEntry();
      updateApprovePrintButton(next);
      if (entry.orderType === 'takeaway' || entry.orderType === 'butcher') {
        updatePendingReminder(boardCache, pickupCaches());
      }
    }
  }

  function suppressCustomerNotify(ms = 4500) {
    suppressNotifyUntil = Date.now() + Math.max(0, Number(ms) || 0);
  }

  const chatNotifyIds = new Set();

  function rememberChatNotifyId(id) {
    const key = String(id || '');
    if (!key) return false;
    if (chatNotifyIds.has(key)) return false;
    chatNotifyIds.add(key);
    if (chatNotifyIds.size > 120) {
      const oldest = chatNotifyIds.values().next().value;
      chatNotifyIds.delete(oldest);
    }
    return true;
  }

  function getSharedAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = playOrderNotifyChime._ctx || playChatNotifyChime._ctx || new Ctx();
    playOrderNotifyChime._ctx = ctx;
    playChatNotifyChime._ctx = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /** Short chat beep — not the order alert, and no reminder loop. */
  function playChatNotifyChime(messageId, opts) {
    if (!rememberChatNotifyId(messageId)) return;
    if (opts?.silent) return;
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const tones = [
        { freq: 1046, at: 0, dur: 0.07 },
        { freq: 1397, at: 0.08, dur: 0.1 },
      ];
      tones.forEach((tone) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.14, now + tone.at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (err) {
      console.warn('[admin-tables] chat chime failed', err);
    }
  }

  function playOrderNotifyChime() {
    try {
      if (Date.now() < suppressNotifyUntil) return;

      const stamp = Date.now();
      if (playOrderNotifyChime._last && stamp - playOrderNotifyChime._last < 1400) return;
      playOrderNotifyChime._last = stamp;

      const ctx = getSharedAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      /* Loud admin alert — customer events only (new order / bill request) */
      const tones = [
        { freq: 740, at: 0, dur: 0.22 },
        { freq: 988, at: 0.16, dur: 0.24 },
        { freq: 1174, at: 0.34, dur: 0.32 },
        { freq: 988, at: 0.58, dur: 0.28 },
      ];
      tones.forEach((tone) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.42, now + tone.at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (err) {
      console.warn('[admin-tables] notify chime failed', err);
    }
  }

  function collectBoardOrderIds(board, takeaway) {
    const ids = new Set();
    [...(board || []), ...(takeaway || [])].forEach((entry) => {
      (entry?.order?._remoteOrders || []).forEach((order) => {
        if (order?.id) ids.add(String(order.id));
      });
    });
    return ids;
  }

  function boardNeedsAdminAttention(board, takeaway) {
    const dineInNeeds = (board || []).some((entry) => (
      entry?.uiStatus === 'pending_print'
      || entry?.uiStatus === 'preparing'
    ));
    /* Takeaway / delivery / butcher: chime only until Approve — not while waiting for print */
    const pickupNeeds = (takeaway || []).some((entry) => (
      entry?.uiStatus === 'pending_print'
    ));
    return dineInNeeds || pickupNeeds;
  }

  function stopPendingReminder() {
    if (pendingReminderTimer) {
      window.clearInterval(pendingReminderTimer);
      pendingReminderTimer = null;
    }
  }

  /** Re-beep every 15s while cards still need Approve / print action (not bill). */
  function updatePendingReminder(board, takeaway) {
    const needsAttention = boardNeedsAdminAttention(board, takeaway);
    if (!needsAttention) {
      stopPendingReminder();
      return;
    }
    if (pendingReminderTimer) return;
    pendingReminderTimer = window.setInterval(() => {
      if (boardNeedsAdminAttention(boardCache, pickupCaches())) {
        playOrderNotifyChime();
      } else {
        stopPendingReminder();
      }
    }, 15000);
  }

  function syncKnownOrderIdsAfterBoardLoad(board, takeaway, shabbatOrderIds) {
    const current = collectBoardOrderIds(board, takeaway);
    (shabbatOrderIds || []).forEach((id) => {
      if (id) current.add(String(id));
    });
    if (!orderIdsSeeded) {
      current.forEach((id) => knownOrderIds.add(id));
      orderIdsSeeded = true;
      syncCustomerAttentionStatuses(board, takeaway);
      updatePendingReminder(board, takeaway);
      return;
    }

    let shouldChime = false;
    current.forEach((id) => {
      if (!knownOrderIds.has(id)) {
        knownOrderIds.add(id);
        shouldChime = true; /* customer sent a new order wave */
      }
    });
    if (syncCustomerAttentionStatuses(board, takeaway)) shouldChime = true;
    if (shouldChime) playOrderNotifyChime();
    updatePendingReminder(board, takeaway);
  }

  /**
   * Chime only on customer-driven attention: new pending print / bill request.
   * Admin actions (approve print, close table, remove dish) do NOT chime.
   * @returns {boolean}
   */
  function syncCustomerAttentionStatuses(board, takeaway) {
    const entries = [...(board || []), ...(takeaway || [])];
    const nextMap = new Map();
    let customerEvent = false;

    entries.forEach((entry) => {
      if (!entry) return;
      const key = entryKey(entry);
      const status = entry.uiStatus || 'free';
      nextMap.set(key, status);
      if (!entryStatusesSeeded) return;

      const prev = knownEntryStatuses.get(key);
      if (status === 'pending_print' && prev !== 'pending_print') {
        customerEvent = true;
      }
      if (status === 'waiter_called' && prev !== 'waiter_called') {
        customerEvent = true;
      }
      /* bill_requested: visual only — no chime */
    });

    knownEntryStatuses.clear();
    nextMap.forEach((status, key) => knownEntryStatuses.set(key, status));
    entryStatusesSeeded = true;
    return customerEvent;
  }

  /**
   * Map one Supabase order wave to print-engine shape.
   */
  function mapRemoteWaveToPrintOrder(sessionMeta, order, items) {
    const session = sessionMeta || {};
    const list = Array.isArray(items) ? items : [];
    const mappedItems = list
      .map((row) => {
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) return null;
        return {
          itemId: String(row.id),
          productId: String(row.product_id || ''),
          name: row.print_name || row.product_name || row.product_id || '',
          printName: row.print_name || '',
          price: Number(row.price) || 0,
          qty,
          notes: row.notes == null ? '' : String(row.notes),
          printed: false,
          linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
          createdAt: row.created_at || null,
          unitType: row.unit_type || null,
          pricePerKg: row.price_per_kg == null ? null : Number(row.price_per_kg),
          thawCount: row.thaw_count == null ? null : Number(row.thaw_count),
        };
      })
      .filter(Boolean);

    const rawSessionType = session.orderType || session.order_type || '';
    const isButcher = rawSessionType === 'butcher'
      || String(rawSessionType).toLowerCase().includes('butcher');
    const isTakeaway = rawSessionType === 'takeaway'
      || session.order_type === 'takeaway'
      || String(rawSessionType).toLowerCase().includes('take');
    const resolvedType = isButcher ? 'butcher' : (isTakeaway ? 'takeaway' : 'dinein');

    return {
      orderId: String(order.id),
      sessionId: String(order.session_id || session.sessionId || ''),
      tableNumber: (isTakeaway || isButcher)
        ? null
        : (session.tableNumber != null
          ? Number(session.tableNumber)
          : (session.table_number == null ? null : Number(session.table_number))),
      orderType: resolvedType,
      status: 'active',
      createdAt: order.created_at || null,
      updatedAt: order.updated_at || null,
      items: mappedItems,
      ticketSeq: Number(order.order_number) || 1,
      customerName: session.customerName || session.customer_name || null,
      customerAddress: session.customerAddress || session.customer_address || null,
      fulfillmentType: session.fulfillmentType
        || (session.fulfillment_type === 'delivery' ? 'delivery' : (session.fulfillment_type === 'pickup' ? 'pickup' : null)),
      customerPhone: session.customerPhone || session.customer_phone || null,
      customerNotes: session.customerNotes || session.notes || null,
      pickupType: session.pickupType || session.pickup_type || null,
      pickupTime: session.pickupTime || session.pickup_time || null,
      pickupDate: session.pickupDate || session.pickup_date || null,
      deliveryFee: session.deliveryFee != null
        ? Number(session.deliveryFee)
        : (session.delivery_fee != null ? Number(session.delivery_fee) : null),
      publicOrderNo: session.publicOrderNo != null
        ? Number(session.publicOrderNo)
        : (session.public_order_no != null ? Number(session.public_order_no) : null),
      _skipLocalMarkPrinted: true,
      _supabaseOrderId: String(order.id),
    };
  }

  async function handleRemoveOrderItem(itemId) {
    const id = String(itemId || '');
    if (!id || removeItemBusy) return;

    const entry = getSelectedEntry();
    if (!entry?.order) return;

    const item = (entry.order.items || []).find((row) => String(row.itemId) === id);
    if (!item) return;

    const have = Math.floor(Number(item.qty) || 0);
    /* More than one unit → ask how many to remove (same qty modal as add). */
    if (have > 1) {
      openAdminRemoveQtyModal(item);
      return;
    }

    const label = item?.name || item?.productId || 'מנה';
    const isShakeBase = isShakeBaseProduct(item?.productId);
    const isLimonanaAlcohol = isLimonanaAlcoholProduct(item?.productId);
    const isShakeParent = isFruitShakeProduct(item?.productId)
      && !(item?.linkedToMainItemId);
    const isLimonanaParent = isLimonanaProduct(item?.productId)
      && !(item?.linkedToMainItemId);
    const linkedKids = (isShakeParent || isLimonanaParent)
      ? (entry.order.items || []).filter((row) => String(row.linkedToMainItemId || '') === id)
      : [];

    let ask = `האם אתה בטוח שברצונך להסיר את "${label}" מההזמנה?`;
    if (isShakeBase) {
      ask = `להסיר את בסיס השייק "${label}" מההזמנה?`;
    } else if (isLimonanaAlcohol) {
      ask = `להסיר את בחירת האלכוהול "${label}" מההזמנה?`;
    } else if (isShakeParent) {
      ask = linkedKids.length
        ? `להסיר את שייק הפירות ואת הבסיס שנבחר (${linkedKids.map((k) => k.name).filter(Boolean).join(', ') || 'בסיס'})?`
        : `להסיר את שייק הפירות מההזמנה?`;
    } else if (isLimonanaParent) {
      ask = linkedKids.length
        ? `להסיר את הלימונענע ואת בחירת האלכוהול (${linkedKids.map((k) => k.name).filter(Boolean).join(', ') || 'כן/לא'})?`
        : `להסיר את הלימונענע מההזמנה?`;
    }

    const ok = await showConfirmModal(ask, {
      yesLabel: 'כן, הסר',
    });
    if (!ok) return;

    await commitRemoveQuantity(id, 1);
  }

  async function commitRemoveQuantity(itemId, removeQty) {
    const id = String(itemId || '');
    if (!id || removeItemBusy) return false;

    const entry = getSelectedEntry();
    if (!entry?.order) return false;

    const item = (entry.order.items || []).find((row) => String(row.itemId) === id);
    if (!item) return false;

    const have = Math.floor(Number(item.qty) || 0);
    const qty = Math.min(Math.max(1, Math.floor(Number(removeQty) || 0)), have);
    if (qty < 1 || have < 1) return false;

    const api = OrdersApi();
    if (!api?.deleteOrderItem) {
      showToast('מחיקה לא זמינה');
      return false;
    }

    const isShakeBase = isShakeBaseProduct(item?.productId);
    const linkedKids = (entry.order.items || []).filter(
      (row) => String(row.linkedToMainItemId || '') === id
    );

    removeItemBusy = true;
    suppressCustomerNotify(8000);
    try {
      if (qty >= have) {
        await api.deleteOrderItem(id);
      } else {
        if (typeof api.bumpOrderItemQuantity !== 'function') {
          showToast('הפחתת כמות לא זמינה');
          return false;
        }
        await api.bumpOrderItemQuantity(id, -qty);
        for (const kid of linkedKids) {
          const kidHave = Math.floor(Number(kid.qty) || 0);
          if (kidHave <= 0) continue;
          if (kidHave <= qty) {
            await api.deleteOrderItem(kid.itemId);
          } else {
            await api.bumpOrderItemQuantity(kid.itemId, -qty);
          }
        }
      }
      showToast(isShakeBase ? 'בסיס השייק הוסר' : (qty > 1 ? `${qty} מנות הוסרו` : 'המנה הוסרה'));
      await refreshBoardData();
      updatePendingReminder(boardCache, pickupCaches());
      const next = getSelectedEntry();
      if (next?.order) {
        fillDrawer(next);
      } else {
        closeDrawer();
      }
      return true;
    } catch (err) {
      console.error('[admin-tables] remove quantity failed', err);
      showToast('לא ניתן להסיר את המנה');
      return false;
    } finally {
      removeItemBusy = false;
    }
  }

  async function approvePendingOrders(entry) {
    const api = OrdersApi();
    if (!api?.markOrderApproved) {
      showToast('אישור לא זמין');
      return false;
    }

    const remoteOrders = (entry.order._remoteOrders || [])
      .filter(orderNeedsApprove)
      .sort((a, b) => (Number(a.order_number) || 0) - (Number(b.order_number) || 0));

    if (!remoteOrders.length) {
      showToast('אין הזמנות ממתינות לאישור');
      await refreshBoardData().catch(() => {});
      return false;
    }

    suppressCustomerNotify(8000);
    if (entry.orderType === 'takeaway' || entry.orderType === 'butcher') {
      stopPendingReminder();
    }

    for (const order of remoteOrders) {
      await api.markOrderApproved(order.id);
    }
    showToast('ההזמנה אושרה · בהכנה');
    await refreshBoardData();
    const next = findEntryByKey(entryKey(entry));
    if (next?.order) fillDrawer(next);
    return true;
  }

  async function handleApproveOrder(entry) {
    if (approvePrintBusy || !entry?.order) return;

    approvePrintBusy = true;
    updateApprovePrintButton(entry);

    try {
      await approvePendingOrders(entry);
    } catch (err) {
      console.error('[admin-tables] approve-order failed', err);
      showToast('האישור נכשל');
    } finally {
      approvePrintBusy = false;
      const next = getSelectedEntry();
      updateApprovePrintButton(next);
      if (entry.orderType === 'takeaway' || entry.orderType === 'butcher') {
        updatePendingReminder(boardCache, pickupCaches());
      }
    }
  }

  /**
   * Kitchen/bar ticket: only blue (late-add / unprinted wave) items when present.
   * If nothing is pending (reprint), fall back to the full order.
   * Always keep linked children/parents of those lines (hamburger drink + doneness).
   */
  function withLinkedCompanions(sourceItems, liveItems) {
    const live = Array.isArray(liveItems) ? liveItems : [];
    const out = [];
    const ids = new Set();

    function add(row) {
      const id = String(row?.itemId || '');
      if (!id || ids.has(id)) return false;
      ids.add(id);
      out.push(row);
      return true;
    }

    (Array.isArray(sourceItems) ? sourceItems : []).forEach(add);

    let grew = true;
    while (grew) {
      grew = false;
      live.forEach((row) => {
        const id = String(row?.itemId || '');
        if (!id || ids.has(id) || Number(row?.qty) <= 0) return;
        const parentId = row.linkedToMainItemId ? String(row.linkedToMainItemId) : '';
        if (parentId && ids.has(parentId)) {
          if (add(row)) grew = true;
          return;
        }
        if (!parentId && out.some((item) => String(item.linkedToMainItemId || '') === id)) {
          if (add(row)) grew = true;
        }
      });
    }

    return out;
  }

  function mapEntryToPrintOrder(entry) {
    const order = entry?.order;
    if (!order) return null;

    const liveItems = (order.items || []).filter((row) => Number(row.qty) > 0);
    const lateItems = liveItems.filter((row) => row && row.isLateAdd);
    /* Blue = new since last print → print only those. Else full reprint. */
    const sourceItems = withLinkedCompanions(
      lateItems.length ? lateItems : liveItems,
      liveItems
    );

    const items = sourceItems
      .map((row) => ({
        itemId: String(row.itemId),
        productId: String(row.productId || ''),
        name: row.printName || row.name || row.productId || '',
        printName: row.printName || '',
        price: Number(row.price) || 0,
        qty: Number(row.qty) || 0,
        notes: row.notes == null ? '' : String(row.notes),
        printed: false,
        linkedToMainItemId: row.linkedToMainItemId || null,
        unitType: row.unitType || null,
        pricePerKg: row.pricePerKg == null ? null : Number(row.pricePerKg),
        thawCount: row.thawCount == null ? null : Number(row.thawCount),
      }))
      .filter((row) => row.qty > 0);

    const remoteOrders = order._remoteOrders || [];
    const unprintedWaves = remoteOrders.filter(orderNeedsPrint);
    const waveForSeq = (unprintedWaves.length ? unprintedWaves : remoteOrders).reduce(
      (max, row) => Math.max(max, Number(row.order_number) || 0),
      0
    );
    const isButcher = entry.orderType === 'butcher';
    const isTakeaway = entry.orderType === 'takeaway';
    const resolvedType = isButcher ? 'butcher' : (isTakeaway ? 'takeaway' : 'dinein');

    return {
      orderId: `print-${order._supabaseSessionId || order.sessionId || entry.tableNumber || 'order'}`,
      sessionId: String(order._supabaseSessionId || order.sessionId || ''),
      tableNumber: (isTakeaway || isButcher)
        ? null
        : (entry.tableNumber != null ? Number(entry.tableNumber) : null),
      orderType: resolvedType,
      status: 'active',
      createdAt: order.createdAt || null,
      updatedAt: order.updatedAt || null,
      items,
      ticketSeq: waveForSeq || 1,
      customerName: order.customerName || null,
      customerPhone: order.customerPhone || null,
      customerNotes: order.customerNotes || null,
      customerAddress: order.customerAddress || null,
      fulfillmentType: order.fulfillmentType || null,
      pickupType: order.pickupType || null,
      pickupTime: order.pickupTime || null,
      pickupDate: order.pickupDate || null,
      deliveryFee: order.deliveryFee == null ? null : Number(order.deliveryFee),
      publicOrderNo: order.publicOrderNo != null ? Number(order.publicOrderNo) : null,
      _skipLocalMarkPrinted: true,
      _deltaOnly: lateItems.length > 0,
    };
  }

  async function printPendingOrder(entry) {
    if (!entry?.order) return false;

    const api = OrdersApi();
    const print = window.LechaimPrintEngine;
    if (typeof print?.printOrder !== 'function') {
      showToast('הדפסה לא זמינה');
      return false;
    }

    const synthetic = mapEntryToPrintOrder(entry);
    if (!synthetic?.items?.length) {
      showToast('אין פריטים להדפסה');
      return false;
    }

    suppressCustomerNotify();

    let printedOk = false;
    try {
      const ok = await print.printOrder(synthetic);
      if (ok !== true) {
        console.error('[admin-tables] printOrder returned', ok);
        showToast('ההדפסה נכשלה — נסה שוב');
        return false;
      }

      const waves = wavesToMarkPrinted(entry);
      waves.forEach((order) => rememberLocallyPrinted(order.id));

      if (api?.markOrderPrinted && waves.length) {
        const failedIds = [];
        for (const order of waves) {
          let marked = false;
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
              await api.markOrderPrinted(order.id);
              marked = true;
              break;
            } catch (markErr) {
              console.warn('[admin-tables] markOrderPrinted attempt', attempt, markErr);
              if (attempt < 3) {
                await new Promise((resolve) => window.setTimeout(resolve, 400 * attempt));
              }
            }
          }
          if (!marked) failedIds.push(order.id);
        }

        if (failedIds.length) {
          console.error('[admin-tables] printed on paper but status sync failed', failedIds);
          failedIds.forEach((id) => {
            window.setTimeout(() => {
              api.markOrderPrinted(id).catch((err) => {
                console.warn('[admin-tables] delayed markOrderPrinted failed', err);
              });
            }, 2500);
          });
        }
      }

      printedOk = true;
    } catch (err) {
      console.error('[admin-tables] print-order failed', err);
      showToast('ההדפסה נכשלה');
      return false;
    }

    if (!printedOk) return false;

    showToast('ההזמנה הודפסה', { checkOnly: true });
    closeDrawer();
    try {
      await refreshBoardData();
    } catch (err) {
      console.warn('[admin-tables] refresh after print-order failed', err);
    }
    return true;
  }

  async function handlePrintOrder(entry) {
    if (approvePrintBusy || !entry?.order) return;

    approvePrintBusy = true;
    updateApprovePrintButton(entry);

    try {
      await printPendingOrder(entry);
    } finally {
      approvePrintBusy = false;
      const next = getSelectedEntry();
      updateApprovePrintButton(next);
    }
  }

  function renderMenuPicker() {
    const catalog = catalogCache.length ? catalogCache : loadCatalog();
    const categories = getCategories(catalog);
    const query = menuQuery.trim().toLowerCase();

    if (menuCats) {
      const chips = [
        { id: 'all', title: 'הכל' },
        ...categories,
      ];
      menuCats.innerHTML = chips.map((cat) => `
        <button
          type="button"
          class="table-menu__cat${menuCategoryId === cat.id ? ' is-active' : ''}"
          data-menu-cat="${escapeAttr(cat.id)}"
          role="tab"
          aria-selected="${menuCategoryId === cat.id ? 'true' : 'false'}"
        >${escapeHtml(cat.title)}</button>
      `).join('');
    }

    if (!menuList) return;

    const entry = getSelectedEntry();
    const isDineInOrder = entry?.orderType === 'dinein'
      || entry?.orderType === 'dine-in'
      || entry?.orderType === 'dine_in';
    const visible = catalog.filter((item) => {
      if (item.dineInOnly && !isDineInOrder) return false;
      if (menuCategoryId !== 'all' && item.categoryId !== menuCategoryId) return false;
      if (!query) return true;
      const hay = `${item.name || ''} ${item.categoryTitle || ''}`.toLowerCase();
      return hay.includes(query);
    });

    if (!visible.length) {
      menuList.innerHTML = `<p class="table-drawer__empty">לא נמצאו מנות</p>`;
      return;
    }

    let lastCat = null;
    const parts = [];
    visible.forEach((item) => {
      const catId = item.categoryId || 'other';
      if (menuCategoryId === 'all' && catId !== lastCat) {
        lastCat = catId;
        parts.push(`<h3 class="table-menu__section">${escapeHtml(item.categoryTitle || catId)}</h3>`);
      }

      const available = item.available !== false;
      const priceLabel = item.price == null || Number(item.price) === 0
        ? 'כלול'
        : formatMoney(item.price);

      parts.push(`
        <div class="table-menu__item${!available ? ' is-unavailable' : ''}${item.adminOnly ? ' is-admin-only' : ''}">
          <div class="table-menu__item-text">
            <strong>${escapeHtml(item.name || item.id)}</strong>
            <span>${escapeHtml(priceLabel)}</span>
            ${item.adminOnly ? '<em class="table-menu__admin-only">אדמין בלבד</em>' : ''}
            ${!available ? '<em>אין במלאי</em>' : ''}
          </div>
          <button
            type="button"
            class="admin-btn admin-btn--soft table-menu__add"
            data-add-product="${escapeAttr(item.id)}"
            ${available ? '' : 'disabled'}
          >הוסף</button>
        </div>
      `);
    });

    menuList.innerHTML = parts.join('');
  }

  function openMenuPicker() {
    loadCatalog();
    menuCategoryId = 'all';
    menuQuery = '';
    if (menuSearch) menuSearch.value = '';
    setDrawerView('menu');
    const entry = getSelectedEntry();
    if (entry?.order) fillDrawer(entry);
    renderMenuPicker();
    menuSearch?.focus();
  }

  function closeMenuPicker() {
    setDrawerView('detail');
    const entry = getSelectedEntry();
    if (entry?.order) fillDrawer(entry);
  }

  function openDrawer(entry) {
    if (!entry?.order) {
      return;
    }
    if (!drawer) {
      console.error('[admin-tables] table drawer missing from DOM');
      return;
    }
    selectedKey = entryKey(entry);
    setDrawerView('detail');
    try {
      fillDrawer(entry);
    } catch (err) {
      console.error('[admin-tables] fillDrawer failed', err);
    }
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('table-drawer-open');
    setFocusTrap('drawer', drawer);
    requestAnimationFrame(() => drawerClose?.focus());
  }

  function closeDrawer() {
    selectedKey = null;
    menuMode = false;
    setDrawerView('detail');
    if (!drawer) return;
    clearFocusTrap('drawer');
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('table-drawer-open');
  }

  /**
   * Late-add stacking: after the first wave, keep appending into the latest
   * unprinted order (order_number > 1) so "2× cola" / several mains share one bon.
   */
  function findStackableLateAddOrder(remoteOrders) {
    const list = Array.isArray(remoteOrders) ? remoteOrders : [];
    const unprinted = list
      .filter((order) => order && order.id && !isRemoteOrderPrinted(order))
      .sort((a, b) => (Number(b.order_number) || 0) - (Number(a.order_number) || 0));
    const candidate = unprinted[0] || null;
    if (!candidate) return null;
    if ((Number(candidate.order_number) || 0) <= 1) return null;
    return candidate;
  }

  function findCatalogProduct(productId) {
    const catalog = catalogCache.length ? catalogCache : loadCatalog();
    const fromCatalog = catalog.find((item) => item.id === productId);
    if (fromCatalog) return fromCatalog;
    const hot = (window.HOT_SIDE_ITEMS || []).find((item) => item.id === productId);
    if (hot) {
      return {
        id: hot.id,
        name: hot.name,
        printName: hot.printName,
        price: Number(hot.price) || 0,
        image: hot.image || '',
        categoryId: 'hotSides',
        available: window.LechaimInventory?.isAvailable?.(hot.id) !== false,
      };
    }
    const shake = (window.SHAKE_BASE_ITEMS || []).find((item) => item.id === productId);
    if (shake) {
      return {
        id: shake.id,
        name: shake.name,
        printName: shake.printName,
        price: Number(shake.price) || 0,
        image: shake.image || '',
        categoryId: 'shakeBases',
        available: window.LechaimInventory?.isAvailable?.(shake.id) !== false,
      };
    }
    const limonanaAlcohol = (window.LIMONANA_ALCOHOL_ITEMS || []).find((item) => item.id === productId);
    if (limonanaAlcohol) {
      return {
        id: limonanaAlcohol.id,
        name: limonanaAlcohol.name,
        printName: limonanaAlcohol.printName,
        price: Number(limonanaAlcohol.price) || 0,
        image: limonanaAlcohol.image || '',
        categoryId: 'limonanaAlcohol',
        available: true,
      };
    }
    const doneness = (window.DONENESS_ITEMS || []).find((item) => item.id === productId);
    if (doneness) {
      return {
        id: doneness.id,
        name: doneness.name,
        printName: doneness.printName,
        price: 0,
        image: doneness.image || '',
        categoryId: 'doneness',
        available: true,
      };
    }
    return null;
  }

  function resolvePrintNameForProduct(product) {
    if (!product) return '';
    return window.LechaimPrintEngine?.resolvePrintName?.({
      productId: product.id,
      name: product.name,
      printName: product.printName,
    }) || product.printName || product.name || '';
  }

  function isAdminMainCourse(productId) {
    return Boolean(window.MAIN_COURSE_IDS?.has?.(productId));
  }

  function isAdminFruitShake(productId) {
    return productId === (window.FRUIT_SHAKE_ID || 'fruit-shake');
  }

  function isAdminLimonana(productId) {
    return productId === (window.LIMONANA_ID || 'limonana');
  }

  function isAdminHamburgerMeal(productId) {
    return productId === (window.HAMBURGER_MEAL_ID || 'hamburger-fries');
  }

  function isAdminEntrecoteSteak(productId) {
    return productId === (window.ENTRECOTE_STEAK_ID || 'staik-antarkot');
  }

  function isAdminDonenessParent(productId) {
    return isAdminEntrecoteSteak(productId) || isAdminHamburgerMeal(productId);
  }

  function productNeedsOptionPicker(productId) {
    return isAdminMainCourse(productId)
      || isAdminFruitShake(productId)
      || isAdminHamburgerMeal(productId)
      || isAdminLimonana(productId)
      || isAdminEntrecoteSteak(productId);
  }

  function getAdminDonenessOptions() {
    const source = (Array.isArray(window.DONENESS_ITEMS) && window.DONENESS_ITEMS.length)
      ? window.DONENESS_ITEMS
      : [
        { id: 'doneness-rare', name: 'רייר', printName: 'Rare' },
        { id: 'doneness-medium-rare', name: 'מדיום רייר', printName: 'Medium Rare' },
        { id: 'doneness-medium', name: 'מדיום', printName: 'Medium' },
        { id: 'doneness-medium-well', name: 'מדיום וול', printName: 'Medium Well' },
        { id: 'doneness-well-done', name: 'וול דאן', printName: 'Well Done' },
      ];
    return source
      .filter((item) => item?.id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image || '',
        price: 0,
        printName: item.printName || '',
        categoryId: 'doneness',
      }));
  }

  function asLinkedSides(value) {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).filter(Boolean);
  }

  function getAdminHamburgerDrinkOptions() {
    const inv = window.LechaimInventory;
    const available = (id) => inv?.isAvailable?.(id) !== false;
    const catalog = catalogCache.length ? catalogCache : loadCatalog();
    const ids = window.HAMBURGER_DRINK_IDS;
    const out = [];
    if (!ids || typeof ids.forEach !== 'function') return out;

    function fromMenuData(id) {
      const categories = window.MENU_DATA?.categories;
      if (!Array.isArray(categories)) return null;
      for (let c = 0; c < categories.length; c += 1) {
        const cat = categories[c];
        const pools = [cat.items || []];
        (cat.subsections || []).forEach((sub) => pools.push(sub.items || []));
        for (let p = 0; p < pools.length; p += 1) {
          const found = pools[p].find((row) => row && String(row.id) === String(id));
          if (found) {
            return {
              id: found.id,
              name: found.name,
              image: found.image || '',
              price: 0,
              printName: found.printName,
              categoryId: cat.id || 'coldDrinks',
            };
          }
        }
      }
      return null;
    }

    ids.forEach((id) => {
      if (!available(id)) return;
      const item = catalog.find((row) => row.id === id) || fromMenuData(id);
      if (item) out.push(item);
    });
    return out;
  }

  function getAdminPickerOptions(parentProductId, step = pendingOptionStep) {
    const inv = window.LechaimInventory;
    const available = (id) => inv?.isAvailable?.(id) !== false;

    if (isAdminHamburgerMeal(parentProductId) && step === 'drink') {
      return getAdminHamburgerDrinkOptions();
    }

    if (isAdminDonenessParent(parentProductId) && step !== 'drink') {
      return getAdminDonenessOptions();
    }

    if (isAdminFruitShake(parentProductId)) {
      return (window.SHAKE_BASE_ITEMS || [])
        .filter((item) => item?.id && available(item.id))
        .map((item) => ({
          id: item.id,
          name: item.name,
          image: item.image || '',
          price: 0,
          printName: item.printName,
          categoryId: 'shakeBases',
        }));
    }

    if (isAdminLimonana(parentProductId)) {
      return (window.LIMONANA_ALCOHOL_ITEMS || [])
        .filter((item) => item?.id)
        .map((item) => ({
          id: item.id,
          name: item.name,
          image: item.image || '',
          price: Number(item.price) || 0,
          printName: item.printName,
          categoryId: 'limonanaAlcohol',
        }));
    }

    if (isAdminHamburgerMeal(parentProductId)) {
      return getAdminHamburgerDrinkOptions();
    }

    return (window.HOT_SIDE_ITEMS || [])
      .filter((item) => item?.id && available(item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image || '',
        price: 0,
        printName: item.printName,
        categoryId: 'hotSides',
      }));
  }

  function getAdminOptionPickerCopy(product) {
    const name = product?.name || '';
    if (isAdminFruitShake(product?.id)) {
      return {
        title: 'מה אתם מעדיפים?',
        subtitle: `בחרו בסיס לשייק: ${name}`,
        requireSelection: true,
      };
    }
    if (isAdminLimonana(product?.id)) {
      return {
        title: 'עם אלכוהול?',
        subtitle: name,
        requireSelection: true,
      };
    }
    if (isAdminHamburgerMeal(product?.id) && pendingOptionStep === 'drink') {
      return {
        title: 'בחרו שתייה',
        subtitle: `שתייה לארוחה: ${name}`,
        requireSelection: true,
        confirmLabel: 'המשך',
      };
    }
    if (isAdminDonenessParent(product?.id)) {
      return {
        title: 'איזו מידת עשייה תרצו?',
        subtitle: name,
        requireSelection: true,
        confirmLabel: isAdminHamburgerMeal(product?.id) ? 'המשך לשתייה' : 'המשך',
      };
    }
    if (isAdminHamburgerMeal(product?.id)) {
      return {
        title: 'בחרו שתייה',
        subtitle: `שתייה לארוחה: ${name}`,
        requireSelection: true,
      };
    }
    return {
      title: 'בחרו תוספת חמה',
      subtitle: `עם מה תרצו את העיקרית: ${name}`,
      requireSelection: true,
    };
  }

  function closeAdminOptionPicker() {
    const modal = document.getElementById('admin-option-picker-modal');
    pendingOptionMain = null;
    pendingOptionSideId = null;
    pendingOptionDonenessId = null;
    pendingOptionStep = 'options';
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  function renderAdminOptionPicker() {
    const grid = document.getElementById('admin-option-picker-grid');
    const titleEl = document.getElementById('admin-option-picker-title');
    const subtitleEl = document.getElementById('admin-option-picker-subtitle');
    const confirmBtn = document.getElementById('admin-option-picker-confirm');
    if (!grid || !pendingOptionMain) return;

    const copy = getAdminOptionPickerCopy(pendingOptionMain);
    if (titleEl) titleEl.textContent = copy.title;
    if (subtitleEl) subtitleEl.textContent = copy.subtitle;
    if (confirmBtn) confirmBtn.textContent = copy.confirmLabel || 'המשך';

    const donenessStep = pendingOptionStep === 'doneness'
      || (isAdminDonenessParent(pendingOptionMain.id) && pendingOptionStep !== 'drink');
    const options = getAdminPickerOptions(
      pendingOptionMain.id,
      donenessStep ? 'doneness' : pendingOptionStep
    );
    grid.classList.toggle('admin-option-picker__grid--doneness', donenessStep);
    if (!options.length) {
      grid.innerHTML = '<p class="table-drawer__empty">אין אפשרויות זמינות במלאי</p>';
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }

    grid.innerHTML = options.map((opt) => {
      const selected = pendingOptionSideId === opt.id;
      const img = opt.image
        ? `<img class="admin-option-picker__thumb" src="${escapeAttr(opt.image)}" alt="" width="52" height="52" loading="lazy" decoding="async">`
        : '';
      const printHtml = donenessStep && opt.printName
        ? `<span class="admin-option-picker__print">${escapeHtml(opt.printName)}</span>`
        : '';
      const limonanaTotal = isAdminLimonana(pendingOptionMain.id)
        ? (Number(pendingOptionMain.price) || 0) + (Number(opt.price) || 0)
        : null;
      const priceHtml = limonanaTotal != null
        ? `<span>€${limonanaTotal}</span>`
        : '';
      return `
        <button
          type="button"
          class="admin-option-picker__cell${selected ? ' is-selected' : ''}${donenessStep ? ' admin-option-picker__cell--doneness' : ''}"
          data-option-id="${escapeAttr(opt.id)}"
          aria-pressed="${selected ? 'true' : 'false'}"
        >
          ${img}
          <span>${escapeHtml(opt.name || opt.id)}</span>
          ${printHtml}
          ${priceHtml}
        </button>
      `;
    }).join('');

    if (confirmBtn) {
      confirmBtn.disabled = copy.requireSelection && !pendingOptionSideId;
    }
  }

  function openAdminOptionPicker(product) {
    const modal = document.getElementById('admin-option-picker-modal');
    if (!modal || !product) return;
    pendingOptionMain = product;
    pendingOptionSideId = null;
    pendingOptionDonenessId = null;
    pendingOptionStep = isAdminDonenessParent(product.id) ? 'doneness' : 'options';
    renderAdminOptionPicker();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }

  function clampQty(n, max = QTY_MAX) {
    const v = Math.floor(Number(n) || 0);
    const hi = Math.max(QTY_MIN, Math.floor(Number(max) || QTY_MAX));
    if (!Number.isFinite(v)) return QTY_MIN;
    return Math.min(hi, Math.max(QTY_MIN, v));
  }

  function qtyModalMax() {
    return pendingQtyMode === 'remove' ? pendingRemoveMaxQty : QTY_MAX;
  }

  function renderAdminQtyModal() {
    const nameEl = document.getElementById('admin-qty-product-name');
    const valueEl = document.getElementById('admin-qty-value');
    const decBtn = document.getElementById('admin-qty-dec');
    const incBtn = document.getElementById('admin-qty-inc');
    const titleEl = document.getElementById('admin-qty-title');
    const confirmBtn = document.getElementById('admin-qty-confirm');
    if (!pendingQtyProduct) return;

    const isRemove = pendingQtyMode === 'remove';
    const max = qtyModalMax();
    let label = pendingQtyProduct.name || pendingQtyProduct.id || '';
    const sideNames = asLinkedSides(pendingQtySide).map((s) => s.name).filter(Boolean);
    if (sideNames.length) label = `${label} + ${sideNames.join(' + ')}`;
    if (isRemove && pendingRemoveMaxQty > 1) {
      label = `${label} (יש ${pendingRemoveMaxQty})`;
    }
    if (titleEl) titleEl.textContent = isRemove ? 'כמה להסיר?' : 'בחרו כמות';
    if (confirmBtn) confirmBtn.textContent = isRemove ? 'הסר' : 'הוסף';
    if (nameEl) nameEl.textContent = label;
    if (valueEl) valueEl.textContent = String(pendingQty);
    if (decBtn) decBtn.disabled = pendingQty <= QTY_MIN;
    if (incBtn) incBtn.disabled = pendingQty >= max;
  }

  function openAdminQtyModal(product, linkedSideProduct = null) {
    const modal = document.getElementById('admin-qty-modal');
    if (!modal || !product) return;
    pendingQtyMode = 'add';
    pendingRemoveItemId = null;
    pendingRemoveMaxQty = QTY_MAX;
    pendingQtyProduct = product;
    pendingQtySide = linkedSideProduct || null;
    pendingQty = QTY_MIN;
    renderAdminQtyModal();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => document.getElementById('admin-qty-confirm')?.focus());
  }

  function openAdminRemoveQtyModal(item) {
    const modal = document.getElementById('admin-qty-modal');
    if (!modal || !item) return;
    const have = Math.max(1, Math.floor(Number(item.qty) || 1));
    pendingQtyMode = 'remove';
    pendingRemoveItemId = String(item.itemId);
    pendingRemoveMaxQty = have;
    pendingQtyProduct = {
      id: item.productId || item.itemId,
      name: item.name || item.productId || 'מנה',
    };
    pendingQtySide = null;
    pendingQty = QTY_MIN;
    renderAdminQtyModal();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => document.getElementById('admin-qty-confirm')?.focus());
  }

  function closeAdminQtyModal() {
    const modal = document.getElementById('admin-qty-modal');
    pendingQtyProduct = null;
    pendingQtySide = null;
    pendingQty = QTY_MIN;
    pendingQtyMode = 'add';
    pendingRemoveItemId = null;
    pendingRemoveMaxQty = QTY_MAX;
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    const titleEl = document.getElementById('admin-qty-title');
    const confirmBtn = document.getElementById('admin-qty-confirm');
    if (titleEl) titleEl.textContent = 'בחרו כמות';
    if (confirmBtn) confirmBtn.textContent = 'הוסף';
  }

  function setAdminQty(next) {
    pendingQty = clampQty(next, qtyModalMax());
    renderAdminQtyModal();
  }

  function linkedOptionUnitPrice(sideProduct, parentProduct) {
    if (!sideProduct) return 0;
    const pid = sideProduct.id;
    if (window.DONENESS_IDS?.has?.(pid)) return 0;
    if (window.HOT_SIDE_IDS?.has?.(pid)) return 0;
    if (window.SHAKE_BASE_IDS?.has?.(pid)) return 0;
    if (window.HAMBURGER_DRINK_IDS?.has?.(pid) && isAdminHamburgerMeal(parentProduct?.id)) return 0;
    return Number(sideProduct.price) || 0;
  }

  async function appendLinkedSideToOrder(api, orderId, parentRemoteId, sideProduct, quantity = 1, parentProduct = null) {
    if (!api || !orderId || !parentRemoteId || !sideProduct) return;
    const qty = clampQty(quantity);
    await api.createOrderItems(orderId, [{
      productId: sideProduct.id,
      productName: sideProduct.name || '',
      printName: resolvePrintNameForProduct(sideProduct),
      quantity: qty,
      price: linkedOptionUnitPrice(sideProduct, parentProduct),
      category: sideProduct.categoryId || null,
      notes: null,
      parentItemId: parentRemoteId,
    }]);
  }

  async function commitAddProduct(product, linkedSideProduct = null, quantity = 1) {
    const entry = getSelectedEntry();
    if (!entry?.order || !product) return false;

    const qty = clampQty(quantity);
    const price = Number(product.price) || 0;
    const printName = resolvePrintNameForProduct(product);
    const sides = asLinkedSides(linkedSideProduct);
    const sidePrice = sides.reduce((sum, side) => sum + linkedOptionUnitPrice(side, product), 0);

    if (dataSource === 'supabase' && entry.order._supabaseSessionId && OrdersApi()?.isConfigured?.()) {
      suppressCustomerNotify();
      const api = OrdersApi();
      const sessionId = entry.order._supabaseSessionId;
      let remoteOrders = entry.order._remoteOrders || [];
      try {
        const fresh = await api.getSessionOrders?.(sessionId);
        if (Array.isArray(fresh)) remoteOrders = fresh;
      } catch (_) { /* use cached */ }
      const stackInto = findStackableLateAddOrder(remoteOrders);

      let orderId = null;
      let parentRemoteId = null;

      if (stackInto?.id) {
        orderId = stackInto.id;
        const lines = Array.isArray(stackInto.order_items) ? stackInto.order_items : [];
        const same = !sides.length
          ? lines.find((row) => (
            String(row.product_id || '') === String(product.id)
            && !row.parent_item_id
          ))
          : null;

        if (same?.id && typeof api.bumpOrderItemQuantity === 'function') {
          await api.bumpOrderItemQuantity(same.id, qty);
          return true;
        }

        /* Linked mains+sides stay as separate lines (never merge qty). */
        const created = await api.createOrderItems(orderId, [{
          productId: product.id,
          productName: product.name || '',
          printName,
          quantity: qty,
          price,
          category: product.categoryId || null,
          notes: null,
        }]);
        parentRemoteId = created?.[0]?.id || null;
        if (typeof api.refreshOrderTotal === 'function') {
          await api.refreshOrderTotal(orderId);
        }
      } else {
        const remoteOrder = await api.createOrder({
          sessionId,
          total: (price + sidePrice) * qty,
          status: 'submitted',
        });
        if (!remoteOrder?.id) throw new Error('createOrder failed');
        orderId = remoteOrder.id;
        const created = await api.createOrderItems(orderId, [{
          productId: product.id,
          productName: product.name || '',
          printName,
          quantity: qty,
          price,
          category: product.categoryId || null,
          notes: null,
        }]);
        parentRemoteId = created?.[0]?.id || null;
      }

      if (sides.length) {
        if (!parentRemoteId) throw new Error('missing parent item id for linked side');
        for (const side of sides) {
          await appendLinkedSideToOrder(api, orderId, parentRemoteId, side, qty, product);
        }
        if (typeof api.refreshOrderTotal === 'function') {
          await api.refreshOrderTotal(orderId);
        }
      }
      return true;
    }

    const engine = Engine();
    const updated = engine?.addProductToOrder?.(entry.order.orderId, product, qty, '', {
      allowMerge: !sides.length,
    });
    if (!updated) return false;
    if (sides.length) {
      const parentItemId = updated._lastAddedItemId;
      for (const side of sides) {
        const withSide = engine.addProductToOrder(entry.order.orderId, side, qty, '', {
          linkedToMainItemId: parentItemId,
          allowMerge: false,
        });
        if (!withSide) return false;
      }
    }
    return true;
  }

  async function handleAddProduct(productId) {
    const entry = getSelectedEntry();
    if (!entry?.order || !productId || addProductBusy) return;

    const product = findCatalogProduct(productId);
    if (!product) {
      showToast('המנה לא נמצאה');
      return;
    }
    if (product.available === false) {
      showToast('אין במלאי');
      return;
    }

    if (productNeedsOptionPicker(product.id)) {
      /* Hamburger / entrecote always open doneness first — do not pre-check
         drinks/sides with a stale picker step or the modal never appears. */
      if (isAdminDonenessParent(product.id)) {
        openAdminOptionPicker(product);
        return;
      }
      const options = getAdminPickerOptions(product.id);
      if (!options.length) {
        showToast('אין אפשרויות זמינות במלאי');
        return;
      }
      openAdminOptionPicker(product);
      return;
    }

    openAdminQtyModal(product, null);
  }

  async function confirmAdminQtyModal() {
    if (!pendingQtyProduct) return;

    if (pendingQtyMode === 'remove') {
      if (removeItemBusy || !pendingRemoveItemId) return;
      const itemId = pendingRemoveItemId;
      const qty = clampQty(pendingQty, pendingRemoveMaxQty);
      closeAdminQtyModal();
      await commitRemoveQuantity(itemId, qty);
      return;
    }

    if (addProductBusy) return;
    const product = pendingQtyProduct;
    const side = pendingQtySide;
    const qty = clampQty(pendingQty);

    addProductBusy = true;
    try {
      const ok = await commitAddProduct(product, side, qty);
      if (!ok) {
        showToast('לא ניתן להוסיף');
        return;
      }
      closeAdminQtyModal();
      const qtyLabel = qty > 1 ? `${qty}× ` : '';
      const sideLabel = asLinkedSides(side).map((s) => s.name).filter(Boolean).join(' + ');
      showSuccessModal(`המוצר נוסף בהצלחה\n${qtyLabel}${product.name}${sideLabel ? `\n+ ${sideLabel}` : ''}`);
      await refreshBoardData();
      if (menuMode) renderMenuPicker();
    } catch (err) {
      console.error('[admin-tables] add product with qty failed', err);
      showToast('לא ניתן להוסיף');
    } finally {
      addProductBusy = false;
    }
  }

  function confirmAdminOptionPicker() {
    if (!pendingOptionMain || !pendingOptionSideId || addProductBusy) return;
    const main = pendingOptionMain;

    if (isAdminDonenessParent(main.id) && pendingOptionStep === 'doneness') {
      if (isAdminHamburgerMeal(main.id)) {
        pendingOptionDonenessId = pendingOptionSideId;
        pendingOptionSideId = null;
        pendingOptionStep = 'drink';
        renderAdminOptionPicker();
        return;
      }
    }

    const sides = [];
    if (pendingOptionDonenessId) {
      const doneness = findCatalogProduct(pendingOptionDonenessId);
      if (doneness) sides.push(doneness);
    }
    const last = findCatalogProduct(pendingOptionSideId);
    if (!last) {
      showToast('התוספת לא נמצאה');
      return;
    }
    sides.push(last);
    closeAdminOptionPicker();
    openAdminQtyModal(main, sides.length > 1 ? sides : sides[0]);
  }

  async function handlePrintCustomerBill(entry, coupon = null) {
    if (!entry?.order?.orderId) {
      showToast('אין הזמנה פעילה');
      return;
    }
    if (!window.LechaimPrintEngine?.printCustomerBill) {
      showToast('מנוע ההדפסה לא זמין');
      return;
    }

    try {
      suppressCustomerNotify();
      const printOrder = { ...entry.order };
      if (coupon?.code) {
        printOrder.couponCode = coupon.code;
        printOrder.discountPercent = coupon.discountPercent;
        printOrder.discountAmount = coupon.discountAmount;
        printOrder.subtotal = coupon.subtotal;
        printOrder.billTotal = coupon.total;
      }

      const printed = await LechaimPrintEngine.printCustomerBill(printOrder);
      if (!printed) {
        showToast('הדפסת החשבון נכשלה');
        return;
      }

      if (dataSource === 'supabase' && entry.order._supabaseSessionId && OrdersApi()?.updateSessionStatus) {
        try {
          const patch = { status: 'bill_requested' };
          if (coupon?.code) {
            patch.couponCode = coupon.code;
            patch.discountPercent = coupon.discountPercent;
            patch.discountAmount = coupon.discountAmount;
            patch.subtotal = coupon.subtotal;
          }
          await OrdersApi().updateSessionStatus(entry.order._supabaseSessionId, patch);
          if (coupon?.code && typeof OrdersApi().incrementCouponUse === 'function') {
            try {
              await OrdersApi().incrementCouponUse(coupon.code);
            } catch (incErr) {
              console.warn('[admin-tables] coupon use increment failed', incErr);
            }
          }
        } catch (err) {
          console.warn('[admin-tables] Supabase bill_requested update failed', err);
        }
      } else {
        Engine()?.requestBill?.(entry.order.orderId);
      }

      showToast('החשבון הודפס בבר · השולחן מסומן: ביקש חשבון');
      setDrawerView('detail');
      await refreshBoardData();
    } catch (err) {
      console.error('[admin-tables] print customer bill failed', err);
      showToast('הדפסת החשבון נכשלה');
    }
  }

  function resetCouponModalUi() {
    pendingBillCoupon = null;
    if (couponInput) couponInput.value = '';
    if (couponStatus) {
      couponStatus.hidden = true;
      couponStatus.textContent = '';
      couponStatus.classList.remove('is-error');
    }
    if (couponTotals) {
      couponTotals.hidden = true;
      couponTotals.innerHTML = '';
    }
  }

  function openCouponModal(entry) {
    pendingBillEntry = entry;
    resetCouponModalUi();
    if (!couponModal) {
      handlePrintCustomerBill(entry, null);
      return;
    }
    couponModal.hidden = false;
    couponModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setFocusTrap('coupon', couponModal);
    couponInput?.focus();
  }

  function closeCouponModal() {
    if (!couponModal) return;
    clearFocusTrap('coupon');
    couponModal.hidden = true;
    couponModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    pendingBillEntry = null;
    resetCouponModalUi();
  }

  async function applyAdminCoupon() {
    const code = String(couponInput?.value || '').trim();
    if (!code || !pendingBillEntry?.order) {
      if (couponStatus) {
        couponStatus.hidden = false;
        couponStatus.classList.add('is-error');
        couponStatus.textContent = 'קוד קופון לא תקין';
      }
      return;
    }

    const api = OrdersApi();
    if (!api?.validateCoupon) {
      if (couponStatus) {
        couponStatus.hidden = false;
        couponStatus.classList.add('is-error');
        couponStatus.textContent = 'אימות קופון לא זמין';
      }
      return;
    }

    try {
      const result = await api.validateCoupon(code);
      const percent = Number(result?.discount_percent ?? result?.discountPercent);
      if (!result || !Number.isFinite(percent) || percent <= 0) {
        pendingBillCoupon = null;
        if (couponStatus) {
          couponStatus.hidden = false;
          couponStatus.classList.add('is-error');
          couponStatus.textContent = 'קוד קופון לא תקין';
        }
        if (couponTotals) couponTotals.hidden = true;
        return;
      }

      const subtotal = calcOrderSubtotal(pendingBillEntry.order);
      const discountAmount = Math.round(subtotal * (percent / 100) * 100) / 100;
      const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
      pendingBillCoupon = {
        code: String(result?.code || code).trim(),
        discountPercent: percent,
        discountAmount,
        subtotal,
        total,
      };

      if (couponStatus) {
        couponStatus.hidden = false;
        couponStatus.classList.remove('is-error');
        couponStatus.textContent = `קופון אומת בהצלחה — ${percent}% הנחה`;
      }
      if (couponTotals) {
        couponTotals.hidden = false;
        couponTotals.innerHTML = `
          <div>לפני הנחה: ${escapeHtml(formatMoneyEuro(subtotal))}</div>
          <div>הנחה (${escapeHtml(String(percent))}%): −${escapeHtml(formatMoneyEuro(discountAmount))}</div>
          <div><strong>לתשלום: ${escapeHtml(formatMoneyEuro(total))}</strong></div>
        `;
      }
    } catch (err) {
      console.warn('[admin-tables] validate coupon failed', err);
      pendingBillCoupon = null;
      if (couponStatus) {
        couponStatus.hidden = false;
        couponStatus.classList.add('is-error');
        couponStatus.textContent = 'קוד קופון לא תקין';
      }
    }
  }

  async function confirmAdminCouponPrint() {
    const entry = pendingBillEntry;
    const coupon = pendingBillCoupon;
    if (!entry) return;
    closeCouponModal();
    await handlePrintCustomerBill(entry, coupon);
  }

  async function handleWaiterArrived(entry) {
    const sessionId = entry?.order?._supabaseSessionId;
    const api = OrdersApi();
    if (!sessionId || typeof api?.setWaiterCall !== 'function') {
      showToast('לא ניתן לאשר הגעה');
      return;
    }
    try {
      await api.setWaiterCall(sessionId, null, false);
      showToast('המלצר סומן כהגיע');
    } catch (err) {
      console.warn('[admin-tables] waiter arrived failed', err);
      showToast('לא ניתן לאשר הגעה');
    }
  }

  async function handleAction(action) {
    if (!selectedKey) return;

    const entry = getSelectedEntry();
    if (!entry?.order) return;

    if (action === 'approve-and-print') {
      await handleApproveAndPrint(entry);
      return;
    }

    if (action === 'approve-order') {
      await handleApproveOrder(entry);
      return;
    }

    if (action === 'print-order') {
      await handlePrintOrder(entry);
      return;
    }

    if (action === 'add-items') {
      openMenuPicker();
      return;
    }

    if (action === 'print-bill') {
      openCouponModal(entry);
      return;
    }

    if (action === 'waiter-arrived') {
      await handleWaiterArrived(entry);
      return;
    }

    if (action === 'close-table') {
      const isPickupClose = entry.orderType === 'takeaway' || entry.orderType === 'butcher';
      const deliveryClose = entry.orderType === 'takeaway' && isDeliveryOrder(entry.order);
      const payment = await showPaymentModal(entry);
      const isVoidClose = payment?.method === 'void';
      if (!payment || (!isVoidClose && !['cash', 'credit', 'split'].includes(payment.method))) return;

      try {
        let closed = false;
        suppressCustomerNotify();

        if (dataSource === 'supabase' && entry.order._supabaseSessionId && OrdersApi()?.updateSessionStatus) {
          const patch = {
            status: 'closed',
            subtotal: entry.order.subtotal != null ? entry.order.subtotal : calcOrderSubtotal(entry.order),
            discountAmount: entry.order.discountAmount != null ? entry.order.discountAmount : null,
            discountPercent: entry.order.discountPercent != null ? entry.order.discountPercent : null,
            couponCode: entry.order.couponCode || null,
          };
          if (isVoidClose) {
            /* Close table/order but do not record in till */
            patch.paymentMethod = null;
            patch.paidTotal = null;
            patch.paidCash = null;
            patch.paidCredit = null;
          } else {
            patch.paymentMethod = payment.method;
            patch.paidTotal = payment.paidTotal;
            patch.paidCash = payment.paidCash;
            patch.paidCredit = payment.paidCredit;
          }
          await OrdersApi().updateSessionStatus(entry.order._supabaseSessionId, patch);
          closed = true;
        } else {
          const engine = Engine();
          closed = isPickupClose
            ? Boolean(engine?.closeOrder?.({ orderId: entry.order.orderId }))
            : Boolean(engine?.closeTable?.(entry.tableNumber));
        }

        if (!closed) {
          showToast('לא ניתן לסגור');
          return;
        }

        showToast(
          entry.orderType === 'butcher'
            ? 'הזמנת חנות בשר נסגרה'
            : (entry.orderType === 'takeaway'
              ? (deliveryClose ? 'המשלוח נסגר' : 'איסוף עצמי נסגר')
              : `שולחן ${entry.tableNumber} נסגר`)
        );
        closeDrawer();
        await refreshBoardData();
        window.LechaimAdminTill?.refresh?.();
      } catch (err) {
        console.error('[admin-tables] close table failed', err);
        const msg = String(err?.message || '');
        if (msg.includes('payment_method') || msg.includes('paid_total') || msg.includes('paid_cash') || msg.includes('column')) {
          showToast('חסרות עמודות קופה — הריצו supabase-till-payment.sql');
        } else {
          showToast('לא ניתן לסגור');
        }
      }
    }
  }

  let deliveriesClosed = false;
  let deliveriesFlagUnsub = null;

  function updateDeliveriesToggleButton() {
    if (!closeDeliveriesBtn) return;
    if (deliveriesClosed) {
      closeDeliveriesBtn.textContent = 'פתח משלוחים';
      closeDeliveriesBtn.classList.remove('admin-btn--ghost');
      closeDeliveriesBtn.classList.add('admin-btn--primary');
    } else {
      closeDeliveriesBtn.textContent = 'סגור משלוחים';
      closeDeliveriesBtn.classList.add('admin-btn--ghost');
      closeDeliveriesBtn.classList.remove('admin-btn--primary');
    }
  }

  async function refreshDeliveriesClosedFlag() {
    const api = OrdersApi();
    if (!api?.isConfigured?.() || typeof api.getDeliveriesClosed !== 'function') {
      updateDeliveriesToggleButton();
      return;
    }
    try {
      deliveriesClosed = Boolean(await api.getDeliveriesClosed());
      updateDeliveriesToggleButton();
    } catch (err) {
      console.warn('[admin-tables] deliveries flag load failed', err);
    }
  }

  /**
   * Toggle customer-facing delivery wording/options only (does not close orders).
   */
  async function toggleDeliveriesClosed() {
    const api = OrdersApi();
    if (!api?.setDeliveriesClosed) {
      showToast('מתג משלוחים לא זמין — הריצו supabase-takeaway-delivery.sql');
      return;
    }
    const nextClosed = !deliveriesClosed;
    const ok = await showConfirmModal(
      nextClosed
        ? 'לסגור משלוחים בצד הלקוח?\nכפתור "משלוח" ייעלם ממסך הכניסה.'
        : 'לפתוח משלוחים בצד הלקוח?\nכפתור "משלוח" יופיע שוב במסך הכניסה.',
      { yesLabel: nextClosed ? 'סגור משלוחים' : 'פתח משלוחים' }
    );
    if (!ok) return;
    try {
      await api.setDeliveriesClosed(nextClosed);
      deliveriesClosed = nextClosed;
      updateDeliveriesToggleButton();
      showToast(nextClosed ? 'משלוחים סגורים ללקוחות' : 'משלוחים פתוחים ללקוחות');
    } catch (err) {
      console.error('[admin-tables] toggle deliveries failed', err);
      showToast(err?.message || 'עדכון משלוחים נכשל');
    }
  }

  function renderBoard() {
    refreshBoardData().catch((err) => {
      console.warn('[admin-tables] renderBoard failed', err);
    });
  }

  function findEntryByKey(key) {
    const k = String(key || '');
    if (!k) return null;
    if (k.startsWith('butcher')) {
      return butcherCache.find((row) => entryKey(row) === k) || null;
    }
    if (k.startsWith('takeaway')) {
      return takeawayCache.find((row) => entryKey(row) === k) || null;
    }
    return boardCache.find((row) => entryKey(row) === k) || null;
  }

  function openEntryFromCard(card) {
    const key = card.getAttribute('data-entry-key') || card.dataset.entryKey || '';
    const entry = findEntryByKey(key);
    if (!entry) {
      console.warn('[admin-tables] card not found for key', key);
      return;
    }
    if (!entry.order) return; /* free dine-in table */
    openDrawer(entry);
  }

  function onGridClick(event) {
    const actionBtn = event.target.closest('[data-table-action="whatsapp"], [data-table-action="courier"]');
    if (actionBtn) {
      event.preventDefault();
      event.stopPropagation();
      const card = actionBtn.closest('[data-entry-key]');
      const key = card?.getAttribute('data-entry-key') || card?.dataset.entryKey || '';
      const entry = findEntryByKey(key);
      if (!entry) return;
      const action = actionBtn.getAttribute('data-table-action');
      if (action === 'whatsapp') openOrderWhatsApp(entry);
      else if (action === 'courier') openCourierModal(entry);
      return;
    }
    if (event.target.closest('.admin-location-link')) return;
    const card = event.target.closest('[data-entry-key]');
    if (!card) return;
    event.preventDefault();
    openEntryFromCard(card);
  }

  function onGridKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('[data-table-action="whatsapp"], [data-table-action="courier"]')) return;
    const card = event.target.closest('article[data-entry-key]');
    if (!card || event.target !== card) return;
    event.preventDefault();
    openEntryFromCard(card);
  }

  let cardClicksBound = false;

  function bindGridEvents(el) {
    if (!el) return;
    el.addEventListener('click', onGridClick);
    el.addEventListener('keydown', onGridKeydown);
  }

  function bindCardClicks() {
    if (cardClicksBound) return;
    const boardView = document.getElementById('admin-view-tables');
    if (boardView) {
      bindGridEvents(boardView);
      cardClicksBound = true;
      return;
    }
    /* Fallback if view wrapper is missing */
    bindGridEvents(gridEl);
    bindGridEvents(takeawayGridToday);
    bindGridEvents(takeawayGridFuture);
    bindGridEvents(butcherGridToday);
    bindGridEvents(butcherGridFuture);
    cardClicksBound = true;
  }

  async function isShabbatSessionId(sessionId) {
    if (!sessionId) return false;
    const key = String(sessionId);
    if (shabbatSessionIds.has(key)) return true;
    try {
      const session = await OrdersApi()?.getSession?.(key);
      if (window.LechaimOrderTypes?.isShabbatOrderType?.(session?.order_type)
        || session?.order_type === 'shabbat') {
        shabbatSessionIds.add(key);
        return true;
      }
    } catch {
      /* ignore lookup failures — fall through to normal board handling */
    }
    return false;
  }

  function startRealtime() {
    stopRealtime();
    const api = OrdersApi();
    if (!api?.isConfigured?.() || typeof api.subscribeToOrders !== 'function') return;
    try {
      unsubscribeRealtime = api.subscribeToOrders((payload) => {
        const table = payload?.table;
        const eventType = String(payload?.eventType || payload?.event || '').toUpperCase();
        const row = payload?.new || payload?.payload?.new;

        /* Customer sent a new order wave — chime on every Admin tab (incl. Shabbat) */
        if (table === 'orders' && eventType === 'INSERT') {
          const id = row?.id;
          const sessionId = row?.session_id;
          void (async () => {
            const isShabbat = await isShabbatSessionId(sessionId);
            if (id && orderIdsSeeded && !knownOrderIds.has(String(id))) {
              knownOrderIds.add(String(id));
              playOrderNotifyChime();
            } else if (id) {
              knownOrderIds.add(String(id));
            }
            /* Shabbat has its own board — still refresh tables/takeaway for other types */
            if (!isShabbat) scheduleBoardRefresh();
          })();
          return;
        }

        /* Customer requested the bill — visual only, no chime */
        if (table === 'order_sessions' && eventType === 'UPDATE') {
          if (String(row?.order_type || '') === 'shabbat' || shabbatSessionIds.has(String(row?.session_id || ''))) {
            return;
          }
        }

        scheduleBoardRefresh();
      });
    } catch (err) {
      console.warn('[admin-tables] Realtime subscribe failed', err);
    }
  }

  function stopRealtime() {
    if (typeof unsubscribeRealtime === 'function') {
      try {
        unsubscribeRealtime();
      } catch (err) {
        console.warn('[admin-tables] Realtime unsubscribe failed', err);
      }
    }
    unsubscribeRealtime = null;
  }

  function startPolling() {
    bindCardClicks();
    if (watchRunning) {
      renderBoard();
      return;
    }
    watchRunning = true;
    startRealtime();
    renderBoard();
    pollTimer = window.setInterval(renderBoard, 45000);
  }

  function stopPolling() {
    watchRunning = false;
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    window.clearTimeout(refreshTimer);
    stopRealtime();
    stopPendingReminder();
  }

  function init() {
    bindCardClicks();
    closeDeliveriesBtn?.addEventListener('click', () => {
      toggleDeliveriesClosed().catch((err) => {
        console.error('[admin-tables] deliveries toggle failed', err);
      });
    });
    refreshDeliveriesClosedFlag().catch(() => {});
    if (!deliveriesFlagUnsub && OrdersApi()?.subscribeRestaurantFlags) {
      deliveriesFlagUnsub = OrdersApi().subscribeRestaurantFlags((evt) => {
        if (evt?.flagKey !== 'deliveries_closed') return;
        deliveriesClosed = Boolean(evt.flagValue);
        updateDeliveriesToggleButton();
      });
    }
    drawerBackdrop?.addEventListener('click', closeDrawer);
    drawerClose?.addEventListener('click', closeDrawer);
    menuBack?.addEventListener('click', closeMenuPicker);
    successOk?.addEventListener('click', closeSuccessModal);
    successBackdrop?.addEventListener('click', closeSuccessModal);
    confirmYes?.addEventListener('click', () => closeConfirmModal(true));
    confirmCancel?.addEventListener('click', () => closeConfirmModal(false));
    confirmBackdrop?.addEventListener('click', () => closeConfirmModal(false));
    couponApply?.addEventListener('click', () => { applyAdminCoupon(); });
    couponPrint?.addEventListener('click', () => { confirmAdminCouponPrint(); });
    couponCancel?.addEventListener('click', closeCouponModal);
    couponBackdrop?.addEventListener('click', closeCouponModal);
    courierCopyHeBtn?.addEventListener('click', () => { copyCourierDetails('he'); });
    courierCopyEnBtn?.addEventListener('click', () => { copyCourierDetails('en'); });
    document.getElementById('admin-courier-close')?.addEventListener('click', closeCourierModal);
    courierBackdrop?.addEventListener('click', closeCourierModal);
    whatsappModal?.querySelector('.admin-wa-modal__choices')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-wa-template]');
      if (!btn || btn.hidden) return;
      setWhatsAppTemplate(btn.getAttribute('data-wa-template'));
    });
    document.getElementById('admin-whatsapp-send')?.addEventListener('click', confirmWhatsAppSend);
    document.getElementById('admin-whatsapp-cancel')?.addEventListener('click', closeWhatsAppModal);
    document.getElementById('admin-whatsapp-backdrop')?.addEventListener('click', closeWhatsAppModal);

    document.getElementById('admin-payment-cash')?.addEventListener('click', () => {
      const total = roundMoney(pendingPaymentTotal);
      closePaymentModal(buildPaymentResult('cash', total, total, 0));
    });
    document.getElementById('admin-payment-credit')?.addEventListener('click', () => {
      const total = roundMoney(pendingPaymentTotal);
      closePaymentModal(buildPaymentResult('credit', total, 0, total));
    });
    document.getElementById('admin-payment-split')?.addEventListener('click', () => {
      showPaymentSplitPanel();
    });
    document.getElementById('admin-payment-void')?.addEventListener('click', () => {
      closePaymentModal(buildPaymentResult('void', 0, 0, 0));
    });
    document.getElementById('admin-payment-cash-input')?.addEventListener('input', () => {
      syncPaymentSplitFields(true);
    });
    document.getElementById('admin-payment-split-confirm')?.addEventListener('click', () => {
      confirmPaymentSplit();
    });
    /* Cancel / backdrop only dismiss the modal — table stays open until a payment action */
    document.getElementById('admin-payment-cancel')?.addEventListener('click', () => {
      closePaymentModal(null);
    });
    document.getElementById('admin-payment-backdrop')?.addEventListener('click', () => {
      closePaymentModal(null);
    });
    couponInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyAdminCoupon();
      }
    });

    const optionGrid = document.getElementById('admin-option-picker-grid');
    const optionConfirm = document.getElementById('admin-option-picker-confirm');
    const optionCancel = document.getElementById('admin-option-picker-cancel');
    const optionBackdrop = document.getElementById('admin-option-picker-backdrop');
    optionGrid?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-option-id]');
      if (!btn || !optionGrid.contains(btn)) return;
      pendingOptionSideId = btn.getAttribute('data-option-id') || null;
      renderAdminOptionPicker();
    });
    optionConfirm?.addEventListener('click', () => { confirmAdminOptionPicker(); });
    optionCancel?.addEventListener('click', closeAdminOptionPicker);
    optionBackdrop?.addEventListener('click', closeAdminOptionPicker);

    const qtyInc = document.getElementById('admin-qty-inc');
    const qtyDec = document.getElementById('admin-qty-dec');
    const qtyConfirm = document.getElementById('admin-qty-confirm');
    const qtyCancel = document.getElementById('admin-qty-cancel');
    const qtyBackdrop = document.getElementById('admin-qty-backdrop');
    qtyInc?.addEventListener('click', () => {
      if (!pendingQtyProduct) return;
      setAdminQty(pendingQty + 1);
    });
    qtyDec?.addEventListener('click', () => {
      if (!pendingQtyProduct) return;
      setAdminQty(pendingQty - 1);
    });
    qtyConfirm?.addEventListener('click', () => {
      if (!pendingQtyProduct) return;
      confirmAdminQtyModal();
    });
    qtyCancel?.addEventListener('click', () => {
      if (!pendingQtyProduct) return;
      closeAdminQtyModal();
    });
    qtyBackdrop?.addEventListener('click', () => {
      if (!pendingQtyProduct) return;
      closeAdminQtyModal();
    });

    drawerItems?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove-item-id]');
      if (!btn || !drawerItems.contains(btn)) return;
      event.preventDefault();
      handleRemoveOrderItem(btn.getAttribute('data-remove-item-id'));
    });

    drawer?.querySelectorAll('[data-table-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.tableAction));
    });

    menuCats?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-menu-cat]');
      if (!btn) return;
      menuCategoryId = btn.dataset.menuCat || 'all';
      renderMenuPicker();
    });

    menuList?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-add-product]');
      if (!btn || btn.disabled) return;
      handleAddProduct(btn.dataset.addProduct);
    });

    menuSearch?.addEventListener('input', () => {
      menuQuery = menuSearch.value || '';
      renderMenuPicker();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const paymentModal = document.getElementById('admin-payment-modal');
      if (paymentModal && !paymentModal.hidden) {
        closePaymentModal(null);
        return;
      }
      const qtyModal = document.getElementById('admin-qty-modal');
      if (qtyModal && !qtyModal.hidden && pendingQtyProduct) {
        closeAdminQtyModal();
        return;
      }
      const optionPickerModal = document.getElementById('admin-option-picker-modal');
      if (optionPickerModal && !optionPickerModal.hidden) {
        closeAdminOptionPicker();
        return;
      }
      if (confirmModal && !confirmModal.hidden) {
        closeConfirmModal(false);
        return;
      }
      if (couponModal && !couponModal.hidden) {
        closeCouponModal();
        return;
      }
      if (courierModal && !courierModal.hidden) {
        closeCourierModal();
        return;
      }
      if (whatsappModal && !whatsappModal.hidden) {
        closeWhatsAppModal();
        return;
      }
      if (successModal && !successModal.hidden) {
        closeSuccessModal();
        return;
      }
      if (!drawer || drawer.hidden) return;
      if (menuMode) {
        closeMenuPicker();
        return;
      }
      closeDrawer();
    });
  }

  window.LechaimAdminTables = {
    init,
    start: startPolling,
    stop: stopPolling,
    refresh: renderBoard,
    closeDrawer,
    setBoardFilter,
    playNotifyChime: playOrderNotifyChime,
    playChatNotifyChime,
    silenceNotifyChime() {
      suppressCustomerNotify(8000);
      stopPendingReminder();
      updatePendingReminder(boardCache, pickupCaches());
    },
    showConfirmModal,
    showSuccessModal,
    renderDrawerItemsHtml,
    openOrderWhatsApp,
    openCourierModal,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
