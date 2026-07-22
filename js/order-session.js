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
    if (value === ORDER_TYPE.DINE_IN || value === 'dine-in' || value === 'dine_in') {
      return ORDER_TYPE.DINE_IN;
    }
    if (value === ORDER_TYPE.TAKEAWAY || value === 'take-away' || value === 'take_away') {
      return ORDER_TYPE.TAKEAWAY;
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
    const payload = {
      sessionId: createSessionId(),
      orderType: ORDER_TYPE.TAKEAWAY,
      tableNumber: null,
      openedAt: new Date().toISOString(),
      status: STATUS.ACTIVE,
      lang: options.lang === 'he' || options.lang === 'en'
        ? options.lang
        : (existing?.lang || null),
    };
    writeRaw(payload);
    return payload;
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

    return {
      orderType: session.orderType === ORDER_TYPE.DINE_IN ? 'dine-in' : 'takeaway',
      tableNumber: session.tableNumber,
      lang: overrides.lang || session.lang || null,
      sessionId: session.sessionId,
      openedAt: session.openedAt,
      status: session.status,
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
    startDineIn,
    updateTable,
    startTakeaway,
    setLang,
    clearSession,
    toMenuContext,
    isValidTable,
  };
})(window);
