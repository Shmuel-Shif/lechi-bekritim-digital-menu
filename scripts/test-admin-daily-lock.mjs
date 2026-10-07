/**
 * LECHAIM — Locked daily report, stage 1.
 * Run: node scripts/test-admin-daily-lock.mjs
 *
 * Covers the lock rules and a stand-in database for the service functions.
 * Does not write to Supabase and does not change existing rows.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

require(path.join(root, 'js/admin-daily-lock-core.js'));
const core = globalThis.LechaimAdminDailyLock;

globalThis.window = globalThis;
const locks = new Map();
const revisions = [];
const tillReports = new Map();
let tillWrites = 0;

function clone(row) {
  return row ? { ...row } : null;
}

function matches(row, state) {
  if (state.filters.some(([col, value]) => row[col] !== value)) return false;
  if (state.gte && String(row[state.gte[0]]) < String(state.gte[1])) return false;
  if (state.lte && String(row[state.lte[0]]) > String(state.lte[1])) return false;
  return true;
}

function tableRows(table) {
  if (table === 'daily_report_locks') return [...locks.values()].map(clone);
  if (table === 'daily_report_revisions') return revisions.map(clone);
  if (table === 'till_day_reports') return [...tillReports.values()].map(clone);
  return [];
}

function query(table) {
  const state = { filters: [], gte: null, lte: null, orderCol: null, op: 'select', payload: null };
  const api = {
    select() { return api; },
    eq(col, value) { state.filters.push([col, value]); return api; },
    gte(col, value) { state.gte = [col, value]; return api; },
    lte(col, value) { state.lte = [col, value]; return api; },
    order(col) { state.orderCol = col; return api; },
    upsert(payload) { state.op = 'upsert'; state.payload = payload; return api; },
    delete() { state.op = 'delete'; return api; },
    maybeSingle() { return finish('maybe'); },
    single() { return finish('single'); },
    then(resolve, reject) { return finish('many').then(resolve, reject); },
  };

  function finish(mode) {
    if (state.op === 'upsert' && table === 'till_day_reports') {
      tillWrites += 1;
      const saved = { ...state.payload };
      tillReports.set(saved.business_date, saved);
      return Promise.resolve({ data: clone(saved), error: null });
    }
    const found = tableRows(table).filter((row) => matches(row, state));
    if (state.orderCol) {
      found.sort((a, b) => String(a[state.orderCol]).localeCompare(String(b[state.orderCol])));
    }
    if (mode === 'maybe') return Promise.resolve({ data: found[0] || null, error: null });
    if (mode === 'single') {
      return Promise.resolve({
        data: found[0] || null,
        error: found[0] ? null : { message: 'no row', code: 'PGRST116' },
      });
    }
    return Promise.resolve({ data: found, error: null });
  }

  return api;
}

function lockRpc(pRow) {
  const date = String(pRow?.business_date || '');
  if (locks.has(date)) return { ok: false, error: 'already_locked' };
  const row = {
    business_date: date,
    cash: Number(pRow.cash),
    credit: Number(pRow.credit),
    tip: Number(pRow.tip),
    sales: Number(pRow.sales),
    source: pRow.source,
    note: pRow.note || null,
    locked_at: pRow.locked_at,
    locked_by: 'user-1',
    revised_at: null,
    revised_by: null,
  };
  locks.set(date, row);
  revisions.push({
    id: `rev-${revisions.length + 1}`,
    business_date: date,
    cash: row.cash,
    credit: row.credit,
    tip: row.tip,
    sales: row.sales,
    source: row.source,
    reason: '',
    created_by: 'user-1',
    created_at: row.locked_at,
    action: 'lock',
  });
  return { ok: true, row: clone(row) };
}

function correctRpc(pRow) {
  const date = String(pRow?.business_date || '');
  const reason = String(pRow?.reason || '').trim();
  if (!reason) return { ok: false, error: 'reason_required' };
  const current = locks.get(date);
  if (!current) return { ok: false, error: 'not_locked' };
  const next = {
    ...current,
    cash: Number(pRow.cash),
    credit: Number(pRow.credit),
    tip: Number(pRow.tip),
    sales: Number(pRow.sales),
    revised_at: pRow.revised_at,
    revised_by: 'user-1',
  };
  locks.set(date, next);
  revisions.push({
    id: `rev-${revisions.length + 1}`,
    business_date: date,
    cash: next.cash,
    credit: next.credit,
    tip: next.tip,
    sales: next.sales,
    source: next.source,
    reason,
    created_by: 'user-1',
    created_at: next.revised_at,
    action: 'correct',
  });
  return { ok: true, row: clone(next) };
}

globalThis.LechaimInventory = {
  getClient() {
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from: query,
      rpc: async (name, args) => {
        const body = name === 'lock_daily_report'
          ? lockRpc(args?.p_row)
          : name === 'correct_daily_report'
            ? correctRpc(args?.p_row)
            : { ok: false, error: 'invalid_row' };
        return { data: body, error: null };
      },
    };
  },
};

require(path.join(root, 'js/supabase-order-service.js'));
const api = globalThis.LechaimSupabaseOrders;

let passed = 0;
let failed = 0;

function assert(cond, message) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${message}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${message}`);
}

function section(title) {
  console.log(`\n${title}`);
}

async function rejects(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

section('נעילת יום חדש');
{
  const memory = core.createMemory();
  const locked = core.lockDay(memory, {
    date: '2026-10-06',
    cash: 10,
    credit: 5,
    tip: 7,
    source: 'till',
    userId: 'user-1',
    now: '2026-10-06T20:00:00.000Z',
  });
  assert(locked.ok === true, 'נעילה חדשה מתקבלת');
  assert(locked.lock.sales === 15, 'מכירות = מזומן + אשראי, בלי טיפים');
  assert(locked.lock.source === 'till', 'נעילה ידנית נשמרת כ-till');
  assert(locked.revision.action === 'lock', 'נוצרת רשומת lock ראשונה');
  assert(core.getLock(memory, '2026-10-06').cash === 10, 'אפשר לקרוא את הנעילה לפי תאריך');
}

section('מקור WhatsApp שמור לשימוש מאוחר');
{
  const memory = core.createMemory();
  const locked = core.lockDay(memory, {
    date: '2026-09-06',
    cash: 887.7,
    credit: 207,
    tip: 0,
    source: 'whatsapp',
    now: '2026-09-06T20:00:00.000Z',
  });
  assert(locked.ok === true && locked.lock.source === 'whatsapp', 'אפשר לנעול עם מקור whatsapp');
  assert(locked.lock.sales === 1094.7, 'מכירות WhatsApp גם הן מזומן ועוד אשראי');
}

section('מניעת נעילה כפולה');
{
  const memory = core.createMemory();
  core.lockDay(memory, { date: '2026-10-06', cash: 1, credit: 2, tip: 3, now: '2026-10-06T20:00:00.000Z' });
  const again = core.lockDay(memory, { date: '2026-10-06', cash: 9, credit: 9, tip: 9, now: '2026-10-06T21:00:00.000Z' });
  assert(again.ok === false && again.code === 'already_locked', 'נעילה שנייה נדחית');
  assert(core.getLock(memory, '2026-10-06').cash === 1, 'הנעילה הראשונה לא נדרסת');
  assert(core.revisionsFor(memory, '2026-10-06').length === 1, 'לא נוצרת רשומת היסטוריה שנייה');
}

section('יום אפס');
{
  const memory = core.createMemory();
  const locked = core.lockDay(memory, {
    date: '2026-10-01',
    cash: 0,
    credit: 0,
    tip: 0,
    now: '2026-10-01T20:00:00.000Z',
  });
  assert(locked.ok === true, 'יום שכל הערכים בו 0 ננעל');
  assert(locked.lock.sales === 0, 'מכירות ביום אפס הן 0');
  assert(core.isLocked(locked.lock) === true, 'isLocked מזהה יום אפס כנעול');
  assert(core.isLocked(null) === false, 'יום בלי שורה אינו נעול');
  const zeroReport = { cash: 0, credit: 0, tip: 0 };
  const wouldLookEmpty = !(zeroReport.cash > 0 || zeroReport.credit > 0 || zeroReport.tip > 0);
  assert(wouldLookEmpty && core.isLocked(locked.lock), 'יום אפס לא נקבע לפי hasSavedReport');
}

section('שירות — נעילה, תיקון וחסימת עריכה');
{
  const row = await api.createDailyReportLock('2026-10-06', {
    cash: 40,
    credit: 20,
    tip: 8,
    source: 'till',
  });
  assert(row.cash === 40 && row.sales === 60 && row.tip === 8, 'השירות שומר מזומן, אשראי, טיפ ומכירות בלי טיפ');
  assert(await api.isDailyReportLocked('2026-10-06') === true, 'היום מסומן כנעול');
  const history = await api.getDailyReportRevisions('2026-10-06');
  assert(history.length === 1 && history[0].action === 'lock', 'נשמרים lock וגם revision');
  const original = { ...history[0] };

  const duplicate = await rejects(() => api.createDailyReportLock('2026-10-06', {
    cash: 1, credit: 1, tip: 1, source: 'till',
  }));
  assert(duplicate?.code === 'DAILY_REPORT_ALREADY_LOCKED', 'השירות מונע נעילה כפולה');

  const zero = await api.createDailyReportLock('2026-10-02', {
    cash: 0, credit: 0, tip: 0, source: 'till',
  });
  assert(zero.sales === 0 && await api.isDailyReportLocked('2026-10-02') === true, 'השירות נועל גם יום אפס');

  const noReason = await rejects(() => api.correctDailyReportLock('2026-10-06', {
    cash: 1, credit: 1, tip: 1, reason: '   ',
  }));
  assert(noReason?.code === 'DAILY_REPORT_REASON_REQUIRED', 'תיקון בלי סיבה נדחה');

  const corrected = await api.correctDailyReportLock('2026-10-06', {
    cash: 12,
    credit: 3,
    tip: 1,
    reason: 'ספירה מחדש',
  });
  assert(corrected.cash === 12 && corrected.sales === 15 && corrected.revised_by === 'user-1', 'הערך הנוכחי מתעדכן אחרי תיקון');
  assert(corrected.locked_at === row.locked_at && corrected.locked_by === row.locked_by, 'זמן הנעילה והנועל המקורי נשארים');
  const after = await api.getDailyReportRevisions('2026-10-06');
  assert(after.length === 2 && after[1].action === 'correct' && after[1].reason === 'ספירה מחדש', 'נוספת רשומת correct');
  assert(after[0].action === 'lock' && after[0].cash === original.cash && after[0].sales === original.sales, 'רשומת הנעילה המקורית ביומן לא משתנה');
  const current = await api.getDailyReportLock('2026-10-06');
  assert(current.cash === 12 && current.credit === 3 && current.tip === 1, 'קריאת הנעילה מחזירה את הערך אחרי התיקון');

  const range = await api.getDailyReportLocksInRange('2026-10-01', '2026-10-06');
  assert(range.map((item) => item.business_date).join(',') === '2026-10-02,2026-10-06', 'קריאה לפי טווח מחזירה רק ימים נעולים');

  const blocked = await rejects(() => api.upsertTillDayReport('2026-10-06', { cash: 99, credit: 99, tip: 99 }));
  assert(blocked?.code === 'DAILY_REPORT_LOCKED', 'upsertTillDayReport נדחה ביום נעול');
  assert(tillWrites === 0 && !tillReports.has('2026-10-06'), 'till_day_reports לא נכתב ביום נעול');

  const openWrite = await api.upsertTillDayReport('2026-10-03', { cash: 4, credit: 6, tip: 1 });
  assert(openWrite.cash === 4 && tillWrites === 1, 'יום שלא ננעל ממשיך להישמר ב-till_day_reports');
  assert(await api.isDailyReportLocked('2026-10-03') === false, 'יום שלא ננעל נשאר פתוח');
  assert(locks.size === 2, 'שמירת דוח רגיל לא יוצרת נעילה');
}

section('יום פתוח והסיכום הכספי לא משנים התנהגות');
{
  const till = read('js/admin-till.js');
  const documents = read('js/admin-documents.js');
  const xlsx = read('js/docs-monthly-xlsx.js');
  const service = read('js/supabase-order-service.js');
  const sql = read('supabase-daily-report-locks.sql');
  const upsertAt = service.indexOf('async function upsertTillDayReport');
  const upsertBody = service.slice(upsertAt, service.indexOf('async function deleteTillDayReport'));
  const guardAt = upsertBody.indexOf('guardTillUpsert');
  const writeAt = upsertBody.indexOf(".from(TILL_DAY_REPORTS)");
  assert(guardAt > 0 && writeAt > guardAt, 'בדיקת הנעילה רצה לפני כתיבה ל-till_day_reports');
  assert(till.includes('function displayedSales') && till.includes("source: 'live'"), 'יום בלי דיווח שמור עדיין חי');
  assert(!till.includes('lechaim-till-edit-base'), 'מסך המכירות לא מוסיף מכירות אחרי השמירה');
  assert(!/hasSavedReport\(\s*cache\.lock/.test(till), 'הנעילה לא נקבעת דרך hasSavedReport');
  assert(till.includes("source: 'till'"), 'נעילה מהמסך נשמרת עם מקור till');

  const renderAt = documents.indexOf('function renderReport()');
  const renderBody = documents.slice(renderAt, documents.indexOf('function changeMonth'));
  assert(renderBody.includes('sumZAmounts(periodZRows())'), 'renderReport עדיין מסכם מדוחות Z');
  assert(renderBody.includes('formatMoney(zSplit.cash)'), 'כרטיס המזומן בסיכום עדיין מגיע מ-Z');
  assert(renderBody.includes('formatMoney(zSplit.credit)'), 'כרטיס האשראי בסיכום עדיין מגיע מ-Z');
  assert(renderBody.includes('daily.tip'), 'כרטיס הטיפים בסיכום עדיין מגיע מ-till_day_reports');
  assert(!documents.includes('daily_report_locks'), 'סיכום כספי לא קורא נעילות');
  assert(!xlsx.includes('daily_report_locks'), 'Excel של הסיכום לא קורא נעילות');
  const excelAt = documents.indexOf('async function downloadMonthExcel()');
  const excelBody = documents.slice(excelAt, excelAt + 2500);
  assert(excelBody.includes('sumZAmounts(periodZRows())'), 'Excel של הסיכום עדיין מסכם מדוחות Z');

  assert(/business_date date primary key/.test(sql), 'יש שורה אחת לכל business_date');
  assert(!/update\s+public\.daily_report_revisions/i.test(sql), 'היומן אינו מתעדכן');
  assert(!/(insert\s+into|update|delete\s+from)\s+public\.(order_sessions|till_day_reports|business_documents)/i.test(sql), 'ה-SQL לא מעתיק נתונים קיימים');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
