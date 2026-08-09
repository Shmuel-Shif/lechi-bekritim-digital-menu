/**
 * LECHAIM — Supabase Order Service (Stage 2)
 *
 * Pure Supabase I/O for order_sessions / orders / order_items.
 * Does NOT touch LechaimOrderEngine, localStorage, print, or UI.
 *
 * Usage (later):
 *   const session = await LechaimSupabaseOrders.createSession({ orderType: 'dine_in', tableNumber: 68 });
 */
(function (global) {
  'use strict';

  const TABLE_SESSIONS = 'order_sessions';
  const TABLE_ORDERS = 'orders';
  const TABLE_ITEMS = 'order_items';

  const OPEN_SESSION_STATUSES = ['active', 'bill_requested'];

  let client = null;
  let channel = null;

  function getConfig() {
    return global.LECHAIM_SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    const { url, anonKey } = getConfig();
    return Boolean(url && anonKey && global.supabase?.createClient);
  }

  function getClient() {
    /* Prefer Inventory client on admin so auth session is shared (RLS writes). */
    try {
      const shared = global.LechaimInventory?.getClient?.();
      if (shared) return shared;
    } catch (_) { /* ignore */ }

    if (client) return client;
    if (!isConfigured()) {
      throw new Error(
        '[LechaimSupabaseOrders] Supabase is not configured (url / anonKey / supabase-js)'
      );
    }

    const { url, anonKey } = getConfig();
    client = global.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: global.localStorage,
      },
    });
    return client;
  }

  function formatError(error, context) {
    if (!error) return `${context}: unknown error`;
    const msg = error.message || String(error);
    const code = error.code ? ` [${error.code}]` : '';
    const details = error.details ? ` — ${error.details}` : '';
    return `${context}${code}: ${msg}${details}`;
  }

  function throwIfError(error, context) {
    if (!error) return;
    const err = new Error(formatError(error, context));
    err.cause = error;
    throw err;
  }

  function normalizeOrderType(value) {
    const types = global.LechaimOrderTypes;
    if (types?.normalizeOrderType) {
      return types.normalizeOrderType(value, { context: 'LechaimSupabaseOrders' });
    }
    /* Fallback if order-types.js failed to load */
    const raw = String(value || '').toLowerCase().trim();
    if (raw === 'dine_in' || raw === 'dine-in' || raw === 'dinein') return 'dine_in';
    if (raw === 'takeaway' || raw === 'take-away' || raw === 'take_away') return 'takeaway';
    if (raw === 'shabbat' || raw === 'shabbos' || raw === 'shabat') return 'shabbat';
    if (raw) console.warn(`[LechaimSupabaseOrders] Unknown order type: ${raw}`);
    return null;
  }

  function normalizeLang(value) {
    if (value === 'he' || value === 'en' || value === 'el') return value;
    return null;
  }

  function normalizeSessionStatus(value) {
    if (value === 'active' || value === 'bill_requested' || value === 'closed') return value;
    return null;
  }

  function toNumberOrNull(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Next customer-facing Takeaway order number (starts at 1001).
   */
  async function allocatePublicOrderNo(sb) {
    const { data, error } = await sb
      .from(TABLE_SESSIONS)
      .select('public_order_no')
      .not('public_order_no', 'is', null)
      .order('public_order_no', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[LechaimSupabaseOrders] allocatePublicOrderNo failed', error);
      return 1001 + Math.floor(Math.random() * 90);
    }

    const last = Number(data?.[0]?.public_order_no);
    if (Number.isFinite(last) && last >= 1001) return last + 1;
    return 1001;
  }

  /**
   * Create a new order session (dine_in, takeaway, or shabbat).
   * @param {object} options
   * @param {string} options.orderType
   * @param {number|null} [options.tableNumber]
   * @param {string|null} [options.customerName]
   * @param {string|null} [options.customerPhone]
   * @param {string|null} [options.language]
   * @param {string|null} [options.notes]
   * @param {string|null} [options.sessionId] optional UUID to use as PK
   */
  async function createSession(options = {}) {
    const sb = getClient();
    const orderType = normalizeOrderType(options.orderType || options.order_type);
    if (!orderType) {
      throw new Error('[LechaimSupabaseOrders.createSession] invalid orderType');
    }

    const tableNumber = orderType === 'dine_in'
      ? toNumberOrNull(options.tableNumber ?? options.table_number)
      : null;

    if (orderType === 'dine_in' && tableNumber == null) {
      throw new Error('[LechaimSupabaseOrders.createSession] dine_in requires tableNumber');
    }

    const row = {
      order_type: orderType,
      table_number: tableNumber,
      customer_name: options.customerName ?? options.customer_name ?? null,
      customer_phone: options.customerPhone ?? options.customer_phone ?? null,
      language: normalizeLang(options.language || options.lang),
      status: 'active',
      bill_requested: false,
      notes: options.notes == null
        ? (options.customerNotes ?? options.customer_notes ?? null)
        : String(options.notes),
      pickup_type: options.pickupType ?? options.pickup_type ?? null,
      pickup_time: options.pickupTime ?? options.pickup_time ?? null,
      pickup_date: options.pickupDate ?? options.pickup_date ?? null,
      customer_address: options.customerAddress ?? options.customer_address ?? null,
      fulfillment_type: options.fulfillmentType ?? options.fulfillment_type ?? null,
    };

    switch (orderType) {
      case 'takeaway': {
        const pickupType = String(row.pickup_type || 'ASAP').toUpperCase() === 'TIME' ? 'TIME' : 'ASAP';
        row.pickup_type = pickupType;
        row.pickup_time = pickupType === 'TIME' && row.pickup_time
          ? String(row.pickup_time)
          : null;
        row.pickup_date = pickupType === 'TIME' && row.pickup_date
          ? String(row.pickup_date)
          : null;
        const fulfillment = String(row.fulfillment_type || 'pickup').toLowerCase() === 'delivery'
          ? 'delivery'
          : 'pickup';
        row.fulfillment_type = fulfillment;
        row.customer_address = fulfillment === 'delivery' && row.customer_address
          ? String(row.customer_address).trim()
          : null;
        break;
      }
      case 'shabbat':
        /* Fixed Friday pickup window — no ASAP / no public takeaway number */
        row.pickup_type = 'TIME';
        row.pickup_time = row.pickup_time ? String(row.pickup_time) : '13:00-14:00';
        row.pickup_date = null;
        row.public_order_no = null;
        row.customer_address = null;
        row.fulfillment_type = null;
        break;
      case 'butcher': {
        /* Butcher shop — pickup or delivery + schedule */
        const pickupType = String(row.pickup_type || '').toUpperCase() === 'TIME' ? 'TIME' : 'ASAP';
        row.pickup_type = pickupType;
        row.pickup_time = pickupType === 'TIME' && row.pickup_time
          ? String(row.pickup_time)
          : null;
        row.pickup_date = pickupType === 'TIME' && row.pickup_date
          ? String(row.pickup_date)
          : null;
        row.public_order_no = null;
        const fulfillment = String(row.fulfillment_type || 'pickup').toLowerCase() === 'delivery'
          ? 'delivery'
          : 'pickup';
        row.fulfillment_type = fulfillment;
        row.customer_address = fulfillment === 'delivery' && row.customer_address
          ? String(row.customer_address).trim()
          : null;
        const feeRaw = options.deliveryFee ?? options.delivery_fee;
        const fee = Number(feeRaw);
        row.delivery_fee = fulfillment === 'delivery' && Number.isFinite(fee) && fee >= 0
          ? fee
          : (fulfillment === 'delivery' ? 10 : null);
        break;
      }
      case 'dine_in':
        row.pickup_type = null;
        row.pickup_time = null;
        row.pickup_date = null;
        row.public_order_no = null;
        row.customer_address = null;
        row.fulfillment_type = null;
        break;
      default:
        console.warn(`[LechaimSupabaseOrders.createSession] Unknown order type: ${orderType}`);
        row.pickup_type = null;
        row.pickup_time = null;
        row.pickup_date = null;
        row.public_order_no = null;
        row.customer_address = null;
        row.fulfillment_type = null;
        break;
    }

    if (options.sessionId || options.session_id) {
      row.session_id = options.sessionId || options.session_id;
    }

    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (orderType === 'takeaway') {
        row.public_order_no = await allocatePublicOrderNo(sb);
      }

      const { data, error } = await sb
        .from(TABLE_SESSIONS)
        .insert(row)
        .select('*')
        .single();

      if (!error) return data;

      /* Unique public_order_no race — retry with a fresh number */
      const isUniqueConflict = error.code === '23505'
        || /public_order_no|duplicate/i.test(String(error.message || ''));
      if (orderType === 'takeaway' && isUniqueConflict) {
        lastError = error;
        continue;
      }

      throwIfError(error, 'createSession');
    }

    throwIfError(lastError, 'createSession');
    return null;
  }

  /**
   * Next order_number within a session (1, 2, 3…).
   */
  async function nextOrderNumber(sessionId) {
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .select('order_number')
      .eq('session_id', sessionId)
      .order('order_number', { ascending: false })
      .limit(1);

    throwIfError(error, 'nextOrderNumber');
    const last = data?.[0]?.order_number;
    return (Number(last) || 0) + 1;
  }

  /**
   * Create one order (one "Send Order" wave) under a session.
   * @param {object} options
   * @param {string} options.sessionId
   * @param {number} [options.orderNumber] auto if omitted
   * @param {number} [options.total]
   * @param {string} [options.status]
   * @param {string} [options.language]
   */
  async function createOrder(options = {}) {
    const sb = getClient();
    const sessionId = options.sessionId || options.session_id;
    if (!sessionId) {
      throw new Error('[LechaimSupabaseOrders.createOrder] sessionId is required');
    }

    const orderNumber = options.orderNumber != null || options.order_number != null
      ? Number(options.orderNumber ?? options.order_number)
      : await nextOrderNumber(sessionId);

    if (!Number.isInteger(orderNumber) || orderNumber < 1) {
      throw new Error('[LechaimSupabaseOrders.createOrder] invalid orderNumber');
    }

    const row = {
      session_id: sessionId,
      order_number: orderNumber,
      total: Number(options.total) || 0,
      status: options.status || 'submitted',
      language: normalizeLang(options.language || options.lang),
    };

    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .insert(row)
      .select('*')
      .single();

    throwIfError(error, 'createOrder');
    return data;
  }

  /**
   * Insert line items for an order.
   * @param {string} orderId
   * @param {Array<object>} items
   */
  async function createOrderItems(orderId, items) {
    const sb = getClient();
    if (!orderId) {
      throw new Error('[LechaimSupabaseOrders.createOrderItems] orderId is required');
    }

    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];

    const rows = list.map((item) => {
      const productId = item.productId ?? item.product_id;
      if (!productId) {
        throw new Error('[LechaimSupabaseOrders.createOrderItems] productId is required');
      }

      const qty = Number(item.quantity ?? item.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('[LechaimSupabaseOrders.createOrderItems] quantity must be > 0');
      }

      const row = {
        order_id: orderId,
        product_id: String(productId),
        product_name: String(item.productName ?? item.product_name ?? item.name ?? ''),
        print_name: String(item.printName ?? item.print_name ?? ''),
        quantity: Math.floor(qty),
        price: Number(item.price) || 0,
        category: item.category == null ? null : String(item.category),
        notes: item.notes == null || item.notes === '' ? null : String(item.notes),
        side_dish: item.sideDish ?? item.side_dish ?? null,
        parent_item_id: item.parentItemId ?? item.parent_item_id ?? null,
      };

      const unitType = item.unitType ?? item.unit_type;
      if (unitType) row.unit_type = String(unitType);

      const selectedWeight = Number(item.selectedWeight ?? item.selected_weight);
      if (Number.isFinite(selectedWeight) && selectedWeight > 0) {
        row.selected_weight = selectedWeight;
      }

      const pricePerKg = Number(item.pricePerKg ?? item.price_per_kg);
      if (Number.isFinite(pricePerKg) && pricePerKg >= 0) {
        row.price_per_kg = pricePerKg;
      }

      const thawCount = Number(item.thawCount ?? item.thaw_count);
      if (Number.isFinite(thawCount) && thawCount >= 0) {
        row.thaw_count = Math.floor(thawCount);
      }

      return row;
    });

    const { data, error } = await sb
      .from(TABLE_ITEMS)
      .insert(rows)
      .select('*');

    throwIfError(error, 'createOrderItems');
    return data || [];
  }

  /**
   * Increase quantity on an existing order item and refresh order + session totals.
   * @param {string} itemId
   * @param {number} [delta=1]
   */
  async function bumpOrderItemQuantity(itemId, delta = 1) {
    const sb = getClient();
    if (!itemId) {
      throw new Error('[LechaimSupabaseOrders.bumpOrderItemQuantity] itemId is required');
    }
    const amount = Number(delta);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new Error('[LechaimSupabaseOrders.bumpOrderItemQuantity] invalid delta');
    }

    const id = String(itemId);
    const { data: row, error: readErr } = await sb
      .from(TABLE_ITEMS)
      .select('id, order_id, quantity, price')
      .eq('id', id)
      .maybeSingle();
    throwIfError(readErr, 'bumpOrderItemQuantity.read');
    if (!row?.id) {
      throw new Error('[LechaimSupabaseOrders.bumpOrderItemQuantity] item not found');
    }

    const nextQty = Math.floor((Number(row.quantity) || 0) + amount);
    if (nextQty <= 0) {
      throw new Error('[LechaimSupabaseOrders.bumpOrderItemQuantity] quantity would be <= 0');
    }

    const { data: updated, error: updErr } = await sb
      .from(TABLE_ITEMS)
      .update({ quantity: nextQty })
      .eq('id', id)
      .select('id, order_id, quantity, price')
      .single();
    throwIfError(updErr, 'bumpOrderItemQuantity.update');

    if (updated?.order_id) {
      const { data: remaining, error: sumErr } = await sb
        .from(TABLE_ITEMS)
        .select('quantity, price')
        .eq('order_id', updated.order_id);
      throwIfError(sumErr, 'bumpOrderItemQuantity.sum');
      const total = (remaining || []).reduce((sum, r) => (
        sum + (Number(r.price) || 0) * (Number(r.quantity) || 0)
      ), 0);
      const rounded = Math.round(total * 100) / 100;
      const { error: totErr } = await sb
        .from(TABLE_ORDERS)
        .update({ total: rounded })
        .eq('id', updated.order_id);
      throwIfError(totErr, 'bumpOrderItemQuantity.orderTotal');

      const { data: orderRow } = await sb
        .from(TABLE_ORDERS)
        .select('session_id')
        .eq('id', updated.order_id)
        .maybeSingle();
      if (orderRow?.session_id) {
        await refreshSessionBillTotals(sb, orderRow.session_id);
      }
    }

    return updated;
  }

  /**
   * Recalculate and store order.total from its items.
   * @param {string} orderId
   */
  async function refreshOrderTotal(orderId) {
    const sb = getClient();
    if (!orderId) return null;
    const { data: remaining, error: sumErr } = await sb
      .from(TABLE_ITEMS)
      .select('quantity, price')
      .eq('order_id', orderId);
    throwIfError(sumErr, 'refreshOrderTotal.sum');
    const total = (remaining || []).reduce((sum, r) => (
      sum + (Number(r.price) || 0) * (Number(r.quantity) || 0)
    ), 0);
    const rounded = Math.round(total * 100) / 100;
    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .update({ total: rounded })
      .eq('id', orderId)
      .select('id, total, session_id')
      .single();
    throwIfError(error, 'refreshOrderTotal.update');
    if (data?.session_id) {
      await refreshSessionBillTotals(sb, data.session_id);
    }
    return data;
  }

  /**
   * Delete one order item (and its linked side children). Authenticated Admin.
   * @param {string} itemId
   */
  async function deleteOrderItem(itemId) {
    const sb = getClient();
    if (!itemId) {
      throw new Error('[LechaimSupabaseOrders.deleteOrderItem] itemId is required');
    }

    const id = String(itemId);

    const { error: childError } = await sb
      .from(TABLE_ITEMS)
      .delete()
      .eq('parent_item_id', id);
    throwIfError(childError, 'deleteOrderItem.children');

    const { data: deleted, error } = await sb
      .from(TABLE_ITEMS)
      .delete()
      .eq('id', id)
      .select('id, order_id')
      .maybeSingle();
    throwIfError(error, 'deleteOrderItem');

    if (deleted?.order_id) {
      const { data: remaining, error: sumErr } = await sb
        .from(TABLE_ITEMS)
        .select('quantity, price')
        .eq('order_id', deleted.order_id);
      if (!sumErr) {
        const lines = remaining || [];
        const { data: orderRow } = await sb
          .from(TABLE_ORDERS)
          .select('session_id')
          .eq('id', deleted.order_id)
          .maybeSingle();

        if (!lines.length) {
          /* Last item removed — drop empty wave so card returns to active (no blue / beep). */
          const { error: delOrdErr } = await sb
            .from(TABLE_ORDERS)
            .delete()
            .eq('id', deleted.order_id);
          if (delOrdErr) {
            console.warn('[LechaimSupabaseOrders.deleteOrderItem] empty order cleanup', delOrdErr);
            await sb
              .from(TABLE_ORDERS)
              .update({ total: 0 })
              .eq('id', deleted.order_id);
          }
        } else {
          const total = lines.reduce((sum, row) => (
            sum + (Number(row.price) || 0) * (Number(row.quantity) || 0)
          ), 0);
          const rounded = Math.round(total * 100) / 100;
          await sb
            .from(TABLE_ORDERS)
            .update({ total: rounded })
            .eq('id', deleted.order_id);
        }

        if (orderRow?.session_id) {
          await refreshSessionBillTotals(sb, orderRow.session_id);
        }
      }
    }

    return deleted || null;
  }

  /**
   * Recalculate session subtotal / discount after line items change.
   */
  async function refreshSessionBillTotals(sb, sessionId) {
    if (!sessionId) return;

    const { data: orders, error } = await sb
      .from(TABLE_ORDERS)
      .select('id, total, order_items(quantity, price)')
      .eq('session_id', sessionId);
    if (error) {
      console.warn('[LechaimSupabaseOrders] refreshSessionBillTotals', error);
      return;
    }

    let subtotal = 0;
    (orders || []).forEach((order) => {
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      if (lines.length) {
        lines.forEach((row) => {
          subtotal += (Number(row.price) || 0) * (Number(row.quantity) || 0);
        });
      } else {
        subtotal += Number(order.total) || 0;
      }
    });
    subtotal = Math.round(subtotal * 100) / 100;

    const { data: session } = await sb
      .from(TABLE_SESSIONS)
      .select('discount_percent, coupon_code')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (!session) return;

    const patch = { subtotal };
    const pct = Number(session.discount_percent);
    if (session.coupon_code && Number.isFinite(pct) && pct > 0) {
      patch.discount_amount = Math.round(subtotal * (pct / 100) * 100) / 100;
    } else if (session.coupon_code) {
      patch.discount_amount = 0;
    }

    await sb
      .from(TABLE_SESSIONS)
      .update(patch)
      .eq('session_id', sessionId);
  }

  /**
   * Fetch one session by id (any status).
   * @param {string} sessionId
   */
  async function getSession(sessionId) {
    const sb = getClient();
    if (!sessionId) {
      throw new Error('[LechaimSupabaseOrders.getSession] sessionId is required');
    }

    const { data, error } = await sb
      .from(TABLE_SESSIONS)
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    throwIfError(error, 'getSession');
    return data || null;
  }

  /**
   * Open sessions (active + bill_requested), newest first.
   */
  async function getOpenSessions() {
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_SESSIONS)
      .select('*')
      .in('status', OPEN_SESSION_STATUSES)
      .order('updated_at', { ascending: false });

    throwIfError(error, 'getOpenSessions');
    return data || [];
  }

  /**
   * All orders for a session, with nested order_items.
   * @param {string} sessionId
   */
  async function getSessionOrders(sessionId) {
    const sb = getClient();
    if (!sessionId) {
      throw new Error('[LechaimSupabaseOrders.getSessionOrders] sessionId is required');
    }

    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .select('*, order_items(*)')
      .eq('session_id', sessionId)
      .order('order_number', { ascending: true })
      .order('created_at', { ascending: true, foreignTable: 'order_items' });

    throwIfError(error, 'getSessionOrders');
    return data || [];
  }

  /* Columns verified used by admin-tables (+ board routing). Not select('*'). */
  const OPEN_BOARD_SESSION_COLS = [
    'session_id',
    'order_type',
    'status',
    'bill_requested',
    'table_number',
    'customer_name',
    'customer_phone',
    'notes',
    'customer_address',
    'fulfillment_type',
    'pickup_type',
    'pickup_time',
    'pickup_date',
    'delivery_fee',
    'public_order_no',
    'coupon_code',
    'discount_percent',
    'discount_amount',
    'subtotal',
    'created_at',
    'updated_at',
    'closed_at',
  ].join(', ');

  const OPEN_BOARD_ORDER_COLS = [
    'id',
    'session_id',
    'order_number',
    'total',
    'status',
    'printed_at',
    'created_at',
    'updated_at',
    'order_items(id, product_id, product_name, print_name, quantity, price, notes, parent_item_id, created_at, selected_weight, price_per_kg, unit_type, thaw_count)',
  ].join(', ');

  const OPEN_SHABBAT_SESSION_COLS = [
    'session_id',
    'order_type',
    'customer_name',
    'customer_phone',
    'notes',
    'pickup_time',
    'created_at',
    'subtotal',
    'discount_amount',
    'coupon_code',
    'discount_percent',
    'status',
  ].join(', ');

  const OPEN_SHABBAT_ORDER_COLS = [
    'id',
    'session_id',
    'order_number',
    'status',
    'printed_at',
    'order_items(id, product_id, product_name, print_name, quantity, price, parent_item_id)',
  ].join(', ');

  function groupOrdersBySession(sessions, orders) {
    const ids = sessions.map((row) => row.session_id).filter(Boolean);
    const bySession = new Map();
    ids.forEach((id) => bySession.set(id, []));
    (orders || []).forEach((order) => {
      const list = bySession.get(order.session_id);
      if (list) list.push(order);
      else bySession.set(order.session_id, [order]);
    });
    return sessions.map((session) => ({
      session,
      orders: bySession.get(session.session_id) || [],
    }));
  }

  /**
   * Open sessions with nested orders + order_items (one round-trip for orders).
   * Explicit columns only — verified against admin-tables consumers.
   * @returns {Promise<Array<{ session: object, orders: object[] }>>}
   */
  async function getOpenSessionsWithOrders() {
    const sb = getClient();
    const { data: sessions, error: sessionErr } = await sb
      .from(TABLE_SESSIONS)
      .select(OPEN_BOARD_SESSION_COLS)
      .in('status', OPEN_SESSION_STATUSES)
      .order('updated_at', { ascending: false });

    throwIfError(sessionErr, 'getOpenSessionsWithOrders.sessions');
    if (!sessions?.length) return [];

    const ids = sessions.map((row) => row.session_id).filter(Boolean);
    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .select(OPEN_BOARD_ORDER_COLS)
      .in('session_id', ids)
      .order('order_number', { ascending: true });

    throwIfError(error, 'getOpenSessionsWithOrders');
    return groupOrdersBySession(sessions, data);
  }

  /**
   * Open Shabbat sessions only, with nested orders + order_items.
   * Server-filtered — does not download dine_in / takeaway / butcher boards.
   * @returns {Promise<Array<{ session: object, orders: object[] }>>}
   */
  async function getOpenShabbatSessionsWithOrders() {
    const sb = getClient();
    const { data: sessions, error: sessionErr } = await sb
      .from(TABLE_SESSIONS)
      .select(OPEN_SHABBAT_SESSION_COLS)
      .eq('order_type', 'shabbat')
      .in('status', OPEN_SESSION_STATUSES)
      .order('updated_at', { ascending: false });

    throwIfError(sessionErr, 'getOpenShabbatSessionsWithOrders.sessions');
    if (!sessions?.length) return [];

    const ids = sessions.map((row) => row.session_id).filter(Boolean);
    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .select(OPEN_SHABBAT_ORDER_COLS)
      .in('session_id', ids)
      .order('order_number', { ascending: true });

    throwIfError(error, 'getOpenShabbatSessionsWithOrders');
    return groupOrdersBySession(sessions, data);
  }

  /**
   * Orders awaiting restaurant print, with items + parent session.
   * @returns {Promise<Array<{ session: object, order: object, items: object[] }>>}
   */
  async function getUnprintedOrdersWithItems() {
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .select('*, order_items(*)')
      .is('printed_at', null)
      .order('created_at', { ascending: true });

    throwIfError(error, 'getUnprintedOrdersWithItems');

    const rows = data || [];
    if (!rows.length) return [];

    const sessionIds = [...new Set(rows.map((row) => row.session_id).filter(Boolean))];
    let sessionsById = new Map();
    if (sessionIds.length) {
      const { data: sessions, error: sessionErr } = await sb
        .from(TABLE_SESSIONS)
        .select('*')
        .in('session_id', sessionIds);
      throwIfError(sessionErr, 'getUnprintedOrdersWithItems.sessions');
      sessionsById = new Map((sessions || []).map((row) => [row.session_id, row]));
    }

    return rows.map((row) => {
      const items = Array.isArray(row.order_items) ? row.order_items : [];
      const order = { ...row };
      delete order.order_items;
      return {
        session: sessionsById.get(row.session_id) || null,
        order,
        items,
      };
    });
  }

  /**
   * Mark an order approved / preparing (before kitchen print).
   * @param {string} orderId
   */
  async function markOrderApproved(orderId) {
    const sb = getClient();
    if (!orderId) {
      throw new Error('[LechaimSupabaseOrders.markOrderApproved] orderId is required');
    }

    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .update({ status: 'preparing' })
      .eq('id', orderId)
      .is('printed_at', null)
      .select('id, status, printed_at');

    throwIfError(error, 'markOrderApproved');
    if (data?.length) return data[0];

    const { data: existing, error: readErr } = await sb
      .from(TABLE_ORDERS)
      .select('id, status, printed_at')
      .eq('id', orderId)
      .maybeSingle();

    throwIfError(readErr, 'markOrderApproved.read');
    if (existing && (existing.status === 'preparing' || existing.printed_at)) {
      return existing;
    }

    throw new Error('[LechaimSupabaseOrders.markOrderApproved] order not updated (check status column / RLS)');
  }

  /**
   * Mark an order printed (idempotent).
   * @param {string} orderId
   */
  async function markOrderPrinted(orderId) {
    const sb = getClient();
    if (!orderId) {
      throw new Error('[LechaimSupabaseOrders.markOrderPrinted] orderId is required');
    }

    const stamped = new Date().toISOString();
    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .update({ printed_at: stamped, status: 'ready' })
      .eq('id', orderId)
      .select('id, printed_at, status');

    throwIfError(error, 'markOrderPrinted');
    if (data?.length) return data[0];

    /* Already stamped or race — confirm row exists */
    const { data: existing, error: readErr } = await sb
      .from(TABLE_ORDERS)
      .select('id, printed_at, status')
      .eq('id', orderId)
      .maybeSingle();

    throwIfError(readErr, 'markOrderPrinted.read');
    if (existing?.printed_at) return existing;

    throw new Error('[LechaimSupabaseOrders.markOrderPrinted] order not updated (check printed_at column / RLS)');
  }

  /**
   * Update session status / bill_requested / closed_at.
   * @param {string} sessionId
   * @param {object} patch
   */
  async function updateSessionStatus(sessionId, patch = {}) {
    const sb = getClient();
    if (!sessionId) {
      throw new Error('[LechaimSupabaseOrders.updateSessionStatus] sessionId is required');
    }

    const next = {};

    if (patch.status != null) {
      const status = normalizeSessionStatus(patch.status);
      if (!status) {
        throw new Error('[LechaimSupabaseOrders.updateSessionStatus] invalid status');
      }
      next.status = status;
      if (status === 'bill_requested') next.bill_requested = true;
      if (status === 'closed') {
        next.closed_at = patch.closedAt || patch.closed_at || new Date().toISOString();
      }
      if (status === 'active') {
        next.bill_requested = false;
        next.closed_at = null;
      }
    }

    if (patch.billRequested != null || patch.bill_requested != null) {
      next.bill_requested = Boolean(patch.billRequested ?? patch.bill_requested);
      if (next.bill_requested && next.status == null) {
        next.status = 'bill_requested';
      }
    }

    if (patch.customerName !== undefined || patch.customer_name !== undefined) {
      next.customer_name = patch.customerName ?? patch.customer_name;
    }
    if (patch.customerPhone !== undefined || patch.customer_phone !== undefined) {
      next.customer_phone = patch.customerPhone ?? patch.customer_phone;
    }
    if (patch.notes !== undefined) {
      next.notes = patch.notes;
    }
    if (patch.customerNotes !== undefined || patch.customer_notes !== undefined) {
      next.notes = patch.customerNotes ?? patch.customer_notes;
    }
    if (patch.language !== undefined || patch.lang !== undefined) {
      next.language = normalizeLang(patch.language ?? patch.lang);
    }
    if (patch.pickupType !== undefined || patch.pickup_type !== undefined) {
      const raw = patch.pickupType ?? patch.pickup_type;
      next.pickup_type = raw == null ? null : (String(raw).toUpperCase() === 'TIME' ? 'TIME' : 'ASAP');
    }
    if (patch.pickupTime !== undefined || patch.pickup_time !== undefined) {
      next.pickup_time = patch.pickupTime ?? patch.pickup_time;
    }
    if (patch.pickupDate !== undefined || patch.pickup_date !== undefined) {
      next.pickup_date = patch.pickupDate ?? patch.pickup_date;
    }
    if (patch.customerAddress !== undefined || patch.customer_address !== undefined) {
      next.customer_address = patch.customerAddress ?? patch.customer_address;
    }
    if (patch.fulfillmentType !== undefined || patch.fulfillment_type !== undefined) {
      const raw = patch.fulfillmentType ?? patch.fulfillment_type;
      next.fulfillment_type = raw == null
        ? null
        : (String(raw).toLowerCase() === 'delivery' ? 'delivery' : 'pickup');
    }
    if (patch.deliveryFee !== undefined || patch.delivery_fee !== undefined) {
      const fee = Number(patch.deliveryFee ?? patch.delivery_fee);
      next.delivery_fee = Number.isFinite(fee) && fee >= 0 ? fee : null;
    }

    if (patch.couponCode !== undefined || patch.coupon_code !== undefined) {
      next.coupon_code = patch.couponCode ?? patch.coupon_code;
    }
    if (patch.discountPercent !== undefined || patch.discount_percent !== undefined) {
      const pct = Number(patch.discountPercent ?? patch.discount_percent);
      next.discount_percent = Number.isFinite(pct) ? pct : null;
    }
    if (patch.discountAmount !== undefined || patch.discount_amount !== undefined) {
      const amt = Number(patch.discountAmount ?? patch.discount_amount);
      next.discount_amount = Number.isFinite(amt) ? amt : null;
    }
    if (patch.subtotal !== undefined) {
      const sub = Number(patch.subtotal);
      next.subtotal = Number.isFinite(sub) ? sub : null;
    }

    if (!Object.keys(next).length) {
      throw new Error('[LechaimSupabaseOrders.updateSessionStatus] empty patch');
    }

    const { data, error } = await sb
      .from(TABLE_SESSIONS)
      .update(next)
      .eq('session_id', sessionId)
      .select('*')
      .single();

    throwIfError(error, 'updateSessionStatus');
    return data;
  }

  /**
   * Realtime subscription for sessions + orders + items.
   * @param {(payload: object) => void} onEvent
   * @returns {() => void} unsubscribe
   */
  function subscribeToOrders(onEvent) {
    if (typeof onEvent !== 'function') {
      throw new Error('[LechaimSupabaseOrders.subscribeToOrders] callback required');
    }

    const sb = getClient();

    if (channel) {
      try {
        sb.removeChannel(channel);
      } catch (err) {
        console.warn('[LechaimSupabaseOrders] removeChannel warning', err);
      }
      channel = null;
    }

    channel = sb
      .channel('lechaim-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_SESSIONS },
        (payload) => onEvent({ table: TABLE_SESSIONS, ...payload })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_ORDERS },
        (payload) => onEvent({ table: TABLE_ORDERS, ...payload })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_ITEMS },
        (payload) => onEvent({ table: TABLE_ITEMS, ...payload })
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[LechaimSupabaseOrders] Realtime subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[LechaimSupabaseOrders] Realtime', status, err || '');
        }
      });

    return function unsubscribe() {
      if (!channel) return;
      try {
        sb.removeChannel(channel);
      } catch (err) {
        console.warn('[LechaimSupabaseOrders] unsubscribe warning', err);
      }
      channel = null;
    };
  }

  /**
   * Validate a coupon code via SECURITY DEFINER RPC (does not expose the full catalog).
   * @param {string} code
   * @returns {Promise<{ code: string, discount_percent: number }|null>}
   */
  async function validateCoupon(code) {
    const sb = getClient();
    const trimmed = String(code || '').trim();
    if (!trimmed) return null;

    const { data, error } = await sb.rpc('validate_coupon', { p_code: trimmed });
    throwIfError(error, 'validateCoupon');

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.discount_percent == null) return null;

    return {
      code: String(row.code || trimmed),
      discount_percent: Number(row.discount_percent),
    };
  }

  /**
   * Increment coupon usage counter after a successful bill apply.
   * @param {string} code
   */
  async function incrementCouponUse(code) {
    const sb = getClient();
    const trimmed = String(code || '').trim();
    if (!trimmed) return;
    const { error } = await sb.rpc('increment_coupon_use', { p_code: trimmed });
    throwIfError(error, 'incrementCouponUse');
  }

  /**
   * Coupon usage report from order_sessions (authenticated Admin).
   * @returns {Promise<{ summaries: object[], ordersByCode: Record<string, object[]> }>}
   */
  async function getCouponUsageReport() {
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_SESSIONS)
      .select(
        'session_id, table_number, order_type, coupon_code, discount_percent, discount_amount, subtotal, created_at, updated_at, closed_at, status'
      )
      .not('coupon_code', 'is', null)
      .order('updated_at', { ascending: false });

    throwIfError(error, 'getCouponUsageReport');

    /* Exclude Shabbat — counted only in getShabbatSessionsReport / Admin Shabbat stats */
    const rows = (data || []).filter((row) => {
      if (!row?.coupon_code) return false;
      const type = normalizeOrderType(row.order_type);
      if (type === 'shabbat') return false;
      if (row.order_type && !type) {
        console.warn(`[LechaimSupabaseOrders.getCouponUsageReport] Unknown order type: ${row.order_type}`);
        return false;
      }
      return true;
    });
    const ordersByCode = {};

    rows.forEach((row) => {
      const code = String(row.coupon_code).trim();
      if (!code) return;
      const key = code.toLowerCase();
      const subtotal = Number(row.subtotal) || 0;
      const discount = Number(row.discount_amount) || 0;
      const total = Math.max(0, subtotal - discount);
      const entry = {
        sessionId: row.session_id,
        orderLabel: `#${String(row.session_id || '').replace(/-/g, '').slice(-4).toUpperCase()}`,
        date: row.updated_at || row.created_at || null,
        tableNumber: row.table_number == null ? null : Number(row.table_number),
        orderType: row.order_type,
        couponCode: code,
        discountPercent: row.discount_percent == null ? null : Number(row.discount_percent),
        subtotal,
        discountAmount: discount,
        total,
        status: row.status,
      };
      if (!ordersByCode[key]) ordersByCode[key] = [];
      ordersByCode[key].push(entry);
    });

    const summaries = Object.keys(ordersByCode).map((key) => {
      const list = ordersByCode[key];
      const revenue = list.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
      const discountGiven = list.reduce((sum, row) => sum + (Number(row.discountAmount) || 0), 0);
      const lastUsed = list.reduce((max, row) => {
        const t = row.date ? new Date(row.date).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      return {
        code: list[0]?.couponCode || key,
        orders: list.length,
        revenue: Math.round(revenue * 100) / 100,
        discountGiven: Math.round(discountGiven * 100) / 100,
        averageOrder: list.length
          ? Math.round((revenue / list.length) * 100) / 100
          : 0,
        lastUsed: lastUsed ? new Date(lastUsed).toISOString() : null,
        discountPercent: list[0]?.discountPercent ?? null,
      };
    }).sort((a, b) => b.orders - a.orders);

    return { summaries, ordersByCode };
  }

  /**
   * Shabbat sessions report (separate from coupon catalog stats).
   * @returns {Promise<object[]>}
   */
  async function getShabbatSessionsReport() {
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_SESSIONS)
      .select(
        'session_id, customer_name, customer_phone, coupon_code, discount_percent, discount_amount, subtotal, status, created_at, closed_at, order_type'
      )
      .eq('order_type', 'shabbat')
      .order('created_at', { ascending: false })
      .limit(500);

    throwIfError(error, 'getShabbatSessionsReport');
    return data || [];
  }

  /**
   * Closed dine-in sessions for one table (newest first), with nested orders + items.
   * @param {number} tableNumber
   * @param {{ limit?: number }} [options]
   */
  async function getClosedSessionsForTable(tableNumber, options = {}) {
    const sb = getClient();
    const num = Number(tableNumber);
    if (!Number.isFinite(num)) {
      throw new Error('[LechaimSupabaseOrders.getClosedSessionsForTable] tableNumber is required');
    }
    const limit = Math.min(Math.max(Number(options.limit) || 40, 1), 100);

    const { data: sessions, error } = await sb
      .from(TABLE_SESSIONS)
      .select('*')
      .eq('order_type', 'dine_in')
      .eq('table_number', num)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(limit);

    throwIfError(error, 'getClosedSessionsForTable');
    const list = sessions || [];
    if (!list.length) return [];

    const ids = list.map((row) => row.session_id).filter(Boolean);
    const { data: orders, error: ordersError } = await sb
      .from(TABLE_ORDERS)
      .select('*, order_items(*)')
      .in('session_id', ids)
      .order('order_number', { ascending: true });

    throwIfError(ordersError, 'getClosedSessionsForTable.orders');

    const bySession = new Map();
    ids.forEach((id) => bySession.set(id, []));
    (orders || []).forEach((order) => {
      const bucket = bySession.get(order.session_id);
      if (bucket) bucket.push(order);
    });

    return list.map((session) => ({
      session,
      orders: bySession.get(session.session_id) || [],
    }));
  }

  /**
   * Closed takeaway sessions (newest first), with nested orders + items.
   * @param {{ limit?: number }} [options]
   */
  async function getClosedTakeawaySessions(options = {}) {
    const sb = getClient();
    const limit = Math.min(Math.max(Number(options.limit) || 40, 1), 100);

    const { data: sessions, error } = await sb
      .from(TABLE_SESSIONS)
      .select('*')
      .eq('order_type', 'takeaway')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(limit);

    throwIfError(error, 'getClosedTakeawaySessions');
    const list = sessions || [];
    if (!list.length) return [];

    const ids = list.map((row) => row.session_id).filter(Boolean);
    const { data: orders, error: ordersError } = await sb
      .from(TABLE_ORDERS)
      .select('*, order_items(*)')
      .in('session_id', ids)
      .order('order_number', { ascending: true });

    throwIfError(ordersError, 'getClosedTakeawaySessions.orders');

    const bySession = new Map();
    ids.forEach((id) => bySession.set(id, []));
    (orders || []).forEach((order) => {
      const bucket = bySession.get(order.session_id);
      if (bucket) bucket.push(order);
    });

    return list.map((session) => ({
      session,
      orders: bySession.get(session.session_id) || [],
    }));
  }

  /**
   * Closed butcher-shop sessions (newest first), with nested orders + items.
   * @param {{ limit?: number }} [options]
   */
  async function getClosedButcherSessions(options = {}) {
    const sb = getClient();
    const limit = Math.min(Math.max(Number(options.limit) || 40, 1), 100);

    const { data: sessions, error } = await sb
      .from(TABLE_SESSIONS)
      .select('*')
      .eq('order_type', 'butcher')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(limit);

    throwIfError(error, 'getClosedButcherSessions');
    const list = sessions || [];
    if (!list.length) return [];

    const ids = list.map((row) => row.session_id).filter(Boolean);
    const { data: orders, error: ordersError } = await sb
      .from(TABLE_ORDERS)
      .select('*, order_items(*)')
      .in('session_id', ids)
      .order('order_number', { ascending: true });

    throwIfError(ordersError, 'getClosedButcherSessions.orders');

    const bySession = new Map();
    ids.forEach((id) => bySession.set(id, []));
    (orders || []).forEach((order) => {
      const bucket = bySession.get(order.session_id);
      if (bucket) bucket.push(order);
    });

    return list.map((session) => ({
      session,
      orders: bySession.get(session.session_id) || [],
    }));
  }

  /**
   * Closed Shabbat sessions (newest first), with nested orders + items.
   * @param {{ limit?: number }} [options]
   */
  async function getClosedShabbatSessions(options = {}) {
    const sb = getClient();
    const limit = Math.min(Math.max(Number(options.limit) || 40, 1), 100);

    const { data: sessions, error } = await sb
      .from(TABLE_SESSIONS)
      .select('*')
      .eq('order_type', 'shabbat')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(limit);

    throwIfError(error, 'getClosedShabbatSessions');
    const list = sessions || [];
    if (!list.length) return [];

    const ids = list.map((row) => row.session_id).filter(Boolean);
    const { data: orders, error: ordersError } = await sb
      .from(TABLE_ORDERS)
      .select('*, order_items(*)')
      .in('session_id', ids)
      .order('order_number', { ascending: true });

    throwIfError(ordersError, 'getClosedShabbatSessions.orders');

    const bySession = new Map();
    ids.forEach((id) => bySession.set(id, []));
    (orders || []).forEach((order) => {
      const bucket = bySession.get(order.session_id);
      if (bucket) bucket.push(order);
    });

    return list.map((session) => ({
      session,
      orders: bySession.get(session.session_id) || [],
    }));
  }

  /**
   * Re-open a closed session (back to active) with the same table / type / items.
   * Dine-in: fails if that table already has an open session.
   * @param {string} sessionId
   */
  async function restoreClosedSession(sessionId) {
    if (!sessionId) {
      throw new Error('[LechaimSupabaseOrders.restoreClosedSession] sessionId is required');
    }

    const session = await getSession(sessionId);
    if (!session) {
      throw new Error('ההזמנה לא נמצאה');
    }
    if (String(session.status || '').toLowerCase() !== 'closed') {
      throw new Error('ההזמנה כבר פתוחה');
    }

    const orderType = normalizeOrderType(session.order_type) || String(session.order_type || '');
    if (orderType === 'dine_in' && session.table_number != null) {
      const sb = getClient();
      const { data: openRow, error: openErr } = await sb
        .from(TABLE_SESSIONS)
        .select('session_id')
        .eq('order_type', 'dine_in')
        .eq('table_number', Number(session.table_number))
        .in('status', OPEN_SESSION_STATUSES)
        .neq('session_id', sessionId)
        .limit(1)
        .maybeSingle();

      throwIfError(openErr, 'restoreClosedSession.openCheck');
      if (openRow) {
        throw new Error(`שולחן ${session.table_number} כבר פתוח — סגרו אותו לפני השחזור`);
      }
    }

    return updateSessionStatus(sessionId, { status: 'active' });
  }

  /**
   * Permanently delete a closed session (orders + items cascade).
   * @param {string} sessionId
   */
  async function deleteClosedSession(sessionId) {
    const sb = getClient();
    if (!sessionId) {
      throw new Error('[LechaimSupabaseOrders.deleteClosedSession] sessionId is required');
    }
    const { data, error } = await sb
      .from(TABLE_SESSIONS)
      .delete()
      .eq('session_id', sessionId)
      .eq('status', 'closed')
      .select('session_id')
      .maybeSingle();

    throwIfError(error, 'deleteClosedSession');
    if (!data) {
      throw new Error('לא נמצאה הזמנה סגורה למחיקה');
    }
    return data;
  }

  /**
   * Wipe all closed dine-in + takeaway history (orders cascade).
   * Does not touch open sessions or Shabbat.
   */
  async function deleteAllClosedHistory() {
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_SESSIONS)
      .delete()
      .eq('status', 'closed')
      .in('order_type', ['dine_in', 'takeaway'])
      .select('session_id');

    throwIfError(error, 'deleteAllClosedHistory');
    return { deleted: (data || []).length };
  }

  /**
   * Remove a coupon from usage stats: clear coupon fields on matching sessions
   * and reset used_count on the coupons catalog row.
   * @param {string} code
   */
  async function clearCouponUsage(code) {
    const sb = getClient();
    const trimmed = String(code || '').trim();
    if (!trimmed) {
      throw new Error('[LechaimSupabaseOrders.clearCouponUsage] code is required');
    }

    const { data: sessions, error: listErr } = await sb
      .from(TABLE_SESSIONS)
      .select('session_id, coupon_code')
      .not('coupon_code', 'is', null);

    throwIfError(listErr, 'clearCouponUsage.list');

    const ids = (sessions || [])
      .filter((row) => String(row.coupon_code || '').trim().toLowerCase() === trimmed.toLowerCase())
      .map((row) => row.session_id)
      .filter(Boolean);

    if (ids.length) {
      const { error: updErr } = await sb
        .from(TABLE_SESSIONS)
        .update({
          coupon_code: null,
          discount_percent: null,
          discount_amount: null,
          subtotal: null,
        })
        .in('session_id', ids);
      throwIfError(updErr, 'clearCouponUsage.update');
    }

    const { error: couponErr } = await sb
      .from('coupons')
      .update({ used_count: 0, updated_at: new Date().toISOString() })
      .ilike('code', trimmed);

    /* Catalog reset is best-effort if RLS/table missing */
    if (couponErr) {
      console.warn('[LechaimSupabaseOrders.clearCouponUsage] coupons used_count reset failed', couponErr);
    }

    return { clearedSessions: ids.length };
  }

  /**
   * Dine-in close countdown deadline (ISO string) or null if open.
   * @returns {Promise<string|null>}
   */
  async function getDineInCloseAt() {
    const sb = getClient();
    const { data, error } = await sb
      .from('restaurant_flags')
      .select('flag_value, flag_text')
      .eq('flag_key', 'dine_in_close_at')
      .maybeSingle();
    throwIfError(error, 'getDineInCloseAt');
    if (!data?.flag_value) return null;
    const iso = String(data.flag_text || '').trim();
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  /**
   * Start (or refresh) dine-in close countdown from now.
   * @param {number} [minutes=30]
   * @returns {Promise<string>} ISO deadline
   */
  async function startDineInCloseCountdown(minutes = 30) {
    const sb = getClient();
    const { data: authData } = await sb.auth.getSession();
    if (!authData?.session) {
      throw new Error(
        'startDineInCloseCountdown: must be signed in as admin (RLS blocks anon write)'
      );
    }
    const mins = Math.max(1, Number(minutes) || 30);
    const deadline = new Date(Date.now() + mins * 60 * 1000).toISOString();
    const { data, error } = await sb
      .from('restaurant_flags')
      .upsert({
        flag_key: 'dine_in_close_at',
        flag_value: true,
        flag_text: deadline,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'flag_key' })
      .select('flag_text')
      .single();
    throwIfError(error, 'startDineInCloseCountdown');
    return String(data?.flag_text || deadline);
  }

  /**
   * Clear dine-in close countdown / reopen ordering.
   * @returns {Promise<void>}
   */
  async function clearDineInCloseCountdown() {
    const sb = getClient();
    const { error } = await sb
      .from('restaurant_flags')
      .upsert({
        flag_key: 'dine_in_close_at',
        flag_value: false,
        flag_text: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'flag_key' });
    throwIfError(error, 'clearDineInCloseCountdown');
  }

  /** @deprecated use getDineInCloseAt / startDineInCloseCountdown */
  async function getDineInOrdersClosed() {
    const at = await getDineInCloseAt();
    if (!at) return false;
    return Date.now() >= Date.parse(at);
  }

  /** @deprecated use startDineInCloseCountdown / clearDineInCloseCountdown */
  async function setDineInOrdersClosed(closed) {
    if (closed) {
      await startDineInCloseCountdown(30);
      return true;
    }
    await clearDineInCloseCountdown();
    return false;
  }

  /**
   * When true, customer entry UI hides delivery wording and delivery option.
   * @returns {Promise<boolean>}
   */
  async function getDeliveriesClosed() {
    const sb = getClient();
    const { data, error } = await sb
      .from('restaurant_flags')
      .select('flag_value')
      .eq('flag_key', 'deliveries_closed')
      .maybeSingle();
    throwIfError(error, 'getDeliveriesClosed');
    return Boolean(data?.flag_value);
  }

  /**
   * Admin: close/open deliveries on the customer site only.
   * @param {boolean} closed
   * @returns {Promise<boolean>}
   */
  async function setDeliveriesClosed(closed) {
    const sb = getClient();
    const { data: authData } = await sb.auth.getSession();
    if (!authData?.session) {
      throw new Error(
        'setDeliveriesClosed: must be signed in as admin (RLS blocks anon write)'
      );
    }
    const { error } = await sb
      .from('restaurant_flags')
      .upsert({
        flag_key: 'deliveries_closed',
        flag_value: Boolean(closed),
        flag_text: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'flag_key' });
    throwIfError(error, 'setDeliveriesClosed');
    return Boolean(closed);
  }

  /**
   * When false, customer Shabbat card + shabbat.html ordering are closed.
   * Missing row defaults to open (true).
   * @returns {Promise<boolean>}
   */
  async function getShabbatOrdersEnabled() {
    const sb = getClient();
    const { data, error } = await sb
      .from('restaurant_flags')
      .select('flag_value')
      .eq('flag_key', 'shabbat_orders_enabled')
      .maybeSingle();
    throwIfError(error, 'getShabbatOrdersEnabled');
    if (!data) return true;
    return Boolean(data.flag_value);
  }

  /**
   * Admin: open/close Shabbat ordering on the customer site.
   * @param {boolean} enabled
   * @returns {Promise<boolean>}
   */
  async function setShabbatOrdersEnabled(enabled) {
    const sb = getClient();
    const { data: authData } = await sb.auth.getSession();
    if (!authData?.session) {
      throw new Error(
        'setShabbatOrdersEnabled: must be signed in as admin (RLS blocks anon write)'
      );
    }
    const { error } = await sb
      .from('restaurant_flags')
      .upsert({
        flag_key: 'shabbat_orders_enabled',
        flag_value: Boolean(enabled),
        flag_text: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'flag_key' });
    throwIfError(error, 'setShabbatOrdersEnabled');
    return Boolean(enabled);
  }

  let flagsChannel = null;
  const flagsListeners = new Set();

  /**
   * Realtime for restaurant_flags (supports multiple listeners).
   * @param {(payload: object) => void} onEvent
   * @returns {() => void}
   */
  function subscribeRestaurantFlags(onEvent) {
    if (typeof onEvent !== 'function') {
      throw new Error('[LechaimSupabaseOrders.subscribeRestaurantFlags] callback required');
    }
    flagsListeners.add(onEvent);
    const sb = getClient();
    if (!flagsChannel) {
      flagsChannel = sb
        .channel('lechaim-restaurant-flags')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'restaurant_flags' },
          (payload) => {
            const row = payload?.new || payload?.old || {};
            const evt = {
              flagKey: String(row.flag_key || ''),
              flagValue: Boolean(row.flag_value),
              flagText: row.flag_text == null ? null : String(row.flag_text),
              eventType: payload?.eventType || payload?.event || '',
            };
            flagsListeners.forEach((fn) => {
              try { fn(evt); } catch (err) {
                console.warn('[LechaimSupabaseOrders] flags listener failed', err);
              }
            });
          }
        )
        .subscribe();
    }
    return () => {
      flagsListeners.delete(onEvent);
      if (!flagsListeners.size && flagsChannel) {
        try { sb.removeChannel(flagsChannel); } catch (_) { /* ignore */ }
        flagsChannel = null;
      }
    };
  }

  global.LechaimSupabaseOrders = {
    isConfigured,
    createSession,
    createOrder,
    createOrderItems,
    bumpOrderItemQuantity,
    refreshOrderTotal,
    deleteOrderItem,
    getSession,
    getOpenSessions,
    getSessionOrders,
    getOpenSessionsWithOrders,
    getOpenShabbatSessionsWithOrders,
    getClosedSessionsForTable,
    getClosedTakeawaySessions,
    getClosedButcherSessions,
    getClosedShabbatSessions,
    restoreClosedSession,
    deleteClosedSession,
    deleteAllClosedHistory,
    clearCouponUsage,
    getUnprintedOrdersWithItems,
    markOrderApproved,
    markOrderPrinted,
    updateSessionStatus,
    validateCoupon,
    incrementCouponUse,
    getCouponUsageReport,
    getShabbatSessionsReport,
    getDineInCloseAt,
    startDineInCloseCountdown,
    clearDineInCloseCountdown,
    getDineInOrdersClosed,
    setDineInOrdersClosed,
    getDeliveriesClosed,
    setDeliveriesClosed,
    getShabbatOrdersEnabled,
    setShabbatOrdersEnabled,
    subscribeRestaurantFlags,
    subscribeToOrders,
  };
})(window);
