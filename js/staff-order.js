/**
 * LECHAIM — Staff Order (Stage 8)
 * Separate tablet UI on top of the existing dine-in order + Supabase pipeline.
 * Never closes a remote session. Never calls OrderEngine.closeTable / closeOrder.
 * Cart has שלח הזמנה + הדפס (no order modal). Print uses LechaimPrintSessionWaves.
 */
(function () {
  'use strict';

  const OPEN_ORDERS_KEY = 'lechaim-open-orders';
  const ACTIVE_ORDER_KEY = 'lechaim-active-order';
  const CART_KEY = 'lechaim-keri-cart';
  const MAP_KEY = 'lechaim-supabase-session-map';

  let printBusy = false;
  let addBusy = false;
  let cachedRemoteId = null;
  let cachedOrders = [];
  const locallyPrintedIds = new Set();

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

  function wavesApi() {
    return window.LechaimPrintSessionWaves || null;
  }

  function printBtn() {
    return document.getElementById('cart-print');
  }

  function addTableBtn() {
    return document.getElementById('cart-add-table');
  }

  /**
   * Local-only wipe after returning to the map.
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

    cachedRemoteId = null;
    cachedOrders = [];
    syncPrintButton();
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

  function showFeedback(message, ms) {
    const feedback = document.getElementById('order-feedback');
    if (!feedback || !message) return;
    feedback.hidden = false;
    feedback.textContent = message;
    window.setTimeout(() => {
      if (feedback.textContent === message) {
        feedback.hidden = true;
        feedback.textContent = '';
      }
    }, ms || 2600);
  }

  function cartHasItems() {
    if (typeof window.LechaimMenu?.getCartCount === 'function') {
      return window.LechaimMenu.getCartCount() > 0;
    }
    const badge = document.getElementById('cart-badge');
    return Number(badge?.getAttribute('data-count') || badge?.textContent || 0) > 0;
  }

  function paintPrintButton() {
    const btn = printBtn();
    if (!btn) return;
    const api = wavesApi();
    const pending = api?.unprintedWaves
      ? api.unprintedWaves(cachedOrders, locallyPrintedIds)
      : [];
    /* Available with cart items (send+print) OR unprinted waves already on Admin. */
    btn.disabled = printBusy || (!cartHasItems() && pending.length === 0);
    btn.textContent = printBusy ? 'מדפיס…' : 'הדפס';
  }

  function paintAddTableButton() {
    const btn = addTableBtn();
    if (!btn) return;
    const tableOk = currentTableNumber() != null;
    btn.disabled = addBusy || !tableOk || !cartHasItems();
    btn.textContent = addBusy ? 'מוסיף…' : '➕ הוסף לשולחן';
  }

  function syncPrintButton() {
    paintPrintButton();
    paintAddTableButton();
  }

  async function refreshPrintState() {
    const api = window.LechaimSupabaseOrders;
    const table = currentTableNumber();
    let remoteId = cachedRemoteId;
    if (!remoteId && table != null) {
      const existing = await findOpenSessionForTable(table);
      remoteId = existing?.session_id || null;
    }
    if (!remoteId) {
      try {
        const map = JSON.parse(localStorage.getItem(MAP_KEY) || '{}');
        remoteId = map[currentLocalSessionId()] || null;
      } catch (_) { /* ignore */ }
    }
    cachedRemoteId = remoteId;
    if (!remoteId || !api?.getSessionOrders) {
      cachedOrders = [];
      syncPrintButton();
      return { remoteId: null, orders: [] };
    }
    const orders = await api.getSessionOrders(remoteId);
    cachedOrders = Array.isArray(orders) ? orders : [];
    syncPrintButton();
    return { remoteId, orders: cachedOrders };
  }

  function returnToTables() {
    window.LechaimMenu?.stopRemoteSessionWatcher?.();
    discardLocalStaffState();
    closeStaffUiChrome();
    window.LechaimEntryGate?.resetToEntry?.();
    startOccupiedPoll();
  }

  /**
   * שלח הזמנה: wave to Admin, not printed (Admin decides when to print).
   * quiet: used when הדפס already submitted the cart.
   */
  function onOrderSent(options = {}) {
    const quiet = Boolean(options?.quiet);
    const table = currentTableNumber();
    pingOccupiedTables();
    if (!quiet) {
      showFeedback(
        table != null
          ? `שולחן ${table} · נשלח לאדמין (בלי הדפסה)`
          : 'נשלח לאדמין (בלי הדפסה)',
        2600
      );
    }
    refreshPrintState().catch((err) => {
      console.warn('[staff-order] print state after send failed', err);
    });
  }

  /**
   * הדפס: if cart has items → send to Admin then print & mark printed.
   * If cart empty but unprinted waves exist → print those only.
   */
  async function handlePrintClick() {
    if (printBusy || addBusy) return;
    const api = wavesApi();
    if (!api?.printUnprintedSessionWaves) {
      showFeedback('הדפסה לא זמינה');
      return;
    }
    printBusy = true;
    syncPrintButton();
    try {
      const hadCart = cartHasItems();
      if (hadCart) {
        const sendFn = window.LechaimMenu?.sendCartOrder;
        if (typeof sendFn !== 'function') {
          showFeedback('שליחה לא זמינה');
          return;
        }
        const sent = await sendFn({ quietStaff: true });
        if (!sent) {
          showFeedback('לא ניתן לשלוח להדפסה');
          return;
        }
      }

      const refreshed = await refreshPrintState();
      if (!refreshed.remoteId) {
        showFeedback(hadCart ? 'ההזמנה נשמרה, אך ההדפסה נכשלה' : 'אין הזמנה להדפסה');
        return;
      }
      const result = await api.printUnprintedSessionWaves({
        tableNumber: currentTableNumber(),
        sessionId: refreshed.remoteId,
        orders: refreshed.orders,
        api: window.LechaimSupabaseOrders,
        printEngine: window.LechaimPrintEngine,
        locallyPrintedIds,
      });
      await refreshPrintState().catch(() => {});
      if (result?.ok && result.printed) {
        showFeedback('הודפס ונשלח לאדמין', 2200);
      } else if (result?.messageKey === 'nothingToPrint') {
        showFeedback('אין פריטים חדשים להדפסה');
      } else if (result?.messageKey === 'orderSavedPrintFailed' || result?.errorCode === 'print_failed') {
        showFeedback('ההזמנה נשמרה, אך ההדפסה נכשלה');
      } else {
        showFeedback('ההדפסה נכשלה');
      }
    } catch (err) {
      console.warn('[staff-order] print failed', err);
      showFeedback('ההזמנה נשמרה, אך ההדפסה נכשלה');
    } finally {
      printBusy = false;
      syncPrintButton();
    }
  }

  /**
   * הוסף לשולחן: append cart into existing session order. No print / no new order row.
   */
  async function handleAddToTableClick() {
    if (addBusy || printBusy) return;
    if (currentTableNumber() == null) {
      showFeedback('אין שולחן פעיל');
      return;
    }
    if (!cartHasItems()) {
      showFeedback('בחרו מנות תחילה');
      return;
    }
    const addFn = window.LechaimMenu?.addCartToActiveTableSession;
    if (typeof addFn !== 'function') {
      showFeedback('הוספה לא זמינה');
      return;
    }
    addBusy = true;
    syncPrintButton();
    try {
      const result = await addFn();
      if (result?.ok) {
        showFeedback('המנות נוספו לשולחן', 2200);
        pingOccupiedTables();
        await refreshPrintState().catch(() => {});
        await refreshSessionTotal().catch(() => {});
      } else {
        showFeedback(result?.message || 'לא ניתן להוסיף לשולחן');
      }
    } catch (err) {
      console.warn('[staff-order] add to table failed', err);
      showFeedback('לא ניתן להוסיף לשולחן');
    } finally {
      addBusy = false;
      syncPrintButton();
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
    syncPrintButton();
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
    if (!isStaffOrderPage()) return null;
    const token = ++attachToken;
    try {
      const table = Number(tableArg) || currentTableNumber();
      if (!Number.isFinite(table) || table <= 0) return null;

      const api = window.LechaimSupabaseOrders;
      let remoteId = null;
      let foundItems = false;
      let orders = [];

      for (let attempt = 0; attempt < 12 && token === attachToken; attempt += 1) {
        const existing = await findOpenSessionForTable(table);
        remoteId = existing?.session_id || null;
        if (remoteId && api?.getSessionOrders) {
          writeLocalRemoteMap(currentLocalSessionId(), remoteId);
          orders = await api.getSessionOrders(remoteId);
          foundItems = remoteOrdersHaveItems(orders);
          if (foundItems) {
            await window.LechaimMenu?.syncRemoteSessionTotal?.(remoteId);
            break;
          }
        }
        await sleep(attempt === 0 ? 120 : 350);
      }
      if (token !== attachToken) return null;
      if (!remoteId) {
        cachedRemoteId = null;
        cachedOrders = [];
        syncPrintButton();
        return null;
      }

      writeLocalRemoteMap(currentLocalSessionId(), remoteId);
      window.LechaimMenu.initRemoteSessionClosedWatcher?.();
      if (!foundItems) {
        orders = api?.getSessionOrders ? await api.getSessionOrders(remoteId) : [];
        await window.LechaimMenu?.syncRemoteSessionTotal?.(remoteId);
      }
      cachedRemoteId = remoteId;
      cachedOrders = Array.isArray(orders) ? orders : [];
      syncPrintButton();
      return { remoteId, orders: cachedOrders, foundItems };
    } catch (err) {
      console.warn('[staff-order] attach to table session failed', err);
      return null;
    }
  }

  async function onTableReady() {
    applyStaffChrome();
    await attachToTable(currentTableNumber());
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
      cachedRemoteId = remoteId;
      if (window.LechaimSupabaseOrders?.getSessionOrders) {
        cachedOrders = await window.LechaimSupabaseOrders.getSessionOrders(remoteId);
        syncPrintButton();
      }
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

  function bindCartActions() {
    printBtn()?.addEventListener('click', () => {
      handlePrintClick().catch(() => {});
    });
    addTableBtn()?.addEventListener('click', () => {
      handleAddToTableClick().catch(() => {});
    });
  }

  window.LechaimStaffOrder = {
    isActive: true,
    onOrderSent,
    returnToTables,
    discardLocalStaffState,
    attachToTable,
    refreshSessionTotal,
    handlePrintClick,
    handleAddToTableClick,
    refreshPrintState,
    syncPrintButton,
  };

  function boot() {
    if (!isStaffOrderPage()) return;
    applyStaffChrome();
    startOccupiedPoll();
    bindCartActions();
    window.setTimeout(applyStaffChrome, 400);
    document.addEventListener('lechaim:dinein-table-ready', () => {
      void onTableReady();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
