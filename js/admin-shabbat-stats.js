/**
 * LECHAIM — Separate Shabbat order statistics (does not alter coupon report)
 */
(function (global) {
  'use strict';

  const root = document.getElementById('shabbat-stats-root');
  if (!root) return;

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n.toFixed(2)}`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('he-IL');
  }

  function payable(row) {
    if (row.subtotal != null && row.discount_amount != null) {
      return Math.max(0, Number(row.subtotal) - Number(row.discount_amount));
    }
    if (row.subtotal != null) return Number(row.subtotal) || 0;
    return 0;
  }

  function render(list) {
    const orders = list.length;
    const revenue = list.reduce((sum, row) => sum + payable(row), 0);
    const withCoupon = list.filter((row) => row.coupon_code).length;
    const discountGiven = list.reduce((sum, row) => sum + (Number(row.discount_amount) || 0), 0);

    root.innerHTML = `
      <article class="coupon-card">
        <header class="coupon-card__header">
          <h2 class="coupon-card__title">סטטיסטיקות הזמנות שבת</h2>
        </header>
        <hr class="coupon-card__rule" />
        <dl class="coupon-card__stats">
          <div><dt>סה״כ הזמנות</dt><dd>${escapeHtml(String(orders))}</dd></div>
          <div><dt>מחזור</dt><dd>${escapeHtml(formatMoney(revenue))}</dd></div>
          <div><dt>הזמנות עם קופון</dt><dd>${escapeHtml(String(withCoupon))}</dd></div>
          <div><dt>הנחה שניתנה</dt><dd>${escapeHtml(formatMoney(discountGiven))}</dd></div>
        </dl>
      </article>
      ${orders
        ? `<div class="coupon-orders-table-wrap" style="margin-top:1rem">
            <table class="coupon-orders-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>לקוח</th>
                  <th>סטטוס</th>
                  <th>קופון</th>
                  <th>סה״כ</th>
                </tr>
              </thead>
              <tbody>
                ${list.slice(0, 80).map((row) => `
                  <tr>
                    <td>${escapeHtml(formatDate(row.created_at))}</td>
                    <td>${escapeHtml(row.customer_name || '—')}</td>
                    <td>${escapeHtml(row.status || '—')}</td>
                    <td dir="ltr">${escapeHtml(row.coupon_code || '—')}</td>
                    <td>${escapeHtml(formatMoney(payable(row)))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
        : '<p class="coupon-orders-empty">עדיין אין הזמנות שבת</p>'}
    `;
  }

  async function loadReport() {
    const api = global.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.getShabbatSessionsReport !== 'function') {
      root.innerHTML = '<p class="coupon-orders-empty">Supabase לא מוגדר</p>';
      return;
    }

    root.innerHTML = '<p class="coupon-orders-empty">טוען…</p>';
    try {
      const list = await api.getShabbatSessionsReport();
      render(list || []);
    } catch (err) {
      console.error('[admin-shabbat-stats] load failed', err);
      root.innerHTML = '<p class="coupon-orders-empty">שגיאה בטעינת סטטיסטיקות שבת</p>';
    }
  }

  global.LechaimAdminShabbatStats = {
    start: loadReport,
  };
})(window);
