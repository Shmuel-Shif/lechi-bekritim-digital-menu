/**
 * LECHAIM — Sales screen shows a saved day report as saved.
 * Run: node scripts/test-admin-till-saved-report.mjs
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

globalThis.window = globalThis;
globalThis.document = {
  getElementById() { return null; },
  querySelector() { return null; },
  body: { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
};

require(path.join(root, 'js/admin-daily-lock-core.js'));
require(path.join(root, 'js/admin-till.js'));

const math = globalThis.LechaimAdminTill.TillMath;
const saved = { cash: 0, credit: 884, tip: 1434 };
const laterLive = { cash: 1327, credit: 906.4, tip: 1434 };
const laterRows = [
  { payment_method: 'cash', paid_cash: 1327, paid_credit: 0, paid_tip: 0 },
  { payment_method: 'credit', paid_cash: 0, paid_credit: 906.4, paid_tip: 1434 },
];
const staleBase = { cash: 0, credit: 884, tip: 1434 };

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

function figures(lock, report, live) {
  return math.salesScreenFigures(lock, report, live);
}

section('תרחיש 1 — 28/09 נשאר הדיווח שנשמר');
{
  const live = math.buildSummary(laterRows);
  assert(live.cash === 1327 && live.credit === 906.4 && live.tip === 1434, 'ההזמנות המאוחרות באמת מסתכמות למספר המנופח');
  const shown = figures(null, saved, live);
  assert(shown.sales === 884, 'מכירות נשארות 884');
  assert(shown.cash === 0, 'מזומן נשאר 0');
  assert(shown.credit === 884, 'אשראי נשאר 884');
  assert(shown.tip === 1434, 'טיפים נשארים 1434');
  assert(shown.source === 'report', 'המקור הוא הדיווח השמור');
  const ignoredBase = math.displayedSales(laterLive, saved, staleBase);
  assert(ignoredBase.cash === 0 && ignoredBase.credit === 884 && ignoredBase.tip === 1434, 'בסיס העריכה המקומי לא מתווסף לדיווח');
}

section('תרחיש 2 — יום בלי דיווח שמור נשאר חי');
{
  const live = { cash: 40, credit: 20, tip: 8 };
  const shown = figures(null, null, live);
  assert(shown.cash === 40 && shown.credit === 20 && shown.tip === 8 && shown.sales === 60, 'בלי דיווח שמור מוצגות ההזמנות');
  assert(shown.source === 'live' && shown.locked === false, 'המקור הוא order_sessions');
}

section('תרחיש 3 — נעילה קודמת לדיווח ולחי');
{
  const lock = {
    business_date: '2026-09-28',
    cash: 11,
    credit: 22,
    tip: 33,
    sales: 33,
  };
  const shown = figures(lock, saved, laterLive);
  assert(shown.cash === 11 && shown.credit === 22 && shown.tip === 33 && shown.sales === 33, 'הערכים הנעולים מוצגים');
  assert(shown.source === 'lock' && shown.locked === true, 'המקור הוא הנעילה');
}

section('תרחיש 4 — רענון לא משנה יום מדווח או נעול');
{
  const first = figures(null, saved, laterLive);
  const afterRefresh = figures(null, saved, { cash: 5000, credit: 4000, tip: 3000 });
  assert(
    first.sales === afterRefresh.sales
      && first.cash === afterRefresh.cash
      && first.credit === afterRefresh.credit
      && first.tip === afterRefresh.tip,
    'דיווח שמור נשאר אחרי רענון עם הזמנות גדולות יותר'
  );
  const lock = { business_date: '2026-09-28', cash: 1, credit: 2, tip: 3, sales: 3 };
  const locked = figures(lock, saved, laterLive);
  const lockedAgain = figures(lock, saved, { cash: 9, credit: 9, tip: 9 });
  assert(locked.sales === 3 && lockedAgain.sales === 3 && lockedAgain.cash === 1, 'יום נעול נשאר אחרי רענון');
}

section('תרחיש 5 — עריכה מפורשת מחליפה את מקור האמת');
{
  const edited = { cash: 100, credit: 50, tip: 10 };
  const shown = figures(null, edited, laterLive);
  assert(shown.cash === 100 && shown.credit === 50 && shown.tip === 10 && shown.sales === 150, 'אחרי שמירה מוצג הערך החדש');
  const again = figures(null, edited, { cash: 999, credit: 999, tip: 999 });
  assert(again.sales === 150 && again.cash === 100, 'הערך החדש לא מתנפח מהזמנות מאוחרות');
}

section('א-ב. דיווח שמור נשאר אחרי רענון וסגירה חדשה');
{
  const approved = { cash: 406, credit: 1060, tip: 950 };
  const first = figures(null, approved, { cash: 406, credit: 1060, tip: 130 });
  const extraOrders = math.buildSummary([
    { payment_method: 'cash', paid_cash: 1286, paid_credit: 0, paid_tip: 130 },
    { payment_method: 'credit', paid_cash: 0, paid_credit: 1060, paid_tip: 0 },
  ]);
  const afterRefresh = figures(null, approved, extraOrders);
  assert(first.cash === 406 && first.credit === 1060 && first.tip === 950 && first.sales === 1466, 'הכרטיס מציג את הדיווח השמור');
  assert(
    afterRefresh.cash === 406 && afterRefresh.credit === 1060 && afterRefresh.tip === 950 && afterRefresh.sales === 1466,
    'רענון וסגירה חדשה לא משנים את הדיווח השמור'
  );
  assert(extraOrders.cash === 1286 && extraOrders.credit === 1060, 'buildSummary עדיין מסכם את ההזמנות בנפרד');
  assert(afterRefresh.source === 'report', 'המקור נשאר הדיווח השמור');
}

section('ג-ו. נעילה, דריסה ותיקון');
{
  const core = globalThis.LechaimAdminDailyLock;
  const memory = core.createMemory();
  const locked = core.lockDay(memory, {
    date: '2026-09-29',
    cash: 406,
    credit: 1060,
    tip: 950,
    source: 'till',
    userId: 'user-1',
    now: '2026-09-29T19:00:00.000Z',
  });
  const again = core.lockDay(memory, {
    date: '2026-09-29',
    cash: 1,
    credit: 1,
    tip: 1,
    now: '2026-09-29T20:00:00.000Z',
  });
  assert(locked.ok === true && locked.lock.sales === 1466, 'נעילה שומרת מכירות כמזומן ועוד אשראי');
  assert(again.ok === false && again.code === 'already_locked', 'אין נעילה שנייה ואין דריסה');
  const shown = figures(locked.lock, { cash: 999, credit: 999, tip: 999 }, { cash: 1286, credit: 1060, tip: 130 });
  assert(shown.cash === 406 && shown.credit === 1060 && shown.tip === 950 && shown.sales === 1466 && shown.locked === true, 'יום נעול לא זז מסגירות חדשות');
  assert(core.guardTillUpsert(locked.lock).ok === false, 'שמירה רגילה נחסמת ביום נעול');
  const noReason = core.correctDay(memory, { date: '2026-09-29', cash: 1, credit: 1, tip: 1, reason: '  ' });
  assert(noReason.ok === false && noReason.code === 'reason_required', 'תיקון בלי סיבה נדחה');
  const fixed = core.correctDay(memory, {
    date: '2026-09-29',
    cash: 400,
    credit: 1000,
    tip: 10,
    reason: 'ספירה מחדש',
    userId: 'user-2',
    now: '2026-09-30T08:00:00.000Z',
  });
  const history = core.revisionsFor(memory, '2026-09-29');
  assert(fixed.ok === true && fixed.lock.sales === 1400 && fixed.lock.revised_by === 'user-2', 'תיקון עם סיבה מעדכן את הערך הפעיל');
  assert(history[0].action === 'lock' && history[0].cash === 406 && history[0].tip === 950, 'הנעילה המקורית נשארת בהיסטוריה');
  assert(history[1].action === 'correct' && history[1].reason === 'ספירה מחדש', 'נוספת revision של התיקון');
  const current = figures(core.getLock(memory, '2026-09-29'), null, { cash: 9, credit: 9, tip: 9 });
  assert(current.cash === 400 && current.sales === 1400, 'הכרטיס מציג את הערך שאחרי התיקון');
}

section('ז. יום אפס שמור ונעול');
{
  const zeroReport = figures(null, { cash: 0, credit: 0, tip: 0 }, { cash: 50, credit: 50, tip: 50 });
  assert(zeroReport.cash === 0 && zeroReport.credit === 0 && zeroReport.tip === 0 && zeroReport.sales === 0 && zeroReport.source === 'report', 'שורת אפסים היא דיווח שמור');
  const zeroLock = {
    business_date: '2026-10-01',
    cash: 0,
    credit: 0,
    tip: 0,
    sales: 0,
  };
  const shown = figures(zeroLock, null, { cash: 50, credit: 50, tip: 50 });
  assert(globalThis.LechaimAdminDailyLock.isLocked(zeroLock) === true, 'נעילת אפסים מזוהה לפי הרשומה');
  assert(shown.sales === 0 && shown.locked === true && shown.source === 'lock', 'יום אפס נעול לא נופל לסיכום החי');
}

section('ח-י. WhatsApp ויום בלי דיווח');
{
  const till = readFileSync(path.join(root, 'js/admin-till.js'), 'utf8');
  const waStart = till.indexOf('function buildWhatsAppText()');
  const waBody = till.slice(waStart, till.indexOf('function isMobileDevice()'));
  assert(waBody.includes('const shown = cardFigures()'), 'WhatsApp לוקח את ערכי הכרטיס');
  assert(!waBody.includes('buildSummary'), 'WhatsApp לא מחשב הזמנות מחדש');
  assert(!waBody.includes('Math.max'), 'WhatsApp לא מערבב עם ההזמנות');
  const displayStart = till.indexOf('function displayedSales');
  const displayBody = till.slice(displayStart, till.indexOf('function salesScreenFigures'));
  assert(!displayBody.includes('Math.max'), 'דיווח שמור לא עובר Math.max');
  assert(!till.includes('lechaim-till-edit-base'), 'אין חיבור של סגירות חדשות לדיווח שמור');
  const live = figures(null, null, { cash: 12, credit: 8, tip: 3 });
  const fromOrders = math.buildSummary([
    { payment_method: 'cash', paid_cash: 12, paid_credit: 0, paid_tip: 1 },
    { payment_method: 'credit', paid_cash: 0, paid_credit: 8, paid_tip: 2 },
  ]);
  assert(live.cash === 12 && live.credit === 8 && live.tip === 3 && live.sales === 20 && live.source === 'live', 'יום בלי דיווח מציג את המספרים החיים');
  assert(fromOrders.cash === 12 && fromOrders.credit === 8 && fromOrders.tip === 3, 'buildSummary ממשיך לסכם יום בלי דיווח');
  const sql = readFileSync(path.join(root, 'supabase-daily-report-locks.sql'), 'utf8');
  assert(!sql.includes('2026-09-28') || sql.includes('including 2026-09-28'), 'ה-SQL לא ממלא את 28/09');
  assert(!/insert\s+into\s+public\.daily_report_locks[\s\S]{0,80}2026-09-2[89]|insert\s+into\s+public\.till_day_reports/i.test(sql), 'ה-SQL לא כותב ימים היסטוריים ולא נוגע ב-till_day_reports');
}

section('הסיכום הכספי לא השתנה');
{
  const documents = readFileSync(path.join(root, 'js/admin-documents.js'), 'utf8');
  const xlsx = readFileSync(path.join(root, 'js/docs-monthly-xlsx.js'), 'utf8');
  const till = readFileSync(path.join(root, 'js/admin-till.js'), 'utf8');
  assert(!documents.includes('salesScreenFigures'), 'admin-documents.js לא קורא את מסך המכירות');
  assert(!xlsx.includes('salesScreenFigures'), 'Excel של הסיכום לא קורא את מסך המכירות');
  assert(documents.includes('sumZAmounts(periodZRows())'), 'renderReport עדיין מסכם מדוחות Z');
  assert(!till.includes('lechaim-till-edit-base'), 'אין יותר מפתח lechaim-till-edit-base');
  assert(!till.includes('Math.max(cash, roundMoney(report.cash))'), 'אין Math.max בין הדיווח להזמנות');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
