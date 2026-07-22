/**
 * LECHAIM — Admin coupon statistics
 * Single-card (or multi-coupon table) + orders modal + CSV export.
 */
(function (global) {
  'use strict';

  const root = document.getElementById('coupon-stats-root');
  const modal = document.getElementById('coupon-orders-modal');
  const modalTitle = document.getElementById('coupon-orders-title');
  const modalBody = document.getElementById('coupon-orders-body');
  const modalClose = document.getElementById('coupon-orders-close');
  const modalBackdrop = document.getElementById('coupon-orders-backdrop');

  let reportCache = { summaries: [], ordersByCode: {} };
  let activeCodeKey = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function formatDateShort(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
  }

  function csvEscape(value) {
    const s = String(value == null ? '' : value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadCsv(filename, rows) {
    const header = ['Order', 'Date', 'Table', 'Coupon', 'Before', 'Discount', 'Total'];
    const lines = [header.join(',')];
    rows.forEach((row) => {
      lines.push([
        csvEscape(row.orderLabel),
        csvEscape(formatDateTime(row.date)),
        csvEscape(row.tableNumber != null ? row.tableNumber : (row.orderType === 'takeaway' ? 'SP' : '')),
        csvEscape(row.couponCode),
        csvEscape((Number(row.subtotal) || 0).toFixed(2)),
        csvEscape((Number(row.discountAmount) || 0).toFixed(2)),
        csvEscape((Number(row.total) || 0).toFixed(2)),
      ].join(','));
    });
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function ordersForCode(code) {
    const key = String(code || '').toLowerCase();
    return reportCache.ordersByCode[key] || [];
  }

  function openOrdersModal(code) {
    activeCodeKey = String(code || '').toLowerCase();
    const rows = ordersForCode(code);
    if (modalTitle) modalTitle.textContent = `הזמנות — ${code}`;
    if (modalBody) {
      if (!rows.length) {
        modalBody.innerHTML = '<p class="coupon-orders-empty">אין הזמנות לקופון זה</p>';
      } else {
        modalBody.innerHTML = `
          <div class="coupon-orders-table-wrap">
            <table class="coupon-orders-table">
              <thead>
                <tr>
                  <th>הזמנה</th>
                  <th>תאריך</th>
                  <th>שולחן</th>
                  <th>לפני</th>
                  <th>הנחה</th>
                  <th>סה״כ</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.orderLabel)}</td>
                    <td>${escapeHtml(formatDateShort(row.date))}</td>
                    <td>${escapeHtml(row.tableNumber != null ? String(row.tableNumber) : 'TA')}</td>
                    <td>${escapeHtml(formatMoney(row.subtotal))}</td>
                    <td>${escapeHtml(formatMoney(row.discountAmount))}</td>
                    <td>${escapeHtml(formatMoney(row.total))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    }
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
  }

  function closeOrdersModal() {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    activeCodeKey = null;
  }

  function renderSingleCard(summary) {
    return `
      <article class="coupon-card" data-coupon-code="${escapeHtml(summary.code)}">
        <header class="coupon-card__header">
          <h2 class="coupon-card__title">סטטיסטיקות קופונים</h2>
          <p class="coupon-card__code">קופון: <strong dir="ltr">${escapeHtml(summary.code)}</strong></p>
        </header>
        <hr class="coupon-card__rule" />
        <dl class="coupon-card__stats">
          <div><dt>סה״כ הזמנות</dt><dd>${escapeHtml(String(summary.orders))}</dd></div>
          <div><dt>הכנסות</dt><dd>${escapeHtml(formatMoney(summary.revenue))}</dd></div>
          <div><dt>הנחה שניתנה</dt><dd>${escapeHtml(formatMoney(summary.discountGiven))}</dd></div>
          <div><dt>ממוצע הזמנה</dt><dd>${escapeHtml(formatMoney(summary.averageOrder))}</dd></div>
          <div><dt>שימוש אחרון</dt><dd>${escapeHtml(formatDateTime(summary.lastUsed))}</dd></div>
        </dl>
        <footer class="coupon-card__actions">
          <button type="button" class="admin-btn admin-btn--soft" data-coupon-view="${escapeHtml(summary.code)}">צפה בהזמנות</button>
          <button type="button" class="admin-btn admin-btn--ghost" data-coupon-export="${escapeHtml(summary.code)}">ייצוא CSV</button>
        </footer>
      </article>
    `;
  }

  function renderSummaryTable(summaries) {
    return `
      <article class="coupon-card coupon-card--table">
        <header class="coupon-card__header">
          <h2 class="coupon-card__title">סטטיסטיקות קופונים</h2>
        </header>
        <div class="coupon-orders-table-wrap">
          <table class="coupon-orders-table">
            <thead>
              <tr>
                <th>קופון</th>
                <th>הזמנות</th>
                <th>הכנסות</th>
                <th>הנחה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${summaries.map((row) => `
                <tr data-coupon-row="${escapeHtml(row.code)}">
                  <td dir="ltr"><strong>${escapeHtml(row.code)}</strong></td>
                  <td>${escapeHtml(String(row.orders))}</td>
                  <td>${escapeHtml(formatMoney(row.revenue))}</td>
                  <td>${escapeHtml(formatMoney(row.discountGiven))}</td>
                  <td>
                    <button type="button" class="admin-btn admin-btn--ghost" data-coupon-view="${escapeHtml(row.code)}">הזמנות</button>
                    <button type="button" class="admin-btn admin-btn--ghost" data-coupon-export="${escapeHtml(row.code)}">CSV</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  function render() {
    if (!root) return;
    const summaries = reportCache.summaries || [];
    if (!summaries.length) {
      root.innerHTML = `
        <article class="coupon-card">
          <header class="coupon-card__header">
            <h2 class="coupon-card__title">סטטיסטיקות קופונים</h2>
          </header>
          <p class="coupon-orders-empty">עדיין לא נעשה שימוש בקופונים</p>
        </article>
      `;
      return;
    }
    root.innerHTML = summaries.length === 1
      ? renderSingleCard(summaries[0])
      : renderSummaryTable(summaries);
  }

  async function refresh() {
    const api = global.LechaimSupabaseOrders;
    if (!root) return;
    if (!api?.isConfigured?.() || typeof api.getCouponUsageReport !== 'function') {
      root.innerHTML = '<p class="coupon-orders-empty">Supabase לא מוגדר</p>';
      return;
    }
    root.innerHTML = '<p class="coupon-orders-empty">טוען…</p>';
    try {
      reportCache = await api.getCouponUsageReport();
      render();
    } catch (err) {
      console.error('[admin-coupons] refresh failed', err);
      root.innerHTML = `<p class="coupon-orders-empty">שגיאה בטעינת סטטיסטיקות קופונים</p>`;
    }
  }

  root?.addEventListener('click', (event) => {
    const viewBtn = event.target.closest('[data-coupon-view]');
    if (viewBtn) {
      openOrdersModal(viewBtn.getAttribute('data-coupon-view'));
      return;
    }
    const exportBtn = event.target.closest('[data-coupon-export]');
    if (exportBtn) {
      const code = exportBtn.getAttribute('data-coupon-export');
      const rows = ordersForCode(code);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`lechaim-coupon-${code}-${stamp}.csv`, rows);
      return;
    }
    const row = event.target.closest('[data-coupon-row]');
    if (row) {
      openOrdersModal(row.getAttribute('data-coupon-row'));
    }
  });

  modalClose?.addEventListener('click', closeOrdersModal);
  modalBackdrop?.addEventListener('click', closeOrdersModal);

  global.LechaimAdminCoupons = {
    refresh,
    start() {
      refresh();
    },
  };
})(window);
