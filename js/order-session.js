/**
 * LECHAIM — Order Session (Stage 2)
 * Table / order-type persistence via localStorage only.
 * Modular foundation for future kitchen / admin / print stages.
 *
 * Does not touch menu rendering, cart, inventory, or i18n.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'lechaim-order-session';
  const LEGACY_ORDER_TYPE_KEY = 'lechaim-orderType';
  const LEGACY_TABLE_KEY = 'lechaim-tableNumber';

  const ORDER_TYPE = Object.freeze({
    DINE_IN: 'dinein',
    TAKEAWAY: 'takeaway',
    BUTCHER: 'butcher',
  });

  const STATUS = Object.freeze({
    ACTIVE: 'active',
  });

  const TABLE_MIN = 60;
  const TABLE_MAX = 73;

  function createSessionId() {
    if (global.crypto?.randomUUID) return `sess_${global.crypto.randomUUID()}`;
    return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function isValidTable(tableNumber) {
    const n = Number(tableNumber);
    return Number.isInteger(n) && n >= TABLE_MIN && n <= TABLE_MAX;
  }

  function normalizeOrderType(value) {
    /* Local customer session: dine-in + takeaway + butcher (Shabbat has its own page) */
    if (value === ORDER_TYPE.DINE_IN || value === 'dine-in' || value === 'dine_in') {
      return ORDER_TYPE.DINE_IN;
    }
    if (value === ORDER_TYPE.TAKEAWAY || value === 'take-away' || value === 'take_away') {
      return ORDER_TYPE.TAKEAWAY;
    }
    if (
      value === ORDER_TYPE.BUTCHER
      || value === 'butcher_shop'
      || value === 'butcher-shop'
      || value === 'meat'
    ) {
      return ORDER_TYPE.BUTCHER;
    }
    if (value === 'shabbat' || value === 'shabbos' || value === 'shabat') {
      console.warn('[order-session] Shabbat orders use shabbat.html — not the local session store');
      return null;
    }
    if (value) {
      console.warn(`[order-session] Unknown order type: ${value}`);
    }
    return null;
  }

  function readRaw() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[order-session] failed to read localStorage', err);
      return null;
    }
  }

  function writeRaw(session) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      /* Flat keys for simple inspection / future tools */
      if (session?.orderType) {
        global.localStorage.setItem(LEGACY_ORDER_TYPE_KEY, String(session.orderType));
      } else {
        global.localStorage.removeItem(LEGACY_ORDER_TYPE_KEY);
      }
      if (session?.tableNumber != null) {
        global.localStorage.setItem(LEGACY_TABLE_KEY, String(session.tableNumber));
      } else {
        global.localStorage.removeItem(LEGACY_TABLE_KEY);
      }
      return true;
    } catch (err) {
      console.warn('[order-session] failed to write localStorage', err);
      return false;
    }
  }

  function sanitize(session) {
    if (!session || typeof session !== 'object') return null;

    const orderType = normalizeOrderType(session.orderType);
    if (!orderType) return null;

    const status = session.status === STATUS.ACTIVE ? STATUS.ACTIVE : null;
    if (!status) return null;

    const tableNumber =
      orderType === ORDER_TYPE.DINE_IN && isValidTable(session.tableNumber)
        ? Number(session.tableNumber)
        : null;

    if (orderType === ORDER_TYPE.DINE_IN && tableNumber == null) return null;

    return {
      sessionId: typeof session.sessionId === 'string' && session.sessionId
        ? session.sessionId
        : createSessionId(),
      orderType,
      tableNumber,
      openedAt: typeof session.openedAt === 'string' && session.openedAt
        ? session.openedAt
        : new Date().toISOString(),
      status,
      lang: session.lang === 'he' || session.lang === 'en' ? session.lang : null,
      customerName: typeof session.customerName === 'string' ? session.customerName : '',
      customerPhone: typeof session.customerPhone === 'string' ? session.customerPhone : '',
      customerNotes: typeof session.customerNotes === 'string' ? session.customerNotes : '',
      customerAddress: typeof session.customerAddress === 'string' ? session.customerAddress : '',
      fulfillmentType: session.fulfillmentType === 'delivery' ? 'delivery' : (session.fulfillmentType === 'pickup' ? 'pickup' : null),
      deliveryFee: Number.isFinite(Number(session.deliveryFee)) && Number(session.deliveryFee) >= 0
        ? Number(session.deliveryFee)
        : null,
      pickupType: session.pickupType === 'TIME' ? 'TIME' : (session.pickupType === 'ASAP' ? 'ASAP' : null),
      pickupTime: typeof session.pickupTime === 'string' && session.pickupTime ? session.pickupTime : null,
      pickupDate: typeof session.pickupDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(session.pickupDate)
        ? session.pickupDate
        : null,
      publicOrderNo: Number.isFinite(Number(session.publicOrderNo)) && Number(session.publicOrderNo) > 0
        ? Number(session.publicOrderNo)
        : null,
    };
  }

  function getSession() {
    const sanitized = sanitize(readRaw());
    if (sanitized) return sanitized;

    /* Allow active takeaway sessions (no table) */
    const raw = readRaw();
    if (!raw || typeof raw !== 'object') return null;
    if (normalizeOrderType(raw.orderType) !== ORDER_TYPE.TAKEAWAY) return null;
    if (raw.status !== STATUS.ACTIVE) return null;
    return {
      sessionId: typeof raw.sessionId === 'string' && raw.sessionId ? raw.sessionId : createSessionId(),
      orderType: ORDER_TYPE.TAKEAWAY,
      tableNumber: null,
      openedAt: typeof raw.openedAt === 'string' && raw.openedAt ? raw.openedAt : new Date().toISOString(),
      status: STATUS.ACTIVE,
      lang: raw.lang === 'he' || raw.lang === 'en' ? raw.lang : null,
      customerName: typeof raw.customerName === 'string' ? raw.customerName : '',
      customerPhone: typeof raw.customerPhone === 'string' ? raw.customerPhone : '',
      customerNotes: typeof raw.customerNotes === 'string' ? raw.customerNotes : '',
      customerAddress: typeof raw.customerAddress === 'string' ? raw.customerAddress : '',
      fulfillmentType: raw.fulfillmentType === 'delivery' ? 'delivery' : 'pickup',
      pickupType: raw.pickupType === 'TIME' ? 'TIME' : 'ASAP',
      pickupTime: typeof raw.pickupTime === 'string' && raw.pickupTime ? raw.pickupTime : null,
      pickupDate: typeof raw.pickupDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.pickupDate)
        ? raw.pickupDate
        : null,
      publicOrderNo: Number.isFinite(Number(raw.publicOrderNo)) && Number(raw.publicOrderNo) > 0
        ? Number(raw.publicOrderNo)
        : null,
    };
  }

  function hasActiveDineInSession() {
    const session = getSession();
    return Boolean(
      session &&
      session.orderType === ORDER_TYPE.DINE_IN &&
      session.status === STATUS.ACTIVE &&
      session.tableNumber != null
    );
  }

  function hasActiveTakeawaySession() {
    const session = getSession();
    return Boolean(
      session &&
      session.orderType === ORDER_TYPE.TAKEAWAY &&
      session.status === STATUS.ACTIVE
    );
  }

  function hasActiveButcherSession() {
    const session = getSession();
    return Boolean(
      session &&
      session.orderType === ORDER_TYPE.BUTCHER &&
      session.status === STATUS.ACTIVE
    );
  }

  function getOrderType() {
    return getSession()?.orderType || null;
  }

  function getTableNumber() {
    const session = getSession();
    return session?.tableNumber != null ? session.tableNumber : null;
  }

  /**
   * Start or replace an active dine-in session for a table.
   * Same table → keep sessionId. Different table → new session (do not migrate orders).
   */
  function startDineIn(tableNumber, options = {}) {
    if (!isValidTable(tableNumber)) {
      throw new Error(`Invalid table number: ${tableNumber}`);
    }

    const existing = getSession();
    const nextTable = Number(tableNumber);
    const sameTable =
      existing &&
      existing.orderType === ORDER_TYPE.DINE_IN &&
      existing.status === STATUS.ACTIVE &&
      Number(existing.tableNumber) === nextTable;

    const session = sanitize({
      sessionId: sameTable ? existing.sessionId : createSessionId(),
      orderType: ORDER_TYPE.DINE_IN,
      tableNumber: nextTable,
      openedAt: sameTable
        ? (existing.openedAt || new Date().toISOString())
        : new Date().toISOString(),
      status: STATUS.ACTIVE,
      lang: options.lang === 'he' || options.lang === 'en'
        ? options.lang
        : (existing?.lang || null),
    });

    writeRaw(session);
    return session;
  }

  /** Change table: new session when table number changes (orders stay on their table). */
  function updateTable(tableNumber, options = {}) {
    return startDineIn(tableNumber, options);
  }

  function startTakeaway(options = {}) {
    const existing = getSession();
    const pickupType = options.pickupType === 'TIME' ? 'TIME' : 'ASAP';
    const fulfillmentType = options.fulfillmentType === 'delivery' ? 'delivery' : 'pickup';
    const payload = {
      sessionId: createSessionId(),
      orderType: ORDER_TYPE.TAKEAWAY,
      tableNumber: null,
      openedAt: new Date().toISOString(),
      status: STATUS.ACTIVE,
      lang: options.lang === 'he' || options.lang === 'en'
        ? options.lang
        : (existing?.lang || null),
      customerName: typeof options.customerName === 'string' ? options.customerName.trim() : '',
      customerPhone: typeof options.customerPhone === 'string' ? options.customerPhone.trim() : '',
      customerNotes: typeof options.customerNotes === 'string' ? options.customerNotes.trim() : '',
      fulfillmentType,
      customerAddress: fulfillmentType === 'delivery' && typeof options.customerAddress === 'string'
        ? options.customerAddress.trim()
        : '',
      pickupType,
      pickupTime: pickupType === 'TIME' && typeof options.pickupTime === 'string'
        ? options.pickupTime.trim()
        : null,
      pickupDate: pickupType === 'TIME'
        && typeof options.pickupDate === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(options.pickupDate)
        ? options.pickupDate
        : null,
      publicOrderNo: null,
    };
    writeRaw(payload);
    return payload;
  }

  function startButcher(options = {}) {
    const existing = getSession();
    const fulfillmentType = options.fulfillmentType === 'delivery' ? 'delivery' : 'pickup';
    const deliveryFeeRaw = Number(options.deliveryFee);
    const payload = {
      sessionId: createSessionId(),
      orderType: ORDER_TYPE.BUTCHER,
      tableNumber: null,
      openedAt: new Date().toISOString(),
      status: STATUS.ACTIVE,
      lang: options.lang === 'he' || options.lang === 'en'
        ? options.lang
        : (existing?.lang || null),
      customerName: typeof options.customerName === 'string' ? options.customerName.trim() : '',
      customerPhone: typeof options.customerPhone === 'string' ? options.customerPhone.trim() : '',
      customerNotes: typeof options.customerNotes === 'string' ? options.customerNotes.trim() : '',
      customerAddress: fulfillmentType === 'delivery' && typeof options.customerAddress === 'string'
        ? options.customerAddress.trim()
        : '',
      fulfillmentType,
      deliveryFee: fulfillmentType === 'delivery' && Number.isFinite(deliveryFeeRaw) && deliveryFeeRaw >= 0
        ? deliveryFeeRaw
        : null,
      pickupType: options.pickupType === 'TIME' || options.pickupType === 'ASAP'
        ? options.pickupType
        : null,
      pickupTime: typeof options.pickupTime === 'string' && options.pickupTime
        ? options.pickupTime.trim()
        : null,
      pickupDate: typeof options.pickupDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(options.pickupDate)
        ? options.pickupDate
        : null,
      publicOrderNo: null,
    };
    writeRaw(payload);
    return payload;
  }

  function patchSession(patch = {}) {
    const existing = getSession();
    if (!existing) return null;
    const next = { ...existing };
    if (patch.publicOrderNo !== undefined) {
      const n = Number(patch.publicOrderNo);
      next.publicOrderNo = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (typeof patch.customerName === 'string') next.customerName = patch.customerName;
    if (typeof patch.customerPhone === 'string') next.customerPhone = patch.customerPhone;
    if (typeof patch.customerNotes === 'string') next.customerNotes = patch.customerNotes;
    if (typeof patch.customerAddress === 'string') next.customerAddress = patch.customerAddress;
    if (patch.fulfillmentType === 'delivery' || patch.fulfillmentType === 'pickup') {
      next.fulfillmentType = patch.fulfillmentType;
    }
    if (patch.deliveryFee !== undefined) {
      const fee = Number(patch.deliveryFee);
      next.deliveryFee = Number.isFinite(fee) && fee >= 0 ? fee : null;
    }
    if (patch.pickupType === 'TIME' || patch.pickupType === 'ASAP') next.pickupType = patch.pickupType;
    if (patch.pickupType === null) next.pickupType = null;
    if (patch.pickupTime !== undefined) {
      next.pickupTime = typeof patch.pickupTime === 'string' && patch.pickupTime
        ? patch.pickupTime
        : null;
    }
    if (patch.pickupDate !== undefined) {
      next.pickupDate = typeof patch.pickupDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(patch.pickupDate)
        ? patch.pickupDate
        : null;
    }
    writeRaw(next);
    return next;
  }

  function setLang(lang) {
    if (lang !== 'he' && lang !== 'en') return getSession();
    const existing = getSession();
    if (!existing) return null;
    const next = { ...existing, lang };
    writeRaw(next);
    return next;
  }

  function clearSession() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
      global.localStorage.removeItem(LEGACY_ORDER_TYPE_KEY);
      global.localStorage.removeItem(LEGACY_TABLE_KEY);
    } catch (err) {
      console.warn('[order-session] failed to clear localStorage', err);
    }
  }

  /**
   * Shape used by entry-gate / main.js UI (keeps existing dine-in / takeaway keys).
   */
  function toMenuContext(overrides = {}) {
    const session = getSession();
    if (!session) {
      return {
        orderType: overrides.orderType || null,
        tableNumber: overrides.tableNumber != null ? overrides.tableNumber : null,
        lang: overrides.lang || null,
        sessionId: null,
        openedAt: null,
        status: null,
      };
    }

    let orderTypeUi = 'takeaway';
    if (session.orderType === ORDER_TYPE.DINE_IN) orderTypeUi = 'dine-in';
    else if (session.orderType === ORDER_TYPE.BUTCHER) orderTypeUi = 'butcher';

    return {
      orderType: orderTypeUi,
      tableNumber: session.tableNumber,
      lang: overrides.lang || session.lang || null,
      sessionId: session.sessionId,
      openedAt: session.openedAt,
      status: session.status,
      customerName: session.customerName || '',
      customerPhone: session.customerPhone || '',
      customerNotes: session.customerNotes || '',
      customerAddress: session.customerAddress || '',
      fulfillmentType: session.fulfillmentType || 'pickup',
      deliveryFee: session.deliveryFee != null ? Number(session.deliveryFee) : null,
      pickupType: session.pickupType || null,
      pickupTime: session.pickupTime || null,
      pickupDate: session.pickupDate || null,
      publicOrderNo: session.publicOrderNo != null ? Number(session.publicOrderNo) : null,
    };
  }

  global.LechaimOrderSession = {
    STORAGE_KEY,
    ORDER_TYPE,
    STATUS,
    TABLE_MIN,
    TABLE_MAX,
    getSession,
    getOrderType,
    getTableNumber,
    hasActiveDineInSession,
    hasActiveTakeawaySession,
    hasActiveButcherSession,
    startDineIn,
    updateTable,
    startTakeaway,
    startButcher,
    patchSession,
    setLang,
    clearSession,
    toMenuContext,
    isValidTable,
  };
})(window);
