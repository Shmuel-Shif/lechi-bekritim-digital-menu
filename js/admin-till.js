/**
 * LECHAIM — Admin daily sales (מכירות): till money + sold products.
 * Till cash/credit/WhatsApp logic is unchanged.
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
  const whatsappBtn = document.getElementById('admin-till-whatsapp');
  const todayBtn = document.getElementById('admin-till-today');
  const yesterdayBtn = document.getElementById('admin-till-yesterday');
  const productsListEl = document.getElementById('admin-till-products-list');
  const productsEmptyEl = document.getElementById('admin-till-products-empty');
  const searchInput = document.getElementById('admin-till-product-search');
  const catsEl = document.getElementById('admin-till-cats');

  let cache = { date: '', cash: 0, credit: 0, products: [] };
  let started = false;
  let refreshTimer = null;
  let loadSeq = 0;
  let selectedCategory = 'all';
  let searchQuery = '';
  let productCategoryById = new Map();
  let menuCategories = [];

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

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toLocalYmd(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function todayLocalYmd() {
    return toLocalYmd(new Date());
  }

  function yesterdayLocalYmd() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalYmd(d);
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

  function buildSummary(rows) {
    let cash = 0;
    let credit = 0;
    (rows || []).forEach((row) => {
      const method = String(row?.payment_method || '').toLowerCase();
      if (method !== 'cash' && method !== 'credit' && method !== 'split') return;
      cash += sessionCashAmount(row);
      credit += sessionCreditAmount(row);
    });
    return {
      cash: Math.round(cash * 100) / 100,
      credit: Math.round(credit * 100) / 100,
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

  function renderSummary() {
    if (dateLabelEl) dateLabelEl.textContent = formatDisplayDate(cache.date);
    if (cashEl) cashEl.textContent = formatMoney(cache.cash);
    if (creditEl) creditEl.textContent = formatMoney(cache.credit);
    if (totalEl) {
      totalEl.textContent = formatMoney(
        Math.round((Number(cache.cash) + Number(cache.credit)) * 100) / 100
      );
    }
    renderProducts();
  }

  function buildWhatsAppText() {
    /* Same content as the original till card — do not add total/products */
    return [
      formatDisplayDate(cache.date),
      `מזומן ${formatMoney(cache.cash)}`,
      `אשראי ${formatMoney(cache.credit)}`,
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

  async function loadReport() {
    const api = OrdersApi();
    const date = dateInput?.value || todayLocalYmd();
    if (dateInput && !dateInput.value) dateInput.value = date;

    /* Days before go-live show a clean zero till */
    if (date < TILL_COUNT_FROM_YMD) {
      showError('');
      cache = { date, cash: 0, credit: 0, products: [] };
      renderSummary();
      return;
    }

    if (!api?.isConfigured?.() || typeof api.getDailyTillReport !== 'function') {
      showError('מכירות לא זמינות — בדקו חיבור Supabase');
      cache = { date, cash: 0, credit: 0, products: [] };
      renderSummary();
      return;
    }

    const seq = ++loadSeq;
    try {
      const [rows, products] = await Promise.all([
        api.getDailyTillReport(date),
        loadSoldProducts(api, date),
      ]);
      if (seq !== loadSeq) return;
      showError('');
      const sums = buildSummary(rows);
      cache = { date, ...sums, products };
      renderSummary();
    } catch (err) {
      if (seq !== loadSeq) return;
      console.error('[admin-till] load failed', err);
      const msg = String(err?.message || '');
      if (msg.includes('payment_method') || msg.includes('paid_total') || msg.includes('paid_cash') || msg.includes('column')) {
        showError('חסרות עמודות קופה — הריצו supabase-till-payment.sql ב-Supabase');
      } else {
        showError('לא ניתן לטעון את המכירות');
      }
      cache = { date, cash: 0, credit: 0, products: [] };
      renderSummary();
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      void loadReport();
    }, 280);
  }

  function start() {
    if (!dateInput && !cashEl) return;
    if (started) return;
    started = true;
    if (dateInput && !dateInput.value) dateInput.value = todayLocalYmd();
    dateInput?.addEventListener('change', () => { scheduleRefresh(); });
    todayBtn?.addEventListener('click', () => { setDateAndLoad(todayLocalYmd()); });
    yesterdayBtn?.addEventListener('click', () => { setDateAndLoad(yesterdayLocalYmd()); });
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
    void loadReport();
  }

  window.LechaimAdminTill = {
    start,
    refresh: scheduleRefresh,
  };
})();
