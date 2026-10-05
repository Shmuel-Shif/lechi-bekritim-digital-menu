/**
 * LECHAIM — Cash reconciliation math for the existing financial summary.
 * Reads numbers already calculated elsewhere. Browser + Node (tests).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports && typeof module.exports === 'object') {
    module.exports = api;
  }
  root.LechaimAdminCashReconcile = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function parseActualCash(raw) {
    const text = String(raw ?? '').trim().replace(/\s/g, '');
    if (!text) return null;
    let normalized = text;
    if (/^\d{1,3}(,\d{3})+(\.\d{0,2})?$/.test(text)) {
      normalized = text.replace(/,/g, '');
    } else if (/^\d+([.,]\d{0,2})?$/.test(text)) {
      normalized = text.replace(',', '.');
    } else {
      return null;
    }
    if (normalized.endsWith('.')) normalized = normalized.slice(0, -1);
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount < 0) return null;
    return roundMoney(amount);
  }

  function reconcileCash(input) {
    const incomeCash = roundMoney(input?.incomeCash);
    const cashExpenses = roundMoney(input?.cashExpenses);
    const expected = roundMoney(incomeCash - cashExpenses);
    const actual = input?.actual == null || input?.actual === ''
      ? null
      : parseActualCash(input.actual);
    return {
      incomeCash,
      cashExpenses,
      expected,
      actual,
      difference: actual == null ? null : roundMoney(actual - expected),
      deposit: expected,
    };
  }

  function rememberActual(map, rangeKey, amount) {
    const next = map && typeof map === 'object' ? { ...map } : {};
    if (amount == null) delete next[rangeKey];
    else next[rangeKey] = amount;
    return next;
  }

  function recallActual(map, rangeKey) {
    if (!map || typeof map !== 'object' || !Object.prototype.hasOwnProperty.call(map, rangeKey)) return null;
    return parseActualCash(map[rangeKey]);
  }

  return {
    roundMoney,
    parseActualCash,
    reconcileCash,
    rememberActual,
    recallActual,
  };
});
