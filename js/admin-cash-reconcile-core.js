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

  function splitDisplayedCash(allCash, manualNoReceiptCash, salaryCash) {
    const noReceiptCash = roundMoney(roundMoney(manualNoReceiptCash) + roundMoney(salaryCash));
    return {
      cashExpenses: roundMoney(roundMoney(allCash) - noReceiptCash),
      noReceiptCash,
    };
  }

  function reconcileCash(input) {
    const incomeCash = roundMoney(input?.incomeCash);
    const cashExpenses = roundMoney(input?.cashExpenses);
    const expected = roundMoney(incomeCash - cashExpenses);
    const deposited = roundMoney(input?.deposited);
    const remaining = roundMoney(expected - deposited);
    const actual = input?.actual == null || input?.actual === ''
      ? null
      : parseActualCash(input.actual);
    return {
      incomeCash,
      cashExpenses,
      expected,
      actual,
      difference: actual == null ? null : roundMoney(actual - expected),
      deposited,
      remaining,
    };
  }

  function createDeposit(input) {
    const date = String(input?.date || '').trim();
    const amount = parseActualCash(input?.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: 'חסר תאריך' };
    }
    if (amount == null || amount <= 0) {
      return { ok: false, error: 'חסר סכום' };
    }
    const id = String(input?.id || '').trim() || `dep-${date}-${amount}`;
    return {
      ok: true,
      deposit: { id, date, amount },
    };
  }

  function depositsInPeriod(list, fromYmd, toYmd) {
    const from = String(fromYmd || '');
    const to = String(toYmd || '');
    return (Array.isArray(list) ? list : []).filter((row) => {
      const date = String(row?.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      if (from && date < from) return false;
      if (to && date > to) return false;
      return parseActualCash(row?.amount) > 0;
    }).map((row) => ({
      id: String(row.id || ''),
      date: String(row.date),
      amount: parseActualCash(row.amount),
      savedAt: String(row.savedAt || ''),
    })).sort((a, b) => {
      const dates = a.date.localeCompare(b.date);
      if (dates) return dates;
      return a.savedAt.localeCompare(b.savedAt);
    });
  }

  function sumDeposits(rows) {
    return roundMoney((rows || []).reduce((sum, row) => sum + (Number(row?.amount) || 0), 0));
  }

  function appendDeposit(list, deposit) {
    const next = Array.isArray(list) ? list.slice() : [];
    next.push(deposit);
    return next;
  }

  function removeDeposit(list, id) {
    const key = String(id || '');
    if (!key) return Array.isArray(list) ? list.slice() : [];
    return (Array.isArray(list) ? list : []).filter((row) => String(row?.id || '') !== key);
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
    splitDisplayedCash,
    parseActualCash,
    reconcileCash,
    createDeposit,
    depositsInPeriod,
    sumDeposits,
    appendDeposit,
    removeDeposit,
    rememberActual,
    recallActual,
  };
});
