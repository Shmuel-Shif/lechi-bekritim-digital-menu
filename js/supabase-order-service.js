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
      notes: options.notes == null ? null : String(options.notes),
    };

    if (options.sessionId || options.session_id) {
      row.session_id = options.sessionId || options.session_id;
    }

    const { data, error } = await sb
      .from(TABLE_SESSIONS)
      .insert(row)
      .select('*')
      .single();

    throwIfError(error, 'createSession');
    return data;
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
    if (patch.language !== undefined || patch.lang !== undefined) {
      next.language = normalizeLang(patch.language ?? patch.lang);
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

  global.LechaimSupabaseOrders = {
    isConfigured,
    createSession,
    createOrder,
    createOrderItems,
    getSession,
    getOpenSessions,
    getSessionOrders,
    getOpenSessionsWithOrders,
    updateSessionStatus,
    subscribeToOrders,
  };
})(window);
