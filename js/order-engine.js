/**
 * LECHAIM — Order Engine (Stage 3 + Stage 5)
 * Open orders persistence (localStorage) + closed history for admin tables.
 *
 * Cart remains the customer UI source; syncFromCart updates the session's open order.
 * Multiple open orders can exist at once (one per table / takeaway slot).
 * Status: active | bill_requested | closed
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'lechaim-active-order';
  const OPEN_ORDERS_KEY = 'lechaim-open-orders';
  const HISTORY_KEY = 'lechaim-order-history';
  const CART_STORAGE_KEY = 'lechaim-keri-cart';

  const STATUS = Object.freeze({
    ACTIVE: 'active',
    BILL_REQUESTED: 'bill_requested',
    CLOSED: 'closed',
  });

  const OPEN_STATUSES = new Set([STATUS.ACTIVE, STATUS.BILL_REQUESTED]);

  function nowIso() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    if (global.crypto?.randomUUID) return `${prefix}_${global.crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeOrderType(value) {
    if (value === 'dinein' || value === 'dine-in' || value === 'dine_in') return 'dinein';
    if (value === 'takeaway' || value === 'take-away' || value === 'take_away') return 'takeaway';
    return value || null;
  }

  function normalizeStatus(value) {
    if (value === STATUS.ACTIVE || value === STATUS.BILL_REQUESTED || value === STATUS.CLOSED) {
      return value;
    }
    return null;
  }

  function readJson(key) {
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[order-engine] failed to read', key, err);
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[order-engine] failed to write', key, err);
      return false;
    }
  }

  function removeKey(key) {
    try {
      global.localStorage.removeItem(key);
    } catch (err) {
      console.warn('[order-engine] failed to remove', key, err);
    }
  }

  function sanitizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    if (!item.itemId || !item.productId) return null;
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) return null;

    return {
      itemId: String(item.itemId),
      productId: String(item.productId),
      name: item.name == null ? '' : String(item.name),
      price: item.price == null || item.price === '' ? 0 : Number(item.price),
      qty: qty,
      notes: item.notes == null ? '' : String(item.notes),
      printed: item.printed === true,
      createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : nowIso(),
      linkedToMainItemId: item.linkedToMainItemId || null,
    };
  }

  function sanitizeOrder(order, { allowClosed = false } = {}) {
    if (!order || typeof order !== 'object') return null;
    const status = normalizeStatus(order.status) || STATUS.ACTIVE;
    if (!allowClosed && status === STATUS.CLOSED) return null;
    if (!allowClosed && !OPEN_STATUSES.has(status)) return null;

    const items = Array.isArray(order.items)
      ? order.items.map(sanitizeItem).filter(Boolean)
      : [];

    return {
      orderId: typeof order.orderId === 'string' && order.orderId
        ? order.orderId
        : createId('ord'),
      sessionId: order.sessionId == null ? null : String(order.sessionId),
      tableNumber: order.tableNumber == null || order.tableNumber === ''
        ? null
        : Number(order.tableNumber),
      orderType: normalizeOrderType(order.orderType),
      status,
      createdAt: typeof order.createdAt === 'string' && order.createdAt
        ? order.createdAt
        : nowIso(),
      updatedAt: typeof order.updatedAt === 'string' && order.updatedAt
        ? order.updatedAt
        : nowIso(),
      closedAt: typeof order.closedAt === 'string' ? order.closedAt : null,
      items,
    };
  }

  function slotKey(orderOrMeta) {
    const type = normalizeOrderType(orderOrMeta?.orderType);
    if (type === 'takeaway') return 'takeaway';
    if (type === 'dinein' && orderOrMeta?.tableNumber != null) {
      return `dinein:${Number(orderOrMeta.tableNumber)}`;
    }
    return null;
  }

  function readHistory() {
    const raw = readJson(HISTORY_KEY);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((order) => sanitizeOrder(order, { allowClosed: true }))
      .filter((order) => order && order.status === STATUS.CLOSED);
  }

  function writeHistory(list) {
    return writeJson(HISTORY_KEY, list);
  }

  function appendHistory(order) {
    const history = readHistory();
    history.unshift(order);
    writeHistory(history.slice(0, 200));
  }

  function syncLegacyCurrentPointer(current) {
    if (current) writeJson(STORAGE_KEY, current);
    else removeKey(STORAGE_KEY);
  }

  function readOpenOrders() {
    const raw = readJson(OPEN_ORDERS_KEY);
    let list = [];

    if (Array.isArray(raw)) {
      list = raw.map((order) => sanitizeOrder(order)).filter(Boolean);
    } else {
      /* Migrate legacy single active order */
      const legacy = sanitizeOrder(readJson(STORAGE_KEY));
      if (legacy) list = [legacy];
    }

    return list;
  }

  function writeOpenOrders(orders, currentHint) {
    const clean = (orders || []).map((order) => sanitizeOrder(order)).filter(Boolean);
    writeJson(OPEN_ORDERS_KEY, clean);

    const meta = resolveSessionContext();
    const current =
      currentHint ||
      findOpenOrder(clean, {
        sessionId: meta.sessionId,
        orderType: meta.orderType,
        tableNumber: meta.tableNumber,
      }) ||
      null;

    syncLegacyCurrentPointer(current);
    return clean;
  }

  function findOpenOrder(orders, criteria = {}) {
    const list = orders || [];

    if (criteria.orderId) {
      return list.find((order) => order.orderId === criteria.orderId) || null;
    }

    /* Table / takeaway slot first — never pull another table's order by sessionId alone */
    const key = slotKey(criteria);
    if (key) {
      return list.find((order) => slotKey(order) === key) || null;
    }

    if (criteria.sessionId) {
      const bySession = list.find((order) => order.sessionId === criteria.sessionId);
      if (bySession) return bySession;
    }

    if (criteria.tableNumber != null) {
      return list.find((order) => (
        order.orderType === 'dinein' &&
        order.tableNumber === Number(criteria.tableNumber)
      )) || null;
    }

    return null;
  }

  function upsertOpenOrder(order) {
    const next = sanitizeOrder(order);
    if (!next) return null;

    const list = readOpenOrders();
    const nextSlot = slotKey(next);
    const filtered = list.filter((existing) => {
      if (existing.orderId === next.orderId) return false;
      if (nextSlot && slotKey(existing) === nextSlot) return false;
      return true;
    });

    filtered.push(next);
    writeOpenOrders(filtered, next);
    return next;
  }

  function removeOpenOrder(orderId) {
    const list = readOpenOrders();
    const remaining = list.filter((order) => order.orderId !== orderId);
    writeOpenOrders(remaining, null);
    return remaining;
  }

  function resolveSessionContext(explicit) {
    const session = global.LechaimOrderSession?.getSession?.() || null;
    const ctx = global.LechaimOrderContext || {};

    const orderType = normalizeOrderType(
      explicit?.orderType ||
      session?.orderType ||
      ctx.orderType ||
      null
    );

    const tableNumber =
      explicit?.tableNumber !== undefined
        ? explicit.tableNumber
        : (session?.tableNumber != null
          ? session.tableNumber
          : (ctx.tableNumber != null ? ctx.tableNumber : null));

    const sessionId =
      explicit?.sessionId !== undefined
        ? explicit.sessionId
        : (session?.sessionId || ctx.sessionId || null);

    return { orderType, tableNumber, sessionId };
  }

  function getOrder(explicit) {
    const meta = resolveSessionContext(explicit);
    const list = readOpenOrders();
    return findOpenOrder(list, {
      sessionId: meta.sessionId,
      orderType: meta.orderType,
      tableNumber: meta.tableNumber,
    });
  }

  function getUnprintedItems() {
    const order = getOrder();
    if (!order) return [];
    return order.items.filter((item) => item.printed !== true);
  }

  function getOrderTotal(order) {
    if (!order?.items?.length) return 0;
    return order.items.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const qty = Number(item.qty) || 0;
      return sum + price * qty;
    }, 0);
  }

  function getItemCount(order) {
    if (!order?.items?.length) return 0;
    return order.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  }

  function orderHasLiveItems(order) {
    return getItemCount(order) > 0;
  }

  /**
   * Drop open orders with no items so browsing a table doesn't mark it active.
   */
  function pruneEmptyOpenOrders() {
    const list = readOpenOrders();
    const kept = list.filter((order) => orderHasLiveItems(order));
    if (kept.length !== list.length) {
      writeOpenOrders(kept, null);
    }
    return kept;
  }

  function ensureActiveOrder(explicit) {
    const meta = resolveSessionContext(explicit);
    const list = readOpenOrders();
    const stamp = nowIso();

    const existing = findOpenOrder(list, {
      sessionId: meta.sessionId,
      orderType: meta.orderType,
      tableNumber: meta.tableNumber,
    });

    if (existing) {
      const next = {
        ...existing,
        sessionId: meta.sessionId || existing.sessionId,
        /* Never migrate an order to a different table via session reuse */
        tableNumber: existing.orderType === 'takeaway' || existing.tableNumber != null
          ? existing.tableNumber
          : (meta.orderType === 'takeaway' ? null : meta.tableNumber),
        orderType: existing.orderType || meta.orderType,
        status: existing.status === STATUS.BILL_REQUESTED
          ? STATUS.BILL_REQUESTED
          : STATUS.ACTIVE,
        updatedAt: stamp,
      };
      return upsertOpenOrder(next);
    }

    const order = {
      orderId: createId('ord'),
      sessionId: meta.sessionId,
      tableNumber: meta.orderType === 'takeaway' ? null : meta.tableNumber,
      orderType: meta.orderType,
      status: STATUS.ACTIVE,
      createdAt: stamp,
      updatedAt: stamp,
      closedAt: null,
      items: [],
    };

    return upsertOpenOrder(order);
  }

  function syncFromCart(cartLines, resolveProduct) {
    const order = ensureActiveOrder();
    const prevById = new Map((order.items || []).map((item) => [item.itemId, item]));
    const nextItems = [];
    const stamp = nowIso();
    const lines = Array.isArray(cartLines) ? cartLines : [];

    lines.forEach((line) => {
      if (!line?.lineId || !line?.itemId) return;
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) return;

      const product = typeof resolveProduct === 'function'
        ? resolveProduct(line.itemId, line)
        : null;
      if (!product) return;

      const itemId = String(line.lineId);
      const prev = prevById.get(itemId);
      const price = product.price == null || product.price === '' ? 0 : Number(product.price);
      const name = product.name == null ? '' : String(product.name);
      const notes = product.notes == null ? '' : String(product.notes);

      if (prev) {
        const qtyChanged = prev.qty !== qty;
        nextItems.push({
          itemId,
          productId: String(line.itemId),
          name,
          price: Number.isFinite(price) ? price : 0,
          qty,
          notes,
          printed: qtyChanged || prev.name !== name || prev.price !== price
            ? false
            : (prev.printed === true),
          createdAt: prev.createdAt || stamp,
          linkedToMainItemId: line.linkedToMainLineId || null,
        });
      } else {
        nextItems.push({
          itemId,
          productId: String(line.itemId),
          name,
          price: Number.isFinite(price) ? price : 0,
          qty,
          notes,
          printed: false,
          createdAt: stamp,
          linkedToMainItemId: line.linkedToMainLineId || null,
        });
      }
    });

    const next = {
      ...order,
      items: nextItems,
      updatedAt: stamp,
    };

    return upsertOpenOrder(next);
  }

  function markPrinted(itemIds) {
    const order = getOrder();
    if (!order) return null;

    const idSet = new Set((itemIds || []).map(String));
    if (!idSet.size) return order;

    const stamp = nowIso();
    const items = order.items.map((item) => (
      idSet.has(item.itemId) ? { ...item, printed: true } : item
    ));

    return upsertOpenOrder({ ...order, items, updatedAt: stamp });
  }

  function markAllUnprintedAsPrinted() {
    const unprinted = getUnprintedItems();
    return markPrinted(unprinted.map((item) => item.itemId));
  }

  function requestBill(orderId) {
    const list = readOpenOrders();
    const order = orderId
      ? findOpenOrder(list, { orderId })
      : getOrder();
    if (!order) return null;

    return upsertOpenOrder({
      ...order,
      status: STATUS.BILL_REQUESTED,
      updatedAt: nowIso(),
    });
  }

  function clearCustomerCartStorage() {
    removeKey(CART_STORAGE_KEY);
  }

  /**
   * Close an open order (by orderId, tableNumber, or current session).
   * Archives to history; clears session + cart only when they match.
   */
  function closeOrder(options = {}) {
    const list = readOpenOrders();
    let order = null;

    if (options.orderId) {
      order = findOpenOrder(list, { orderId: options.orderId });
    } else if (options.tableNumber != null) {
      order = findOpenOrder(list, {
        orderType: 'dinein',
        tableNumber: Number(options.tableNumber),
      });
    } else {
      order = getOrder();
    }

    if (!order) return null;

    const stamp = nowIso();
    const closed = {
      ...order,
      status: STATUS.CLOSED,
      updatedAt: stamp,
      closedAt: stamp,
    };

    appendHistory(closed);
    removeOpenOrder(order.orderId);

    const session = global.LechaimOrderSession?.getSession?.();
    const matchesSession = session && order.sessionId && session.sessionId === order.sessionId;
    if (matchesSession) {
      global.LechaimOrderSession.clearSession?.();
      clearCustomerCartStorage();

      if (global.LechaimOrderContext) {
        global.LechaimOrderContext = {
          ...global.LechaimOrderContext,
          orderType: null,
          tableNumber: null,
          sessionId: null,
          status: null,
        };
      }
    }

    return closed;
  }

  function closeTable(tableNumber) {
    return closeOrder({ tableNumber: Number(tableNumber) });
  }

  function getHistory() {
    return readHistory();
  }

  function getOpenOrders() {
    return readOpenOrders();
  }

  function getTablesBoard() {
    pruneEmptyOpenOrders();
    const sessionApi = global.LechaimOrderSession;
    const min = sessionApi?.TABLE_MIN || 60;
    const max = sessionApi?.TABLE_MAX || 73;
    const openOrders = readOpenOrders().filter((order) => order.orderType === 'dinein');
    const byTable = new Map(
      openOrders
        .filter((order) => order.tableNumber != null && orderHasLiveItems(order))
        .map((order) => [order.tableNumber, order])
    );
    const board = [];

    for (let n = min; n <= max; n += 1) {
      const match = byTable.get(n) || null;

      let uiStatus = 'free';
      if (match?.status === STATUS.BILL_REQUESTED) uiStatus = 'bill_requested';
      else if (match) uiStatus = 'active';

      board.push({
        tableNumber: n,
        uiStatus,
        orderType: match?.orderType || 'dinein',
        order: match,
        total: match ? getOrderTotal(match) : 0,
        itemCount: match ? getItemCount(match) : 0,
        openedAt: match?.createdAt || null,
        updatedAt: match?.updatedAt || null,
      });
    }

    return board;
  }

  function getTakeawayBoard() {
    pruneEmptyOpenOrders();
    const openOrders = readOpenOrders().filter(
      (order) => order.orderType === 'takeaway' && orderHasLiveItems(order)
    );

    return openOrders.map((open) => ({
      tableNumber: null,
      uiStatus: open.status === STATUS.BILL_REQUESTED ? 'bill_requested' : 'active',
      orderType: 'takeaway',
      order: open,
      total: getOrderTotal(open),
      itemCount: getItemCount(open),
      openedAt: open.createdAt,
      updatedAt: open.updatedAt,
    }));
  }

  function clearOrder() {
    const current = getOrder();
    if (current) {
      removeOpenOrder(current.orderId);
      return;
    }
    removeKey(OPEN_ORDERS_KEY);
    removeKey(STORAGE_KEY);
  }

  function clearItems() {
    const order = ensureActiveOrder();
    return upsertOpenOrder({
      ...order,
      items: [],
      updatedAt: nowIso(),
    });
  }

  /**
   * Add a catalog product to a specific open order (admin / waiter / customer send).
   * By default merges unprinted lines with same productId + notes (no parent link).
   * Pass options.allowMerge = false (or linkedToMainItemId) to keep separate order items.
   *
   * @returns {object|null} updated order (includes non-persisted `_lastAddedItemId`)
   */
  function addProductToOrder(orderId, product, qty = 1, notes = '', options = {}) {
    if (!orderId || !product?.id) return null;

    const list = readOpenOrders();
    const order = findOpenOrder(list, { orderId });
    if (!order) return null;

    const amount = Number(qty);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const stamp = nowIso();
    const noteText = notes == null ? '' : String(notes);
    const price = product.price == null || product.price === '' ? 0 : Number(product.price);
    const name = product.name == null ? String(product.id) : String(product.name);
    const productId = String(product.id);
    const linkedToMainItemId = options.linkedToMainItemId
      ? String(options.linkedToMainItemId)
      : null;
    const allowMerge = options.allowMerge !== false && !linkedToMainItemId;

    const items = (order.items || []).map((item) => ({ ...item }));
    let lastAddedItemId = null;

    const matchIdx = allowMerge
      ? items.findIndex((item) => (
        item.productId === productId &&
        (item.notes || '') === noteText &&
        !item.linkedToMainItemId &&
        item.printed !== true
      ))
      : -1;

    if (matchIdx >= 0) {
      items[matchIdx] = {
        ...items[matchIdx],
        qty: Number(items[matchIdx].qty) + amount,
        name,
        price: Number.isFinite(price) ? price : 0,
        printed: false,
      };
      lastAddedItemId = items[matchIdx].itemId;
    } else {
      lastAddedItemId = createId('item');
      items.push({
        itemId: lastAddedItemId,
        productId,
        name,
        price: Number.isFinite(price) ? price : 0,
        qty: amount,
        notes: noteText,
        printed: false,
        createdAt: stamp,
        linkedToMainItemId,
      });
    }

    const next = upsertOpenOrder({
      ...order,
      items,
      status: order.status === STATUS.BILL_REQUESTED
        ? STATUS.BILL_REQUESTED
        : STATUS.ACTIVE,
      updatedAt: stamp,
    });

    if (next) next._lastAddedItemId = lastAddedItemId;
    return next;
  }

  global.LechaimOrderEngine = {
    STORAGE_KEY,
    OPEN_ORDERS_KEY,
    HISTORY_KEY,
    STATUS,
    getOrder,
    getUnprintedItems,
    getOrderTotal,
    getItemCount,
    ensureActiveOrder,
    syncFromCart,
    markPrinted,
    markAllUnprintedAsPrinted,
    addProductToOrder,
    requestBill,
    closeOrder,
    closeTable,
    getHistory,
    getOpenOrders,
    getTablesBoard,
    getTakeawayBoard,
    clearOrder,
    clearItems,
  };
})(window);
