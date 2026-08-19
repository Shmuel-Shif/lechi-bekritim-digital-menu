/**
 * LECHAIM — Staff Order (Stage 8)
 * Separate tablet UI on top of the existing dine-in order + Supabase pipeline.
 * Never closes a remote session. Never calls OrderEngine.closeTable / closeOrder.
 */
(function () {
  'use strict';

  const OPEN_ORDERS_KEY = 'lechaim-open-orders';
  const ACTIVE_ORDER_KEY = 'lechaim-active-order';
  const CART_KEY = 'lechaim-keri-cart';
  const MAP_KEY = 'lechaim-supabase-session-map';

  function isStaffOrderPage() {
    return document.body?.getAttribute('data-staff-order') === '1';
  }

  function readJson(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed;
    } catch {
      return null;
    }
  }

  function currentTableNumber() {
    const ctx = window.LechaimOrderContext || {};
    const session = window.LechaimOrderSession?.getSession?.() || {};
    const table = Number(ctx.tableNumber != null ? ctx.tableNumber : session.tableNumber);
    return Number.isFinite(table) && table > 0 ? table : null;
  }

  function currentLocalSessionId() {
    return String(
      window.LechaimOrderSession?.getSession?.()?.sessionId
      || window.LechaimOrderContext?.sessionId
      || ''
    );
  }

  /**
   * Local-only wipe after a successful send (or returning to the map).
   * Does not touch Supabase, print, admin, or order_sessions status.
   */
  function discardLocalStaffState() {
    const table = currentTableNumber();
    const localId = currentLocalSessionId();

    try {
      const list = readJson(OPEN_ORDERS_KEY);
      if (Array.isArray(list)) {
        const next = list.filter((order) => {
          const type = String(order?.orderType || '').toLowerCase();
          const dine = type === 'dinein' || type === 'dine-in' || type === 'dine_in';
          if (!dine || !Number.isFinite(table)) return true;
          return Number(order.tableNumber) !== table;
        });
        localStorage.setItem(OPEN_ORDERS_KEY, JSON.stringify(next));
      }
    } catch (err) {
      console.warn('[staff-order] open-orders clear failed', err);
    }

    try {
      const active = readJson(ACTIVE_ORDER_KEY);
      if (active && (Number(active.tableNumber) === table || !table)) {
        localStorage.removeItem(ACTIVE_ORDER_KEY);
      }
    } catch (err) {
      console.warn('[staff-order] active-order clear failed', err);
    }

    try {
      localStorage.removeItem(CART_KEY);
    } catch (err) {
      console.warn('[staff-order] cart clear failed', err);
    }

    if (localId) {
      try {
        const raw = localStorage.getItem(MAP_KEY);
        const map = raw ? JSON.parse(raw) : {};
        if (map && typeof map === 'object') {
          delete map[localId];
          localStorage.setItem(MAP_KEY, JSON.stringify(map));
        }
      } catch (err) {
        console.warn('[staff-order] session-map clear failed', err);
      }
    }

    try {
      window.LechaimOrderSession?.clearSession?.();
    } catch (err) {
      console.warn('[staff-order] session clear failed', err);
    }

    if (window.LechaimOrderContext) {
      window.LechaimOrderContext = {
        ...window.LechaimOrderContext,
        orderType: null,
        tableNumber: null,
        sessionId: null,
        status: null,
        browseOnly: false,
      };
    }
  }

  function closeStaffUiChrome() {
    document.getElementById('cart-close')?.click();
    document.getElementById('order-receipt-close')?.click();
    document.getElementById('food-modal-close')?.click();
    document.getElementById('sides-modal-close')?.click();
    document.body.classList.remove(
      'cart-open',
      'modal-open',
      'order-receipt-open',
      'help-bot-open'
    );
  }

  function returnToTables() {
    window.LechaimMenu?.stopRemoteSessionWatcher?.();
    discardLocalStaffState();
    closeStaffUiChrome();
    window.LechaimEntryGate?.resetToEntry?.();
  }

  function onOrderSent() {
    const table = currentTableNumber();
    returnToTables();
    const feedback = document.getElementById('order-feedback');
    if (feedback && table != null) {
      feedback.hidden = false;
      feedback.textContent = `שולחן ${table} · ההזמנה נשלחה`;
      window.setTimeout(() => {
        if (feedback.textContent.indexOf(String(table)) !== -1) {
          feedback.hidden = true;
          feedback.textContent = '';
        }
      }, 2200);
    }
  }

  function applyStaffChrome() {
    const title = document.querySelector('.dine-in-map__title');
    if (title) title.textContent = 'בחרו שולחן';
    const tableBtn = document.getElementById('table-toggle');
    if (tableBtn) {
      tableBtn.disabled = false;
      tableBtn.classList.remove('is-locked');
    }
  }

  async function attachToTable() {
    if (!isStaffOrderPage()) return;
    try {
      const ensure = window.LechaimMenu?.ensureDineInRemoteSession;
      if (typeof ensure !== 'function') return;
      const remoteId = await ensure();
      if (!remoteId) return;
      if (typeof window.LechaimMenu.syncRemoteSessionTotal === 'function') {
        await window.LechaimMenu.syncRemoteSessionTotal(remoteId);
      }
      window.LechaimMenu.initRemoteSessionClosedWatcher?.();
    } catch (err) {
      console.warn('[staff-order] attach to table session failed', err);
    }
  }

  window.LechaimStaffOrder = {
    isActive: true,
    onOrderSent,
    returnToTables,
    discardLocalStaffState,
    attachToTable,
  };

  function boot() {
    if (!isStaffOrderPage()) return;
    applyStaffChrome();
    window.setTimeout(applyStaffChrome, 400);
    document.addEventListener('lechaim:dinein-table-ready', applyStaffChrome);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
