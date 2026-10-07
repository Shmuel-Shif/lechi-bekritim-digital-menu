/**
 * LECHAIM — Rules for a locked daily sales report.
 * Browser + Node (tests). No DOM / network.
 * A zero day is a real lock. Do not use hasSavedReport for this.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports && typeof module.exports === 'object') {
    module.exports = api;
  }
  root.LechaimAdminDailyLock = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const SOURCES = ['till', 'whatsapp'];

  function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function normalizeSource(value) {
    const source = String(value || 'till').trim().toLowerCase();
    return SOURCES.includes(source) ? source : '';
  }

  function normalizeAmounts(input) {
    const cashRaw = input?.cash;
    const creditRaw = input?.credit;
    const tipRaw = input?.tip;
    if (cashRaw == null || cashRaw === '' || creditRaw == null || creditRaw === '' || tipRaw == null || tipRaw === '') {
      return { ok: false, code: 'invalid_amount' };
    }
    const cash = Number(cashRaw);
    const credit = Number(creditRaw);
    const tip = Number(tipRaw);
    if (![cash, credit, tip].every((n) => Number.isFinite(n) && n >= 0)) {
      return { ok: false, code: 'invalid_amount' };
    }
    const amounts = {
      cash: roundMoney(cash),
      credit: roundMoney(credit),
      tip: roundMoney(tip),
    };
    amounts.sales = roundMoney(amounts.cash + amounts.credit);
    return { ok: true, amounts };
  }

  function isLocked(row) {
    return Boolean(row && row.business_date);
  }

  function guardTillUpsert(lockRow) {
    if (isLocked(lockRow)) return { ok: false, code: 'DAILY_REPORT_LOCKED' };
    return { ok: true };
  }

  function prepareLock(input) {
    if (isLocked(input?.existing)) return { ok: false, code: 'already_locked' };
    const date = String(input?.date || input?.business_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, code: 'invalid_date' };
    const amounts = normalizeAmounts(input);
    if (!amounts.ok) return amounts;
    const source = normalizeSource(input?.source || 'till');
    if (!source) return { ok: false, code: 'invalid_source' };
    const now = String(input?.now || new Date().toISOString());
    const userId = input?.userId || null;
    const note = input?.note == null ? null : String(input.note);
    const lock = {
      business_date: date,
      cash: amounts.amounts.cash,
      credit: amounts.amounts.credit,
      tip: amounts.amounts.tip,
      sales: amounts.amounts.sales,
      source,
      note,
      locked_at: now,
      locked_by: userId,
      revised_at: null,
      revised_by: null,
    };
    const revision = {
      business_date: date,
      cash: lock.cash,
      credit: lock.credit,
      tip: lock.tip,
      sales: lock.sales,
      source,
      reason: '',
      created_by: userId,
      created_at: now,
      action: 'lock',
    };
    return { ok: true, lock, revision };
  }

  function prepareCorrection(input) {
    if (!isLocked(input?.existing)) return { ok: false, code: 'not_locked' };
    const reason = String(input?.reason || '').trim();
    if (!reason) return { ok: false, code: 'reason_required' };
    const amounts = normalizeAmounts(input);
    if (!amounts.ok) return amounts;
    const now = String(input?.now || new Date().toISOString());
    const userId = input?.userId || null;
    const existing = input.existing;
    const lock = {
      business_date: existing.business_date,
      cash: amounts.amounts.cash,
      credit: amounts.amounts.credit,
      tip: amounts.amounts.tip,
      sales: amounts.amounts.sales,
      source: existing.source,
      note: existing.note == null ? null : existing.note,
      locked_at: existing.locked_at,
      locked_by: existing.locked_by,
      revised_at: now,
      revised_by: userId,
    };
    const revision = {
      business_date: existing.business_date,
      cash: lock.cash,
      credit: lock.credit,
      tip: lock.tip,
      sales: lock.sales,
      source: existing.source,
      reason,
      created_by: userId,
      created_at: now,
      action: 'correct',
    };
    return { ok: true, lock, revision };
  }

  function createMemory() {
    return { locks: new Map(), revisions: [] };
  }

  function lockDay(memory, input) {
    const existing = memory.locks.get(String(input?.date || input?.business_date || '')) || null;
    const prepared = prepareLock({ ...input, existing });
    if (!prepared.ok) return prepared;
    memory.locks.set(prepared.lock.business_date, prepared.lock);
    memory.revisions.push(prepared.revision);
    return prepared;
  }

  function correctDay(memory, input) {
    const date = String(input?.date || input?.business_date || '').trim();
    const existing = memory.locks.get(date) || null;
    const prepared = prepareCorrection({ ...input, existing });
    if (!prepared.ok) return prepared;
    memory.locks.set(date, prepared.lock);
    memory.revisions.push(prepared.revision);
    return prepared;
  }

  function getLock(memory, date) {
    return memory.locks.get(String(date || '')) || null;
  }

  function locksInRange(memory, fromYmd, toYmd) {
    const from = String(fromYmd || '');
    const to = String(toYmd || '');
    return [...memory.locks.values()].filter((row) => {
      const date = String(row.business_date || '');
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    }).sort((a, b) => a.business_date.localeCompare(b.business_date));
  }

  function revisionsFor(memory, date) {
    const key = String(date || '');
    return memory.revisions
      .filter((row) => row.business_date === key)
      .slice()
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  return {
    SOURCES,
    roundMoney,
    normalizeSource,
    normalizeAmounts,
    isLocked,
    guardTillUpsert,
    prepareLock,
    prepareCorrection,
    createMemory,
    lockDay,
    correctDay,
    getLock,
    locksInRange,
    revisionsFor,
  };
});
