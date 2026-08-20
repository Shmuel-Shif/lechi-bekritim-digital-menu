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
    startOccupiedPoll();
  }

  function onOrderSent() {
    const table = currentTableNumber();
    pingOccupiedTables();
    returnToTables();
    pingOccupiedTables();
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

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function writeLocalRemoteMap(localId, remoteId) {
    if (!localId || !remoteId) return;
    try {
      const raw = localStorage.getItem(MAP_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[String(localId)] = String(remoteId);
      localStorage.setItem(MAP_KEY, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('lechaim:dinein-session-ready'));
    } catch (err) {
      console.warn('[staff-order] session-map write failed', err);
    }
  }

  async function findOpenSessionForTable(table) {
    const api = window.LechaimSupabaseOrders;
    if (!api?.getOpenSessions || !Number.isFinite(table)) return null;
    const open = await api.getOpenSessions();
    return (open || []).find((row) => (
      String(row.order_type || '') === 'dine_in' && Number(row.table_number) === Number(table)
    )) || null;
  }

  function remoteOrdersHaveItems(orders) {
    return (orders || []).some((order) => {
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      if (lines.some((row) => (Number(row.quantity) || 0) > 0)) return true;
      return Number(order?.total) > 0;
    });
  }

  let attachToken = 0;

  async function attachToTable(tableArg) {
    if (!isStaffOrderPage()) return;
    const token = ++attachToken;
    try {
      const table = Number(tableArg) || currentTableNumber();
      if (!Number.isFinite(table) || table <= 0) return;

      const api = window.LechaimSupabaseOrders;
      let remoteId = null;
      let foundItems = false;

      /* Join only — never create a session here. The first send opens the table. */
      for (let attempt = 0; attempt < 12 && token === attachToken; attempt += 1) {
        const existing = await findOpenSessionForTable(table);
        remoteId = existing?.session_id || null;
        if (remoteId && api?.getSessionOrders) {
          writeLocalRemoteMap(currentLocalSessionId(), remoteId);
          const orders = await api.getSessionOrders(remoteId);
          foundItems = remoteOrdersHaveItems(orders);
          if (foundItems) {
            await window.LechaimMenu?.syncRemoteSessionTotal?.(remoteId);
            break;
          }
        }
        await sleep(attempt === 0 ? 120 : 350);
      }
      if (token !== attachToken) return;
      if (!remoteId) return;

      writeLocalRemoteMap(currentLocalSessionId(), remoteId);
      window.LechaimMenu.initRemoteSessionClosedWatcher?.();
      if (!foundItems) {
        await window.LechaimMenu?.syncRemoteSessionTotal?.(remoteId);
      }
    } catch (err) {
      console.warn('[staff-order] attach to table session failed', err);
    }
  }

  async function refreshSessionTotal() {
    if (!isStaffOrderPage()) return;
    try {
      const table = currentTableNumber();
      const existing = table != null ? await findOpenSessionForTable(table) : null;
      const localId = currentLocalSessionId();
      let remoteId = existing?.session_id || null;
      if (!remoteId && localId) {
        try {
          const map = JSON.parse(localStorage.getItem(MAP_KEY) || '{}');
          remoteId = map[localId] || null;
        } catch (_) { /* ignore */ }
      }
      if (!remoteId) return;
      writeLocalRemoteMap(localId, remoteId);
      await window.LechaimMenu?.syncRemoteSessionTotal?.(remoteId);
    } catch (err) {
      console.warn('[staff-order] refresh session total failed', err);
    }
  }

  let occupiedTimer = null;
  let occupiedBc = null;

  function getOccupiedChannel() {
    if (occupiedBc) return occupiedBc;
    if (typeof window.BroadcastChannel !== 'function') return null;
    try {
      occupiedBc = new BroadcastChannel('lechaim-staff-occupied');
      occupiedBc.onmessage = () => {
        window.LechaimEntryGate?.refreshOccupiedTables?.();
      };
    } catch (err) {
      occupiedBc = null;
    }
    return occupiedBc;
  }

  function pingOccupiedTables() {
    window.LechaimEntryGate?.refreshOccupiedTables?.();
    try {
      getOccupiedChannel()?.postMessage({ at: Date.now() });
    } catch (_) { /* ignore */ }
  }

  function startOccupiedPoll() {
    getOccupiedChannel();
    const tick = () => {
      if (!isStaffOrderPage()) return;
      const tableStep = document.getElementById('entry-step-table');
      const onMap = document.body.classList.contains('entry-pending')
        && tableStep
        && !tableStep.hidden;
      if (!onMap) return;
      window.LechaimEntryGate?.refreshOccupiedTables?.();
    };
    tick();
    if (occupiedTimer) return;
    occupiedTimer = window.setInterval(tick, 45000);
  }

  window.LechaimStaffOrder = {
    isActive: true,
    onOrderSent,
    returnToTables,
    discardLocalStaffState,
    attachToTable,
    refreshSessionTotal,
  };

  function boot() {
    if (!isStaffOrderPage()) return;
    applyStaffChrome();
    startOccupiedPoll();
    window.setTimeout(applyStaffChrome, 400);
    document.addEventListener('lechaim:dinein-table-ready', applyStaffChrome);
    document.addEventListener('lechaim:dinein-table-ready', () => {
      void attachToTable(currentTableNumber());
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
