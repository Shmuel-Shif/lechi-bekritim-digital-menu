/**
 * LECHAIM — Admin closed-session history by table / takeaway.
 * Compact cards → modal details; delete with confirm.
 */
(function (global) {
  'use strict';

  const pickerEl = document.getElementById('history-picker');
  const detailEl = document.getElementById('history-detail');
  const detailTitle = document.getElementById('history-detail-title');
  const detailList = document.getElementById('history-detail-list');
  const detailEmpty = document.getElementById('history-detail-empty');
  const backBtn = document.getElementById('history-back-btn');
  const resetAllBtn = document.getElementById('history-reset-all-btn');
  const modal = document.getElementById('history-session-modal');
  const modalBackdrop = document.getElementById('history-session-backdrop');
  const modalClose = document.getElementById('history-session-close');
  const modalTitle = document.getElementById('history-session-modal-title');
  const modalBody = document.getElementById('history-session-modal-body');

  const TABLE_MIN = 60;
  const TABLE_MAX = 73;

  let activeKey = null;
  let cacheRows = [];
  let focusTrapRelease = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatClock(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function api() {
    return global.LechaimSupabaseOrders;
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

  function flattenItems(orders) {
    const items = [];
    (orders || []).forEach((order) => {
      (order.order_items || []).forEach((row) => {
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) return;
        items.push({
          name: row.print_name || row.product_name || row.product_id || '',
          qty,
          price: Number(row.price) || 0,
          notes: row.notes == null ? '' : String(row.notes),
        });
      });
    });
    return items;
  }

  function sessionSubtotal(session, items) {
    if (session?.subtotal != null && Number.isFinite(Number(session.subtotal))) {
      return Number(session.subtotal);
    }
    return items.reduce((sum, row) => sum + row.price * row.qty, 0);
  }

  function sessionFinalTotal(session, items) {
    const sub = sessionSubtotal(session, items);
    const discount = Number(session?.discount_amount) || 0;
    return Math.max(0, sub - discount);
  }

  function findCachedRow(sessionId) {
    return cacheRows.find((row) => String(row?.session?.session_id) === String(sessionId)) || null;
  }

  function renderPicker() {
    if (!pickerEl) return;
    closeModal();
    const tables = [];
    for (let n = TABLE_MIN; n <= TABLE_MAX; n += 1) {
      tables.push(`
        <button type="button" class="history-pick-card" data-history-key="table:${n}">
          <span class="history-pick-card__num">${n}</span>
          <span class="history-pick-card__label">שולחן</span>
        </button>
      `);
    }
    tables.push(`
      <button type="button" class="history-pick-card history-pick-card--takeaway" data-history-key="takeaway">
        <span class="history-pick-card__num">TA</span>
        <span class="history-pick-card__label">איסוף עצמי</span>
      </button>
    `);
    pickerEl.innerHTML = `<div class="history-picker__grid">${tables.join('')}</div>`;
    pickerEl.hidden = false;
    if (detailEl) detailEl.hidden = true;
    activeKey = null;
    cacheRows = [];
  }

  function renderSessions(rows, title) {
    cacheRows = Array.isArray(rows) ? rows : [];
    if (detailTitle) detailTitle.textContent = title;
    if (pickerEl) pickerEl.hidden = true;
    if (detailEl) detailEl.hidden = false;

    if (!cacheRows.length) {
      if (detailList) detailList.innerHTML = '';
      if (detailEmpty) {
        detailEmpty.hidden = false;
        detailEmpty.textContent = 'אין היסטוריה לסגירות כאן';
      }
      return;
    }
    if (detailEmpty) detailEmpty.hidden = true;

    if (!detailList) return;
    detailList.innerHTML = `
      <div class="history-session-cards">
        ${cacheRows.map((row) => {
          const session = row.session || {};
          const id = session.session_id || '';
          const items = flattenItems(row.orders);
          const started = session.created_at;
          const finalTotal = sessionFinalTotal(session, items);
          return `
            <article class="history-card" data-session-id="${escapeHtml(id)}">
              <button type="button" class="history-card__main" data-history-open="${escapeHtml(id)}">
                <span class="history-card__time">${escapeHtml(formatClock(started))}</span>
                <span class="history-card__date">${escapeHtml(formatDate(started))}</span>
                <span class="history-card__total">${formatMoney(finalTotal)}</span>
              </button>
              <button
                type="button"
                class="history-card__delete"
                data-history-delete="${escapeHtml(id)}"
                aria-label="מחק כרטיס"
                title="מחק"
              >×</button>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function closeModal() {
    if (!modal) return;
    if (typeof focusTrapRelease === 'function') focusTrapRelease();
    focusTrapRelease = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
  }

  function openSessionModal(sessionId) {
    const row = findCachedRow(sessionId);
    if (!row || !modal) return;
    const session = row.session || {};
    const items = flattenItems(row.orders);
    const started = session.created_at;
    const closed = session.closed_at || session.updated_at;
    const finalTotal = sessionFinalTotal(session, items);
    const discount = Number(session.discount_amount) || 0;
    const sub = sessionSubtotal(session, items);

    if (modalTitle) {
      modalTitle.textContent = session.table_number != null
        ? `שולחן ${session.table_number} · ${formatClock(started)}`
        : `איסוף עצמי · ${formatClock(started)}`;
    }

    const customerHtml = session.customer_name
      ? `<p class="history-session-modal__meta"><strong>לקוח:</strong> ${escapeHtml(session.customer_name)}${session.customer_phone ? ` · ${escapeHtml(session.customer_phone)}` : ''}</p>`
      : '';
    const couponHtml = session.coupon_code
      ? `<p class="history-session-modal__meta"><strong>קופון:</strong> ${escapeHtml(session.coupon_code)}${discount ? ` (−${formatMoney(discount)})` : ''}</p>`
      : '';
    const notesHtml = session.notes
      ? `<p class="history-session-modal__meta"><strong>הערות:</strong> ${escapeHtml(session.notes)}</p>`
      : '';
    const itemsHtml = items.length
      ? `<ul class="history-session-modal__items">${items.map((item) => {
        const note = item.notes
          ? `<span class="history-session-modal__item-note">${escapeHtml(item.notes)}</span>`
          : '';
        return `
          <li>
            <div>
              <span>${escapeHtml(String(item.qty))}× ${escapeHtml(item.name)}</span>
              ${note}
            </div>
            <span>${formatMoney(item.price * item.qty)}</span>
          </li>
        `;
      }).join('')}</ul>`
      : '<p class="history-session__empty-items">אין פריטים</p>';

    if (modalBody) {
      modalBody.innerHTML = `
        <div class="history-session-modal__summary">
          <p><strong>תאריך:</strong> ${escapeHtml(formatDate(started))}</p>
          <p><strong>התחלה:</strong> ${escapeHtml(formatClock(started))}</p>
          <p><strong>נסגר:</strong> ${escapeHtml(formatClock(closed))}</p>
          ${customerHtml}
          ${couponHtml}
          ${notesHtml}
        </div>
        ${itemsHtml}
        <div class="history-session-modal__totals">
          <p><span>ביניים</span><strong>${formatMoney(sub)}</strong></p>
          ${discount ? `<p><span>הנחה</span><strong>−${formatMoney(discount)}</strong></p>` : ''}
          <p class="history-session-modal__grand"><span>סה״כ</span><strong>${formatMoney(finalTotal)}</strong></p>
        </div>
      `;
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    if (typeof focusTrapRelease === 'function') focusTrapRelease();
    const release = global.LechaimFocusTrap?.activate?.(modal);
    focusTrapRelease = typeof release === 'function' ? release : null;
    modalClose?.focus();
  }

  async function deleteSessionCard(sessionId) {
    const ok = await showConfirm(
      'האם אתה בטוח שברצונך למחוק את הכרטיס מההיסטוריה?\nלא ניתן לשחזר.',
      'מחק'
    );
    if (!ok) return;

    const ordersApi = api();
    if (!ordersApi?.deleteClosedSession) {
      showNotice('מחיקה לא זמינה');
      return;
    }

    try {
      await ordersApi.deleteClosedSession(sessionId);
      closeModal();
      cacheRows = cacheRows.filter((row) => String(row?.session?.session_id) !== String(sessionId));
      const title = detailTitle?.textContent || 'היסטוריה';
      renderSessions(cacheRows, title);
      showNotice('הכרטיס נמחק');
    } catch (err) {
      showNotice(err?.message || 'המחיקה נכשלה');
    }
  }

  async function resetAllHistory() {
    const ok = await showConfirm(
      'האם אתה בטוח שברצונך לאפס את כל ההיסטוריה?\nכל הכרטיסים הסגורים של שולחנות ואיסוף עצמי יימחקו לצמיתות.',
      'אפס הכל'
    );
    if (!ok) return;

    const ordersApi = api();
    if (!ordersApi?.deleteAllClosedHistory) {
      showNotice('איפוס לא זמין');
      return;
    }

    try {
      const result = await ordersApi.deleteAllClosedHistory();
      closeModal();
      renderPicker();
      showNotice(`ההיסטוריה אופסה (${result?.deleted ?? 0} כרטיסים)`);
    } catch (err) {
      showNotice(err?.message || 'האיפוס נכשל');
    }
  }

  async function openKey(key) {
    activeKey = key;
    closeModal();
    if (detailList) {
      detailList.innerHTML = '<p class="history-loading">טוען…</p>';
    }
    if (detailEmpty) detailEmpty.hidden = true;
    if (pickerEl) pickerEl.hidden = true;
    if (detailEl) detailEl.hidden = false;

    const ordersApi = api();
    if (!ordersApi?.isConfigured?.()) {
      if (detailTitle) detailTitle.textContent = 'היסטוריה';
      if (detailList) detailList.innerHTML = '';
      if (detailEmpty) {
        detailEmpty.hidden = false;
        detailEmpty.textContent = 'Supabase לא זמין';
      }
      return;
    }

    try {
      if (key === 'takeaway') {
        const rows = await ordersApi.getClosedTakeawaySessions({ limit: 40 });
        renderSessions(rows, 'איסוף עצמי — היסטוריה');
        return;
      }
      const m = String(key || '').match(/^table:(\d+)$/);
      const tableNumber = m ? Number(m[1]) : NaN;
      if (!Number.isFinite(tableNumber)) return;
      const rows = await ordersApi.getClosedSessionsForTable(tableNumber, { limit: 40 });
      renderSessions(rows, `שולחן ${tableNumber}`);
    } catch (err) {
      if (detailList) detailList.innerHTML = '';
      if (detailEmpty) {
        detailEmpty.hidden = false;
        detailEmpty.textContent = err?.message || 'טעינת ההיסטוריה נכשלה';
      }
    }
  }

  function bindOnce() {
    if (bindOnce.done) return;
    bindOnce.done = true;
    pickerEl?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-history-key]');
      if (!btn) return;
      openKey(btn.dataset.historyKey);
    });
    backBtn?.addEventListener('click', () => {
      renderPicker();
    });
    resetAllBtn?.addEventListener('click', () => {
      resetAllHistory();
    });
    detailList?.addEventListener('click', (event) => {
      const delBtn = event.target.closest('[data-history-delete]');
      if (delBtn) {
        event.preventDefault();
        event.stopPropagation();
        deleteSessionCard(delBtn.dataset.historyDelete);
        return;
      }
      const openBtn = event.target.closest('[data-history-open]');
      if (openBtn) {
        openSessionModal(openBtn.dataset.historyOpen);
      }
    });
    modalClose?.addEventListener('click', closeModal);
    modalBackdrop?.addEventListener('click', closeModal);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
    });
  }

  function start() {
    bindOnce();
    activeKey = null;
    renderPicker();
  }

  function stop() {
    closeModal();
  }

  global.LechaimAdminHistory = {
    start,
    stop,
  };
})(window);
