/**
 * LECHAIM — Admin daily till (קופה): compact card + WhatsApp group.
 */
(function () {
  'use strict';

  /** Group: כספים מהקופה מזומן */
  const TILL_WA_GROUP_URL = 'https://chat.whatsapp.com/CZdh0575kLm51knnHwolpg';
  const TILL_WA_GROUP_CODE = 'CZdh0575kLm51knnHwolpg';

  /** Soft reset: counts only from this local day (inclusive). Today (09/08/2026) stays €0. */
  const TILL_COUNT_FROM_YMD = '2026-08-10';

  const dateInput = document.getElementById('admin-till-date');
  const errorEl = document.getElementById('admin-till-error');
  const dateLabelEl = document.getElementById('admin-till-date-label');
  const cashEl = document.getElementById('admin-till-cash');
  const creditEl = document.getElementById('admin-till-credit');
  const whatsappBtn = document.getElementById('admin-till-whatsapp');

  let cache = { date: '', cash: 0, credit: 0 };
  let started = false;
  let refreshTimer = null;
  let loadSeq = 0;

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

  function todayLocalYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  function renderSummary() {
    if (dateLabelEl) dateLabelEl.textContent = formatDisplayDate(cache.date);
    if (cashEl) cashEl.textContent = formatMoney(cache.cash);
    if (creditEl) creditEl.textContent = formatMoney(cache.credit);
  }

  function buildWhatsAppText() {
    return [
      `קופה ${formatDisplayDate(cache.date)}`,
      `מזומן: ${formatMoney(cache.cash)}`,
      `אשראי: ${formatMoney(cache.credit)}`,
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
   * Opens the till WhatsApp group.
   * Desktop → group invite link (then continue in WhatsApp Web if needed).
   * Mobile → WhatsApp Business.
   * Message is copied so it can be pasted in the group.
   */
  async function openTillWhatsApp() {
    await copyTillText();

    if (!isMobileDevice()) {
      openExternalUrl(TILL_WA_GROUP_URL);
      return;
    }

    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      openExternalUrl(
        `intent://chat.whatsapp.com/${TILL_WA_GROUP_CODE}`
        + '#Intent;scheme=https;package=com.whatsapp.w4b;'
        + `S.browser_fallback_url=${encodeURIComponent(TILL_WA_GROUP_URL)};end`
      );
      return;
    }

    openExternalUrl(TILL_WA_GROUP_URL);
  }

  async function loadReport() {
    const api = OrdersApi();
    const date = dateInput?.value || todayLocalYmd();
    if (dateInput && !dateInput.value) dateInput.value = date;

    /* Days before go-live show a clean zero till */
    if (date < TILL_COUNT_FROM_YMD) {
      showError('');
      cache = { date, cash: 0, credit: 0 };
      renderSummary();
      return;
    }

    if (!api?.isConfigured?.() || typeof api.getDailyTillReport !== 'function') {
      showError('קופה לא זמינה — בדקו חיבור Supabase');
      cache = { date, cash: 0, credit: 0 };
      renderSummary();
      return;
    }

    const seq = ++loadSeq;
    try {
      const rows = await api.getDailyTillReport(date);
      if (seq !== loadSeq) return;
      showError('');
      const sums = buildSummary(rows);
      cache = { date, ...sums };
      renderSummary();
    } catch (err) {
      if (seq !== loadSeq) return;
      console.error('[admin-till] load failed', err);
      const msg = String(err?.message || '');
      if (msg.includes('payment_method') || msg.includes('paid_total') || msg.includes('paid_cash') || msg.includes('column')) {
        showError('חסרות עמודות קופה — הריצו supabase-till-payment.sql ב-Supabase');
      } else {
        showError('לא ניתן לטעון את הקופה');
      }
      cache = { date, cash: 0, credit: 0 };
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
