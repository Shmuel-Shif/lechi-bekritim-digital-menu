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
    const raw = String(value || '').toLowerCase().trim();
    if (raw === 'dine_in' || raw === 'dine-in' || raw === 'dinein') return 'dine_in';
    if (raw === 'takeaway' || raw === 'take-away' || raw === 'take_away') return 'takeaway';
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
   * Create a new order session (dine_in or takeaway).
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
    };

    if (orderType === 'takeaway') {
      const pickupType = String(row.pickup_type || 'ASAP').toUpperCase() === 'TIME' ? 'TIME' : 'ASAP';
      row.pickup_type = pickupType;
      row.pickup_time = pickupType === 'TIME' && row.pickup_time
        ? String(row.pickup_time)
        : null;
    } else {
      row.pickup_type = null;
      row.pickup_time = null;
      row.public_order_no = null;
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

      return {
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
    });

    const { data, error } = await sb
      .from(TABLE_ITEMS)
      .insert(rows)
      .select('*');

    throwIfError(error, 'createOrderItems');
    return data || [];
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
        const total = (remaining || []).reduce((sum, row) => (
          sum + (Number(row.price) || 0) * (Number(row.quantity) || 0)
        ), 0);
        const rounded = Math.round(total * 100) / 100;
        await sb
          .from(TABLE_ORDERS)
          .update({ total: rounded })
          .eq('id', deleted.order_id);

        const { data: orderRow } = await sb
          .from(TABLE_ORDERS)
          .select('session_id')
          .eq('id', deleted.order_id)
          .maybeSingle();

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

  /**
   * Open sessions with nested orders + order_items (one round-trip for orders).
   * @returns {Promise<Array<{ session: object, orders: object[] }>>}
   */
  async function getOpenSessionsWithOrders() {
    const sessions = await getOpenSessions();
    if (!sessions.length) return [];

    const sb = getClient();
    const ids = sessions.map((row) => row.session_id).filter(Boolean);
    const { data, error } = await sb
      .from(TABLE_ORDERS)
      .select('*, order_items(*)')
      .in('session_id', ids)
      .order('order_number', { ascending: true });

    throwIfError(error, 'getOpenSessionsWithOrders');

    const bySession = new Map();
    ids.forEach((id) => bySession.set(id, []));
    (data || []).forEach((order) => {
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
      .update({ printed_at: stamped })
      .eq('id', orderId)
      .select('id, printed_at');

    throwIfError(error, 'markOrderPrinted');
    if (data?.length) return data[0];

    /* Already stamped or race — confirm row exists */
    const { data: existing, error: readErr } = await sb
      .from(TABLE_ORDERS)
      .select('id, printed_at')
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

    const rows = (data || []).filter((row) => row?.coupon_code);
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

  global.LechaimSupabaseOrders = {
    isConfigured,
    createSession,
    createOrder,
    createOrderItems,
    deleteOrderItem,
    getSession,
    getOpenSessions,
    getSessionOrders,
    getOpenSessionsWithOrders,
    getUnprintedOrdersWithItems,
    markOrderPrinted,
    updateSessionStatus,
    validateCoupon,
    incrementCouponUse,
    getCouponUsageReport,
    subscribeToOrders,
  };
})(window);
