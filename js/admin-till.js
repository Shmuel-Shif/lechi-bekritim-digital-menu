/**
 * LECHAIM — Admin daily sales (מכירות): till money + sold products.
 * A saved till_day_reports row is shown as saved. Later closes are not added.
 * A daily_report_lock, when present, is shown instead of that row.
 */
(function () {
  'use strict';

  /** Soft reset: counts only from this local day (inclusive). Today (09/08/2026) stays €0. */
  const TILL_COUNT_FROM_YMD = '2026-08-10';

  const dateInput = document.getElementById('admin-till-date');
  const errorEl = document.getElementById('admin-till-error');
  const dateLabelEl = document.getElementById('admin-till-date-label');
  const cashEl = document.getElementById('admin-till-cash');
  const creditEl = document.getElementById('admin-till-credit');
  const totalEl = document.getElementById('admin-till-total');
  const tipEl = document.getElementById('admin-till-tip');
  const whatsappBtn = document.getElementById('admin-till-whatsapp');
  const todayBtn = document.getElementById('admin-till-today');
  const prevDayBtn = document.getElementById('admin-till-prev-day');
  const nextDayBtn = document.getElementById('admin-till-next-day');
  const productsListEl = document.getElementById('admin-till-products-list');
  const productsEmptyEl = document.getElementById('admin-till-products-empty');
  const searchInput = document.getElementById('admin-till-product-search');
  const catsEl = document.getElementById('admin-till-cats');
  const summaryCard = document.getElementById('admin-till-summary-card');
  const unlockTotalsBtn = document.getElementById('admin-till-unlock-totals');
  const totalsModal = document.getElementById('till-totals-modal');
  const totalsForm = document.getElementById('till-totals-form');
  const totalsCodeInput = document.getElementById('till-totals-code');
  const totalsFormError = document.getElementById('till-totals-form-error');
  const openingForm = document.getElementById('admin-till-opening-form');
  const openingInput = document.getElementById('admin-till-opening-input');
  const openingSaveBtn = document.getElementById('admin-till-opening-save');
  const editReportBtn = document.getElementById('admin-till-edit-report');
  const editReportModal = document.getElementById('till-edit-report-modal');
  const editReportForm = document.getElementById('till-edit-report-form');
  const editReportDateEl = document.getElementById('till-edit-report-date');
  const editCashInput = document.getElementById('till-edit-cash');
  const editCreditInput = document.getElementById('till-edit-credit');
  const editTipInput = document.getElementById('till-edit-tip');
  const editInclusiveEl = document.getElementById('till-edit-inclusive');
  const editReportError = document.getElementById('till-edit-report-error');
  const lockBtn = document.getElementById('admin-till-lock');
  const correctBtn = document.getElementById('admin-till-correct');
  const historyBtn = document.getElementById('admin-till-history');
  const lockBadge = document.getElementById('admin-till-lock-badge');
  const lockModal = document.getElementById('till-lock-modal');
  const lockForm = document.getElementById('till-lock-form');
  const lockPreview = document.getElementById('till-lock-preview');
  const lockError = document.getElementById('till-lock-error');
  const correctModal = document.getElementById('till-correct-modal');
  const correctForm = document.getElementById('till-correct-form');
  const correctCashInput = document.getElementById('till-correct-cash');
  const correctCreditInput = document.getElementById('till-correct-credit');
  const correctTipInput = document.getElementById('till-correct-tip');
  const correctSalesEl = document.getElementById('till-correct-sales');
  const correctReasonInput = document.getElementById('till-correct-reason');
  const correctError = document.getElementById('till-correct-error');
  const historyModal = document.getElementById('till-lock-history-modal');
  const historyList = document.getElementById('till-lock-history-list');
  const historyError = document.getElementById('till-lock-history-error');

  let cache = emptyCache('');
  let todayHold = null;
  let started = false;
  let refreshTimer = null;
  let loadSeq = 0;
  const dashboardListeners = new Set();
  let selectedCategory = 'all';
  let searchQuery = '';
  let productCategoryById = new Map();
  let menuCategories = [];
  let totalsUnlocked = false;
  let totalsBusy = false;
  let openingBusy = false;
  let editReportBusy = false;

  function emptyCache(date) {
    return {
      date: date || '',
      live: { cash: 0, credit: 0, tip: 0 },
      report: null,
      base: null,
      opening: null,
      products: [],
      rows: [],
      layersMissing: false,
      lock: null,
    };
  }

  function notifyDashboard() {
    dashboardListeners.forEach((fn) => {
      try { fn(); } catch (err) { console.warn('[admin-till] dashboard listener', err); }
    });
  }

  function rememberTodayHold(next) {
    if (!next?.date || next.date !== todayLocalYmd()) return;
    todayHold = {
      date: next.date,
      rows: Array.isArray(next.rows) ? next.rows : [],
      products: Array.isArray(next.products) ? next.products : [],
      live: next.live || { cash: 0, credit: 0, tip: 0 },
      report: next.report || null,
      base: next.base || null,
    };
  }

  function snapshotFromParts(date, rows, products, live, report, base) {
    return {
      date: date || '',
      rows: Array.isArray(rows) ? rows : [],
      products: Array.isArray(products) ? products : [],
      shown: displayedSales(live, report, base),
      live: live || { cash: 0, credit: 0, tip: 0 },
    };
  }

  function getDashboardSnapshot() {
    const current = snapshotFromParts(
      cache.date,
      cache.rows,
      cache.products,
      cache.live,
      cache.report,
      cache.base
    );
    const today = todayHold
      ? snapshotFromParts(
        todayHold.date,
        todayHold.rows,
        todayHold.products,
        todayHold.live,
        todayHold.report,
        todayHold.base
      )
      : (cache.date === todayLocalYmd() ? current : null);
    return {
      date: current.date,
      rows: current.rows,
      products: current.products,
      shown: current.shown,
      live: current.live,
      today,
    };
  }

  function onDashboardChange(fn) {
    if (typeof fn !== 'function') return function unsubscribe() {};
    dashboardListeners.add(fn);
    return function unsubscribe() {
      dashboardListeners.delete(fn);
    };
  }

  function OrdersApi() {
    return window.LechaimSupabaseOrders;
  }

  function showError(message) {
    if (!errorEl) return;
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function applyTotalsGate() {
    if (summaryCard) summaryCard.hidden = !totalsUnlocked;
    if (unlockTotalsBtn) unlockTotalsBtn.hidden = totalsUnlocked;
  }

  function getSb() {
    if (typeof window.LechaimInventory?.getClient === 'function') {
      return window.LechaimInventory.getClient();
    }
    return null;
  }

  function showTotalsFormError(message) {
    if (!totalsFormError) return;
    if (!message) {
      totalsFormError.hidden = true;
      totalsFormError.textContent = '';
      return;
    }
    totalsFormError.hidden = false;
    totalsFormError.textContent = message;
  }

  function openTotalsModal() {
    showTotalsFormError('');
    if (!totalsModal) return;
    totalsModal.hidden = false;
    totalsModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    window.setTimeout(() => totalsCodeInput?.focus(), 50);
  }

  async function requestTotalsUnlock() {
    if (totalsUnlocked) {
      applyTotalsGate();
      return;
    }
    await syncTotalsUnlockedFromServer();
    if (totalsUnlocked) return;

    const sb = getSb();
    if (sb) {
      try {
        const setRes = await sb.rpc('admin_access_code_is_set');
        const codeOn = setRes.error
          ? Boolean((await sb.rpc('documents_vault_code_is_set')).data)
          : Boolean(setRes.data);
        if (!codeOn) {
          const unlockRes = await sb.rpc('documents_vault_unlock', { p_code: '' });
          if (!unlockRes.error && (unlockRes.data?.ok || unlockRes.data?.error === 'code_not_set')) {
            totalsUnlocked = true;
            applyTotalsGate();
            return;
          }
          totalsUnlocked = true;
          applyTotalsGate();
          return;
        }
      } catch (_) { /* fall through to modal */ }
    }
    openTotalsModal();
  }

  function closeTotalsModal() {
    if (totalsCodeInput) totalsCodeInput.value = '';
    if (!totalsModal) return;
    totalsModal.hidden = true;
    totalsModal.setAttribute('aria-hidden', 'true');
    const open = document.querySelector('.admin-modal:not([hidden])');
    if (!open) document.body.classList.remove('admin-modal-open');
  }

  function lockTotals() {
    totalsUnlocked = false;
    applyTotalsGate();
    closeTotalsModal();
  }

  async function submitTotalsUnlock(event) {
    event.preventDefault();
    if (totalsBusy) return;
    const code = String(totalsCodeInput?.value || '').trim();
    const sb = getSb();
    if (!sb) {
      showTotalsFormError('Supabase לא מחובר');
      return;
    }
    totalsBusy = true;
    showTotalsFormError('');
    try {
      const { data, error } = await sb.rpc('documents_vault_unlock', { p_code: code });
      if (totalsCodeInput) totalsCodeInput.value = '';
      if (error) throw error;
      const res = data || {};
      if (!res.ok) {
        if (!code) showTotalsFormError('הזינו קוד גישה');
        else if (res.error === 'invalid_code') showTotalsFormError('קוד שגוי');
        else if (res.error === 'code_not_set') {
          totalsUnlocked = true;
          applyTotalsGate();
          closeTotalsModal();
          return;
        } else if (res.error === 'not_authenticated') showTotalsFormError('יש להתחבר לאדמין');
        else showTotalsFormError(res.error || 'שגיאה');
        return;
      }
      totalsUnlocked = true;
      applyTotalsGate();
      closeTotalsModal();
    } catch (err) {
      showTotalsFormError(err?.message || 'הכניסה נכשלה');
    } finally {
      totalsBusy = false;
    }
  }

  async function syncTotalsUnlockedFromServer() {
    const sb = getSb();
    if (!sb) return;
    try {
      const { data, error } = await sb.rpc('documents_vault_is_unlocked');
      if (error) throw error;
      if (data) {
        totalsUnlocked = true;
        applyTotalsGate();
      }
    } catch (_) { /* keep locked UI */ }
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toLocalYmd(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function todayLocalYmd() {
    return toLocalYmd(new Date());
  }

  function shiftLocalYmd(ymd, deltaDays) {
    const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : new Date();
    date.setDate(date.getDate() + deltaDays);
    return toLocalYmd(date);
  }

  function updateDayStepButtons() {
    const selected = dateInput?.value || '';
    if (nextDayBtn) nextDayBtn.disabled = !selected || selected >= todayLocalYmd();
  }

  function formatDisplayDate(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd || '';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  }

  function roundMoney(amount) {
    return Math.round((Number(amount) || 0) * 100) / 100;
  }

  function parseMoneyInput(value) {
    const n = Number(String(value ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return null;
    return roundMoney(n);
  }

  function inclusiveTotal(cash, credit, tip) {
    return roundMoney(roundMoney(cash) + roundMoney(credit) + roundMoney(tip));
  }

  function savedReportAmounts(report) {
    if (!report || typeof report !== 'object') return null;
    const cash = Number(report.cash);
    const credit = Number(report.credit);
    const tip = Number(report.tip);
    if (![cash, credit, tip].every((n) => Number.isFinite(n) && n >= 0)) return null;
    return {
      cash: roundMoney(cash),
      credit: roundMoney(credit),
      tip: roundMoney(tip),
    };
  }

  /**
   * Saved till_day_reports wins over live closes, including a row of zeros.
   * The third argument used to be a local edit snapshot and is ignored.
   */
  function displayedSales(live, report) {
    const saved = savedReportAmounts(report);
    if (saved) {
      return { ...saved, source: 'report' };
    }
    return {
      cash: roundMoney(live?.cash),
      credit: roundMoney(live?.credit),
      tip: roundMoney(live?.tip),
      source: 'live',
    };
  }

  /**
   * Sales screen source order: lock, then saved day report, then live closes.
   */
  function salesScreenFigures(lock, report, live) {
    const core = dailyLockApi();
    if (lock && core?.isLocked?.(lock)) {
      return {
        cash: roundMoney(lock.cash),
        credit: roundMoney(lock.credit),
        tip: roundMoney(lock.tip),
        sales: roundMoney(lock.sales),
        source: 'lock',
        locked: true,
      };
    }
    const shown = displayedSales(live, report);
    return {
      cash: shown.cash,
      credit: shown.credit,
      tip: shown.tip,
      sales: roundMoney(shown.cash + shown.credit),
      source: shown.source,
      locked: false,
    };
  }

  function isLayersMissingError(err) {
    return err?.code === 'TILL_DAY_LAYERS_MISSING'
      || /TILL_DAY_LAYERS_MISSING|till_day_openings|till_day_reports/i.test(String(err?.message || ''));
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sessionPaidAmount(row) {
    const cash = Number(row?.paid_cash);
    const credit = Number(row?.paid_credit);
    const hasCash = row?.paid_cash != null && Number.isFinite(cash);
    const hasCredit = row?.paid_credit != null && Number.isFinite(credit);
    if (hasCash || hasCredit) {
      return Math.max(0, Math.round(((hasCash ? cash : 0) + (hasCredit ? credit : 0)) * 100) / 100);
    }
    if (row?.paid_total != null && Number.isFinite(Number(row.paid_total))) {
      return Math.max(0, Number(row.paid_total));
    }
    const sub = Number(row?.subtotal) || 0;
    const disc = Number(row?.discount_amount) || 0;
    const fee = Number(row?.delivery_fee) || 0;
    return Math.max(0, Math.round((sub - disc + fee) * 100) / 100);
  }

  function sessionCashAmount(row) {
    if (row?.paid_cash != null && Number.isFinite(Number(row.paid_cash))) {
      return Math.max(0, Number(row.paid_cash));
    }
    if (String(row?.payment_method || '').toLowerCase() === 'cash') {
      return sessionPaidAmount(row);
    }
    return 0;
  }

  function sessionCreditAmount(row) {
    if (row?.paid_credit != null && Number.isFinite(Number(row.paid_credit))) {
      return Math.max(0, Number(row.paid_credit));
    }
    if (String(row?.payment_method || '').toLowerCase() === 'credit') {
      return sessionPaidAmount(row);
    }
    return 0;
  }

  function sessionTipCashAmount(row) {
    if (row?.paid_tip_cash != null && Number.isFinite(Number(row.paid_tip_cash))) {
      return Math.max(0, Number(row.paid_tip_cash));
    }
    return 0;
  }

  function sessionTipCreditAmount(row) {
    if (row?.paid_tip_credit != null && Number.isFinite(Number(row.paid_tip_credit))) {
      return Math.max(0, Number(row.paid_tip_credit));
    }
    return 0;
  }

  function sessionTipAmount(row) {
    if (row?.paid_tip != null && Number.isFinite(Number(row.paid_tip))) {
      return Math.max(0, Number(row.paid_tip));
    }
    return Math.round((sessionTipCashAmount(row) + sessionTipCreditAmount(row)) * 100) / 100;
  }

  function buildSummary(rows) {
    let cash = 0;
    let credit = 0;
    let tip = 0;
    (rows || []).forEach((row) => {
      const method = String(row?.payment_method || '').toLowerCase();
      if (method !== 'cash' && method !== 'credit' && method !== 'split') return;
      cash += sessionCashAmount(row);
      credit += sessionCreditAmount(row);
      tip += sessionTipAmount(row);
    });
    return {
      cash: Math.round(cash * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      tip: Math.round(tip * 100) / 100,
    };
  }

  function normalizeSearch(value) {
    return String(value || '').trim().toLowerCase();
  }

  function loadMenuCategories() {
    productCategoryById = new Map();
    menuCategories = [];
    const heCats = window.TRANSLATIONS?.he?.categories || {};
    const menu = window.MENU_DATA;

    (menu?.categories || []).forEach((cat) => {
      if (!cat?.id) return;
      const title = heCats[cat.id] || cat.id;
      menuCategories.push({ id: String(cat.id), title: String(title) });
      const lists = [cat.items || []];
      (cat.subsections || []).forEach((sub) => lists.push(sub.items || []));
      lists.forEach((list) => {
        list.forEach((item) => {
          if (item?.id) productCategoryById.set(String(item.id), String(cat.id));
        });
      });
    });

    (window.HOT_SIDE_ITEMS || []).forEach((item) => {
      if (item?.id) productCategoryById.set(String(item.id), 'hotSides');
    });

    (window.SHABBAT_MENU_DATA?.categories || []).forEach((cat) => {
      (cat.items || []).forEach((item) => {
        if (!item?.id || productCategoryById.has(String(item.id))) return;
        productCategoryById.set(String(item.id), String(cat.id || ''));
      });
    });
  }

  function renderCategoryChips() {
    if (!catsEl) return;
    const chips = [{ id: 'all', title: 'הכול' }, ...menuCategories];
    catsEl.innerHTML = chips.map((cat) => (
      `<button type="button" class="admin-till-cat${selectedCategory === cat.id ? ' is-active' : ''}" data-till-cat="${escapeHtml(cat.id)}" role="tab" aria-selected="${selectedCategory === cat.id ? 'true' : 'false'}">${escapeHtml(cat.title)}</button>`
    )).join('');
  }

  function visibleProducts() {
    const q = normalizeSearch(searchQuery);
    return (cache.products || []).filter((row) => {
      if (selectedCategory !== 'all') {
        const catId = productCategoryById.get(String(row.productId || ''));
        if (catId !== selectedCategory) return false;
      }
      if (!q) return true;
      const hay = `${row.name || ''} ${row.productId || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderProducts() {
    if (!productsListEl || !productsEmptyEl) return;
    const all = Array.isArray(cache.products) ? cache.products : [];
    const products = visibleProducts();

    if (!products.length) {
      productsListEl.hidden = true;
      productsListEl.innerHTML = '';
      productsEmptyEl.hidden = false;
      productsEmptyEl.textContent = (!all.length)
        ? 'אין מוצרים שנמכרו ביום זה'
        : 'אין מוצרים שמתאימים לחיפוש';
      return;
    }
    productsEmptyEl.hidden = true;
    productsListEl.hidden = false;
    productsListEl.innerHTML = products.map((row) => (
      `<li class="admin-till-products__item">`
      + `<span class="admin-till-products__name">${escapeHtml(row.name)}</span>`
      + `<span class="admin-till-products__qty" dir="ltr">${Number(row.qty) || 0}</span>`
      + `</li>`
    )).join('');
  }

  function dailyLockApi() {
    return window.LechaimAdminDailyLock || null;
  }

  function cardFigures() {
    return salesScreenFigures(cache.lock, cache.report, cache.live);
  }

  function applyLockChrome(locked) {
    if (lockBtn) lockBtn.hidden = locked;
    if (editReportBtn) editReportBtn.hidden = locked;
    if (correctBtn) correctBtn.hidden = !locked;
    if (historyBtn) historyBtn.hidden = !locked;
    if (lockBadge) lockBadge.hidden = !locked;
    if (summaryCard) summaryCard.classList.toggle('is-locked', locked);
  }

  function renderSummary() {
    const shown = cardFigures();
    const sales = shown.sales;
    applyLockChrome(shown.locked);
    if (dateLabelEl) dateLabelEl.textContent = formatDisplayDate(cache.date);
    if (totalEl) totalEl.textContent = formatMoney(sales);
    if (cashEl) cashEl.textContent = formatMoney(shown.cash);
    if (creditEl) creditEl.textContent = formatMoney(shown.credit);
    if (tipEl) tipEl.textContent = formatMoney(shown.tip);
    if (openingInput && document.activeElement !== openingInput) {
      openingInput.value = cache.opening == null ? '' : String(cache.opening);
    }
    renderProducts();
  }

  function buildWhatsAppText() {
    const shown = cardFigures();
    const sales = shown.sales;
    return [
      formatDisplayDate(cache.date),
      `סה״כ מכירות ${formatMoney(sales)}`,
      `סה״כ מזומן ${formatMoney(shown.cash)}`,
      `סה״כ אשראי ${formatMoney(shown.credit)}`,
      `סה״כ טיפים ${formatMoney(shown.tip)}`,
    ].join('\n');
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

  async function copyTillText() {
    const text = buildWhatsAppText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  /**
   * Opens WhatsApp with the till summary already filled in
   * (date + cash + credit — same as the card).
   * Desktop → WhatsApp Web · Mobile → WhatsApp Business.
   * Also copies the text so it can be pasted into the till group if needed.
   */
  async function openTillWhatsApp() {
    const textEnc = encodeURIComponent(buildWhatsAppText());
    await copyTillText();

    if (!isMobileDevice()) {
      openExternalUrl(`https://web.whatsapp.com/send?text=${textEnc}`);
      return;
    }

    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      const fallback = `https://wa.me/?text=${textEnc}`;
      openExternalUrl(
        `intent://send/?text=${textEnc}`
        + '#Intent;scheme=whatsapp;package=com.whatsapp.w4b;'
        + `S.browser_fallback_url=${encodeURIComponent(fallback)};end`
      );
      return;
    }

    openExternalUrl(`https://wa.me/?text=${textEnc}`);
  }

  function setDateAndLoad(ymd) {
    if (!dateInput || !ymd) return;
    dateInput.value = ymd;
    updateDayStepButtons();
    scheduleRefresh();
  }

  async function loadSoldProducts(api, date) {
    if (typeof api.getDailySoldProducts !== 'function') return [];
    try {
      const list = await api.getDailySoldProducts(date);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      console.warn('[admin-till] sold products failed', err);
      return [];
    }
  }

  async function loadTillLayers(api, date) {
    const out = { opening: null, report: null, missing: false };
    const jobs = [];
    if (typeof api.getTillDayOpening === 'function') {
      jobs.push(
        api.getTillDayOpening(date)
          .then((row) => { out.opening = row?.amount == null ? null : roundMoney(row.amount); })
          .catch((err) => {
            if (isLayersMissingError(err)) out.missing = true;
            else console.warn('[admin-till] opening load failed', err);
          })
      );
    }
    if (typeof api.getTillDayReport === 'function') {
      jobs.push(
        api.getTillDayReport(date)
          .then((row) => {
            out.report = row
              ? { cash: roundMoney(row.cash), credit: roundMoney(row.credit), tip: roundMoney(row.tip) }
              : null;
          })
          .catch((err) => {
            if (isLayersMissingError(err)) out.missing = true;
            else console.warn('[admin-till] edited report load failed', err);
          })
      );
    }
    if (jobs.length) await Promise.all(jobs);
    return out;
  }

  async function loadDailyLock(api, date) {
    if (typeof api?.getDailyReportLock !== 'function') return null;
    try {
      return await api.getDailyReportLock(date);
    } catch (err) {
      console.warn('[admin-till] daily lock load failed', err);
      return null;
    }
  }

  async function loadReport() {
    const api = OrdersApi();
    const date = dateInput?.value || todayLocalYmd();
    if (dateInput && !dateInput.value) dateInput.value = date;

    if (!api?.isConfigured?.() || typeof api.getDailyTillReport !== 'function') {
      showError('מכירות לא זמינות — בדקו חיבור Supabase');
      cache = emptyCache(date);
      renderSummary();
      return;
    }

    const seq = ++loadSeq;
    try {
      const beforeGoLive = date < TILL_COUNT_FROM_YMD;
    const [rows, products, layers, lock] = await Promise.all([
      beforeGoLive ? Promise.resolve([]) : api.getDailyTillReport(date),
      beforeGoLive ? Promise.resolve([]) : loadSoldProducts(api, date),
      loadTillLayers(api, date),
      loadDailyLock(api, date),
    ]);
      if (seq !== loadSeq) return;
      const sums = beforeGoLive ? { cash: 0, credit: 0, tip: 0 } : buildSummary(rows);
      cache = {
        date,
        live: sums,
        report: layers.report,
        base: null,
        opening: layers.opening,
        products: beforeGoLive ? [] : products,
      rows: beforeGoLive ? [] : (Array.isArray(rows) ? rows : []),
        layersMissing: layers.missing,
        lock: lock || null,
      };
      rememberTodayHold(cache);
      showError(layers.missing
        ? 'חסרות טבלאות קופה יומית — הריצו supabase-till-day-layers.sql'
        : '');
      renderSummary();
      notifyDashboard();
    } catch (err) {
      if (seq !== loadSeq) return;
      console.error('[admin-till] load failed', err);
      const msg = String(err?.message || '');
      if (msg.includes('payment_method') || msg.includes('paid_total') || msg.includes('paid_cash') || msg.includes('paid_tip') || msg.includes('column')) {
        showError('חסרות עמודות קופה — הריצו supabase-till-payment.sql ו-supabase-till-tip-and-void-gate.sql');
      } else {
        showError('לא ניתן לטעון את המכירות');
      }
      cache = emptyCache(date);
      rememberTodayHold(cache);
      renderSummary();
      notifyDashboard();
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      void loadReport();
    }, 280);
  }

  function showEditReportError(message) {
    if (!editReportError) return;
    if (!message) {
      editReportError.hidden = true;
      editReportError.textContent = '';
      return;
    }
    editReportError.hidden = false;
    editReportError.textContent = message;
  }

  function updateEditInclusive() {
    if (!editInclusiveEl) return;
    const cash = parseMoneyInput(editCashInput?.value);
    const credit = parseMoneyInput(editCreditInput?.value);
    const tip = parseMoneyInput(editTipInput?.value);
    if (cash == null || credit == null || tip == null) {
      editInclusiveEl.textContent = '—';
      return;
    }
    editInclusiveEl.textContent = formatMoney(inclusiveTotal(cash, credit, tip));
  }

  function openEditReportModal() {
    if (cache.lock) return;
    const shown = displayedSales(cache.live, cache.report);
    if (editReportDateEl) {
      editReportDateEl.textContent = formatDisplayDate(dateInput?.value || cache.date || todayLocalYmd());
    }
    if (editCashInput) editCashInput.value = String(shown.cash);
    if (editCreditInput) editCreditInput.value = String(shown.credit);
    if (editTipInput) editTipInput.value = String(shown.tip);
    showEditReportError('');
    updateEditInclusive();
    if (!editReportModal) return;
    editReportModal.hidden = false;
    editReportModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    window.setTimeout(() => editCashInput?.focus(), 50);
  }

  function closeEditReportModal() {
    if (!editReportModal) return;
    editReportModal.hidden = true;
    editReportModal.setAttribute('aria-hidden', 'true');
    const open = document.querySelector('.admin-modal:not([hidden])');
    if (!open) document.body.classList.remove('admin-modal-open');
  }

  function lockErrorText(err) {
    const code = err?.code || '';
    if (code === 'DAILY_REPORT_ALREADY_LOCKED') return 'היום כבר נעול';
    if (code === 'DAILY_REPORT_REASON_REQUIRED') return 'חובה לכתוב סיבת תיקון';
    if (code === 'DAILY_REPORT_LOCKED') return 'היום נעול. לשינוי צריך תיקון דיווח';
    if (code === 'DAILY_REPORT_LOCKS_MISSING') return 'חסרות טבלאות דיווח נעול — הריצו supabase-daily-report-locks.sql';
    return err?.message || 'לא ניתן לשמור את הדיווח';
  }

  function setModalError(el, message) {
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  }

  function setModalOpen(modal, open) {
    if (!modal) return;
    modal.hidden = !open;
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    const anyOpen = document.querySelector('.admin-modal:not([hidden])');
    document.body.classList.toggle('admin-modal-open', Boolean(anyOpen));
  }

  function openLockModal() {
    const shown = cardFigures();
    if (lockPreview) {
      lockPreview.textContent = [
        `מזומן ${formatMoney(shown.cash)}`,
        `אשראי ${formatMoney(shown.credit)}`,
        `טיפים ${formatMoney(shown.tip)}`,
        `סה״כ מכירות ${formatMoney(shown.sales)}`,
      ].join(' · ');
    }
    setModalError(lockError, '');
    setModalOpen(lockModal, true);
  }

  async function submitLock(event) {
    event.preventDefault();
    const shown = cardFigures();
    const api = OrdersApi();
    const date = dateInput?.value || cache.date || todayLocalYmd();
    if (typeof api?.createDailyReportLock !== 'function') {
      setModalError(lockError, 'נעילת דיווח לא זמינה');
      return;
    }
    setModalError(lockError, '');
    try {
      const row = await api.createDailyReportLock(date, {
        cash: shown.cash,
        credit: shown.credit,
        tip: shown.tip,
        source: 'till',
      });
      cache.lock = row;
      renderSummary();
      setModalOpen(lockModal, false);
    } catch (err) {
      console.error('[admin-till] lock report', err);
      setModalError(lockError, lockErrorText(err));
    }
  }

  function updateCorrectSales() {
    if (!correctSalesEl) return;
    const cash = parseMoneyInput(correctCashInput?.value);
    const credit = parseMoneyInput(correctCreditInput?.value);
    if (cash == null || credit == null) {
      correctSalesEl.textContent = '—';
      return;
    }
    correctSalesEl.textContent = formatMoney(roundMoney(cash + credit));
  }

  function openCorrectModal() {
    if (!cache.lock) return;
    if (correctCashInput) correctCashInput.value = String(cache.lock.cash);
    if (correctCreditInput) correctCreditInput.value = String(cache.lock.credit);
    if (correctTipInput) correctTipInput.value = String(cache.lock.tip);
    if (correctReasonInput) correctReasonInput.value = '';
    updateCorrectSales();
    setModalError(correctError, '');
    setModalOpen(correctModal, true);
    window.setTimeout(() => correctReasonInput?.focus(), 50);
  }

  async function submitCorrection(event) {
    event.preventDefault();
    const cash = parseMoneyInput(correctCashInput?.value);
    const credit = parseMoneyInput(correctCreditInput?.value);
    const tip = parseMoneyInput(correctTipInput?.value);
    const reason = String(correctReasonInput?.value || '').trim();
    if (cash == null || credit == null || tip == null) {
      setModalError(correctError, 'הזינו סכומים תקינים');
      return;
    }
    if (!reason) {
      setModalError(correctError, 'חובה לכתוב סיבת תיקון');
      return;
    }
    const api = OrdersApi();
    const date = dateInput?.value || cache.date || todayLocalYmd();
    if (typeof api?.correctDailyReportLock !== 'function') {
      setModalError(correctError, 'תיקון דיווח לא זמין');
      return;
    }
    setModalError(correctError, '');
    try {
      const row = await api.correctDailyReportLock(date, { cash, credit, tip, reason });
      cache.lock = row;
      renderSummary();
      setModalOpen(correctModal, false);
    } catch (err) {
      console.error('[admin-till] correct report', err);
      setModalError(correctError, lockErrorText(err));
    }
  }

  function formatStamp(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function openHistoryModal() {
    setModalError(historyError, '');
    if (historyList) historyList.innerHTML = '';
    setModalOpen(historyModal, true);
    const api = OrdersApi();
    const date = dateInput?.value || cache.date || todayLocalYmd();
    if (typeof api?.getDailyReportRevisions !== 'function') {
      setModalError(historyError, 'היסטוריה לא זמינה');
      return;
    }
    try {
      const rows = await api.getDailyReportRevisions(date);
      if (!historyList) return;
      if (!rows.length) {
        historyList.innerHTML = '<p class="admin-till-history__empty">אין היסטוריה ליום זה</p>';
        return;
      }
      historyList.innerHTML = rows.map((row) => {
        const title = row.action === 'correct' ? 'תיקון' : 'דיווח מקורי';
        const who = row.created_by || '—';
        const reason = row.action === 'correct' && row.reason
          ? `<p class="admin-till-history__reason">סיבה: ${escapeHtml(row.reason)}</p>`
          : '';
        return `<article class="admin-till-history__item">`
          + `<h3>${escapeHtml(title)}</h3>`
          + `<p>${escapeHtml(formatStamp(row.created_at))} · ${escapeHtml(who)}</p>`
          + `<p>מזומן ${escapeHtml(formatMoney(row.cash))} · אשראי ${escapeHtml(formatMoney(row.credit))} · טיפים ${escapeHtml(formatMoney(row.tip))} · מכירות ${escapeHtml(formatMoney(row.sales))}</p>`
          + reason
          + `</article>`;
      }).join('');
    } catch (err) {
      console.error('[admin-till] lock history', err);
      setModalError(historyError, lockErrorText(err));
    }
  }

  async function submitEditReport(event) {
    event.preventDefault();
    if (editReportBusy) return;
    if (cache.lock) {
      showEditReportError('היום נעול. לשינוי צריך תיקון דיווח');
      return;
    }
    const cash = parseMoneyInput(editCashInput?.value);
    const credit = parseMoneyInput(editCreditInput?.value);
    const tip = parseMoneyInput(editTipInput?.value);
    if (cash == null || credit == null || tip == null) {
      showEditReportError('הזינו סכומים תקינים');
      return;
    }
    const api = OrdersApi();
    const date = dateInput?.value || cache.date || todayLocalYmd();
    if (typeof api?.upsertTillDayReport !== 'function') {
      showEditReportError('חסרות טבלאות קופה יומית — הריצו supabase-till-day-layers.sql');
      return;
    }
    editReportBusy = true;
    showEditReportError('');
    try {
      const row = await api.upsertTillDayReport(date, { cash, credit, tip });
      cache.report = {
        cash: roundMoney(row?.cash ?? cash),
        credit: roundMoney(row?.credit ?? credit),
        tip: roundMoney(row?.tip ?? tip),
      };
      cache.base = null;
      renderSummary();
      closeEditReportModal();
    } catch (err) {
      console.error('[admin-till] edit report save', err);
      if (err?.code === 'DAILY_REPORT_LOCKED') {
        showEditReportError('היום נעול. לשינוי צריך תיקון דיווח');
      } else if (isLayersMissingError(err)) {
        showEditReportError('חסרות טבלאות קופה יומית — הריצו supabase-till-day-layers.sql');
      } else {
        showEditReportError('לא ניתן לשמור את הדוח');
      }
    } finally {
      editReportBusy = false;
    }
  }

  async function submitOpening(event) {
    event.preventDefault();
    if (openingBusy) return;
    const amount = parseMoneyInput(openingInput?.value);
    if (amount == null) {
      showError('סכום פתיחת קופה לא תקין');
      return;
    }
    const api = OrdersApi();
    const date = dateInput?.value || cache.date || todayLocalYmd();
    if (typeof api?.upsertTillDayOpening !== 'function') {
      showError('חסרות טבלאות קופה יומית — הריצו supabase-till-day-layers.sql');
      return;
    }
    openingBusy = true;
    if (openingSaveBtn) openingSaveBtn.disabled = true;
    try {
      const row = await api.upsertTillDayOpening(date, amount);
      cache.opening = roundMoney(row?.amount ?? amount);
      showError('');
      renderSummary();
    } catch (err) {
      console.error('[admin-till] opening save', err);
      showError(isLayersMissingError(err)
        ? 'חסרות טבלאות קופה יומית — הריצו supabase-till-day-layers.sql'
        : 'לא ניתן לשמור את פתיחת הקופה');
    } finally {
      openingBusy = false;
      if (openingSaveBtn) openingSaveBtn.disabled = false;
    }
  }

  function start() {
    if (!dateInput && !cashEl) return;
    if (started) return;
    started = true;
    if (dateInput && !dateInput.value) dateInput.value = todayLocalYmd();
    if (searchInput) {
      const unlockSearch = () => searchInput.removeAttribute('readonly');
      searchInput.addEventListener('focus', unlockSearch);
      searchInput.addEventListener('pointerdown', unlockSearch);
      window.setTimeout(() => {
        const v = String(searchInput.value || '').trim();
        if (!v) return;
        // Drop browser login autofill (email/username) from product search.
        if (/@/.test(v) || /lechaim/i.test(v)) {
          searchInput.value = '';
          searchQuery = '';
          renderProducts();
        }
      }, 0);
      window.setTimeout(() => {
        const v = String(searchInput.value || '').trim();
        if (/@/.test(v) || /lechaim/i.test(v)) {
          searchInput.value = '';
          searchQuery = '';
          renderProducts();
        }
        searchInput.setAttribute('readonly', 'readonly');
      }, 120);
    }
    dateInput?.addEventListener('change', () => {
      updateDayStepButtons();
      scheduleRefresh();
    });
    prevDayBtn?.addEventListener('click', () => {
      const current = dateInput?.value || cache.date || todayLocalYmd();
      setDateAndLoad(shiftLocalYmd(current, -1));
    });
    todayBtn?.addEventListener('click', () => { setDateAndLoad(todayLocalYmd()); });
    nextDayBtn?.addEventListener('click', () => {
      const current = dateInput?.value || cache.date || todayLocalYmd();
      const today = todayLocalYmd();
      if (current >= today) return;
      setDateAndLoad(shiftLocalYmd(current, 1));
    });
    updateDayStepButtons();
    searchInput?.addEventListener('input', () => {
      searchQuery = searchInput.value || '';
      renderProducts();
    });
    catsEl?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-till-cat]');
      if (!btn || !catsEl.contains(btn)) return;
      selectedCategory = String(btn.getAttribute('data-till-cat') || 'all');
      renderCategoryChips();
      renderProducts();
    });
    loadMenuCategories();
    renderCategoryChips();
    whatsappBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      void openTillWhatsApp();
    });
    unlockTotalsBtn?.addEventListener('click', () => {
      void requestTotalsUnlock();
    });
    totalsForm?.addEventListener('submit', (event) => {
      submitTotalsUnlock(event).catch(() => {});
    });
    document.getElementById('till-totals-cancel')?.addEventListener('click', closeTotalsModal);
    document.getElementById('till-totals-backdrop')?.addEventListener('click', closeTotalsModal);
    openingForm?.addEventListener('submit', (event) => {
      submitOpening(event).catch(() => {});
    });
    editReportBtn?.addEventListener('click', openEditReportModal);
    lockBtn?.addEventListener('click', openLockModal);
    lockForm?.addEventListener('submit', (event) => {
      submitLock(event).catch(() => {});
    });
    document.getElementById('till-lock-cancel')?.addEventListener('click', () => setModalOpen(lockModal, false));
    document.getElementById('till-lock-backdrop')?.addEventListener('click', () => setModalOpen(lockModal, false));
    correctBtn?.addEventListener('click', openCorrectModal);
    correctForm?.addEventListener('submit', (event) => {
      submitCorrection(event).catch(() => {});
    });
    correctCashInput?.addEventListener('input', updateCorrectSales);
    correctCreditInput?.addEventListener('input', updateCorrectSales);
    document.getElementById('till-correct-cancel')?.addEventListener('click', () => setModalOpen(correctModal, false));
    document.getElementById('till-correct-backdrop')?.addEventListener('click', () => setModalOpen(correctModal, false));
    historyBtn?.addEventListener('click', () => {
      openHistoryModal().catch(() => {});
    });
    document.getElementById('till-lock-history-close')?.addEventListener('click', () => setModalOpen(historyModal, false));
    document.getElementById('till-lock-history-backdrop')?.addEventListener('click', () => setModalOpen(historyModal, false));
    editReportForm?.addEventListener('submit', (event) => {
      submitEditReport(event).catch(() => {});
    });
    editCashInput?.addEventListener('input', updateEditInclusive);
    editCreditInput?.addEventListener('input', updateEditInclusive);
    editTipInput?.addEventListener('input', updateEditInclusive);
    document.getElementById('till-edit-report-cancel')?.addEventListener('click', closeEditReportModal);
    document.getElementById('till-edit-report-backdrop')?.addEventListener('click', closeEditReportModal);
    applyTotalsGate();
    void syncTotalsUnlockedFromServer();
    void loadReport();
  }

  window.LechaimAdminTill = {
    start,
    refresh: scheduleRefresh,
    lockTotals,
    getDashboardSnapshot,
    onDashboardChange,
    TillMath: {
      sessionPaidAmount,
      sessionCashAmount,
      sessionCreditAmount,
      sessionTipAmount,
      sessionTipCashAmount,
      sessionTipCreditAmount,
      buildSummary,
      displayedSales,
      salesScreenFigures,
      inclusiveTotal,
      roundMoney,
    },
  };
})();
