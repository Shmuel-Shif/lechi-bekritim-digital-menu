/**
 * LECHAIM — Canonical order_type registry (Supabase / Admin / customer apps)
 *
 * When adding a new type (e.g. delivery, catering):
 *  1. Add it to VALID_ORDER_TYPES + ALIASES
 *  2. Update supabase-shabbat-orders.sql-style CHECK constraints
 *  3. Grep for LechaimOrderTypes / VALID_ORDER_TYPES / warnUnknownOrderType
 *  4. Decide: board vs dedicated tab vs print vs coupons
 */
(function (global) {
  'use strict';

  /** Values stored in public.order_sessions.order_type */
  const VALID_ORDER_TYPES = Object.freeze(['dine_in', 'takeaway', 'shabbat']);

  /** Shown on Admin tables / takeaway boards (not Shabbat tab) */
  const BOARD_ORDER_TYPES = Object.freeze(['dine_in', 'takeaway']);

  const ALIASES = Object.freeze({
    dine_in: 'dine_in',
    'dine-in': 'dine_in',
    dinein: 'dine_in',
    takeaway: 'takeaway',
    'take-away': 'takeaway',
    take_away: 'takeaway',
    shabbat: 'shabbat',
    shabbos: 'shabbat',
    shabat: 'shabbat',
  });

  const warned = new Set();

  function warnUnknownOrderType(raw, context) {
    const key = String(raw == null ? '' : raw);
    if (!key) return;
    const stamp = `${context || 'order-types'}:${key}`;
    if (warned.has(stamp)) return;
    warned.add(stamp);
    console.warn(`[LechaimOrderTypes] Unknown order type: ${key}`, context ? `(${context})` : '');
  }

  /**
   * @param {*} value
   * @param {{ context?: string, warn?: boolean }} [options]
   * @returns {'dine_in'|'takeaway'|'shabbat'|null}
   */
  function normalizeOrderType(value, options = {}) {
    const raw = String(value || '').toLowerCase().trim();
    if (!raw) return null;
    const normalized = ALIASES[raw] || null;
    if (!normalized && options.warn !== false) {
      warnUnknownOrderType(raw, options.context || 'normalizeOrderType');
    }
    return normalized;
  }

  function isValidOrderType(value) {
    return VALID_ORDER_TYPES.includes(normalizeOrderType(value, { warn: false }));
  }

  function isBoardOrderType(value) {
    const type = normalizeOrderType(value, { warn: false });
    return type != null && BOARD_ORDER_TYPES.includes(type);
  }

  function isShabbatOrderType(value) {
    return normalizeOrderType(value, { warn: false }) === 'shabbat';
  }

  /**
   * Classify for Admin routing. Unknown types are warned and ignored.
   * @returns {'dine_in'|'takeaway'|'shabbat'|'unknown'|null}
   */
  function classifyOrderType(value, context) {
    const type = normalizeOrderType(value, { context, warn: true });
    if (!type) {
      if (value != null && String(value).trim() !== '') return 'unknown';
      return null;
    }
    return type;
  }

  global.LechaimOrderTypes = {
    VALID_ORDER_TYPES,
    BOARD_ORDER_TYPES,
    ALIASES,
    normalizeOrderType,
    isValidOrderType,
    isBoardOrderType,
    isShabbatOrderType,
    classifyOrderType,
    warnUnknownOrderType,
  };
})(window);
