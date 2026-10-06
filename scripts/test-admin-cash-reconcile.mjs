/**
 * LECHAIM — Cash reconciliation uses existing income, expense, and tip figures.
 * Run: node scripts/test-admin-cash-reconcile.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
require(path.join(root, 'js/admin-cash-reconcile-core.js'));
require(path.join(root, 'js/admin-credits-core.js'));
const reconcile = globalThis.LechaimAdminCashReconcile;
const credits = globalThis.LechaimAdminCreditsCore;

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

section('פיוס מזומן — הדוגמה');
{
  const row = reconcile.reconcileCash({
    incomeCash: 5000,
    tips: 500,
    cashExpenses: 1000,
    actual: 4400,
  });
  assert(row.expected === 4000, 'יתרה צפויה = הכנסות מזומן - הוצאות מזומן');
  assert(row.difference === 400, 'הפרש = בפועל פחות היתרה הצפויה');
  assert(row.remaining === 4000, 'בלי הפקדות נשאר כל היתרה');
  assert(row.tips == null, 'טיפים לא נכללים ביתרה הצפויה');
}

section('פיוס מזומן — בלי ספירה');
{
  const row = reconcile.reconcileCash({
    incomeCash: 5000,
    tips: 500,
    cashExpenses: 1000,
    actual: null,
  });
  assert(row.expected === 4000, 'היתרה הצפויה מחושבת גם בלי ספירה');
  assert(row.actual == null, 'בלי הזנה אין מזומן בפועל');
  assert(row.difference == null, 'בלי הזנה אין הפרש מספרי');
  assert(row.remaining === 4000, 'היתרה להפקדה לא תלויה בספירה');
  assert(reconcile.parseActualCash('') == null, 'שדה ריק אינו 0');
  assert(reconcile.parseActualCash('   ') == null, 'רווחים אינם 0');
  assert(reconcile.parseActualCash('0') === 0, '0 שהוזן נשמר כאפס');
}

section('פיוס מזומן — קלט');
{
  assert(reconcile.parseActualCash('4,400') === 4400, 'פסיק אלפים');
  assert(reconcile.parseActualCash('12.5') === 12.5, 'נקודה עשרונית');
  assert(reconcile.parseActualCash('12,5') === 12.5, 'פסיק עשרוני');
  assert(reconcile.parseActualCash('-5') == null, 'סכום שלילי לא מתקבל');
  assert(reconcile.parseActualCash('abc') == null, 'טקסט לא מתקבל');
}

section('הסיכום הקיים לא משתנה');
{
  const sales = { cash: 5000, credit: 2000, total: 7000 };
  const creditRows = [
    { supplier_name: 'זיכויים', document_type: 'income_credit', category: 'cash', amount_total: 100, status: 'saved' },
    { supplier_name: 'זיכויים', document_type: 'income_credit', category: 'credit', amount_total: 40, status: 'saved' },
  ];
  const income = credits.reportIncomeWithCredits(sales, creditRows);
  assert(income.salesCash === 5000 && income.sales === 7000, 'מכירות המזומן והסה״כ נשארים');
  assert(income.credits.cash === 100 && income.credits.total === 140, 'זיכויים נשארים לפי אופן הקבלה');
  assert(income.incomeCash === 5100, 'הכנסות מזומן = מכירות מזומן + זיכוי מזומן');
  const withCashCredits = reconcile.reconcileCash({
    incomeCash: income.incomeCash,
    cashExpenses: 1000,
    actual: 10000,
    deposited: 0,
  });
  assert(withCashCredits.incomeCash === 5100 && withCashCredits.expected === 4100, 'הכנסות המזומן = דוח Z + זיכוי במזומן');
  assert(withCashCredits.remaining === 4100, 'היתרה להפקדה לא הופכת לספירת המזומן');
  assert(income.credits.credit === 40 && withCashCredits.incomeCash === 5100, 'זיכוי באשראי לא נכנס למזומן');
  const invoiceCash = 250;
  const noReceiptCash = 80;
  const shownCashExpenses = reconcile.roundMoney(invoiceCash);
  assert(shownCashExpenses === 250, 'הוצאות מזומן בפיוס הן שורת הוצאות המזומן, בלי ללא קבלה');
  assert(noReceiptCash === 80, 'תשלום ללא קבלה נשאר סכום נפרד ולא נבלע בשורה');
  const salaryCash = 300;
  const split = reconcile.splitDisplayedCash(invoiceCash + noReceiptCash + salaryCash, noReceiptCash, salaryCash);
  assert(split.cashExpenses === 250, 'משכורת במזומן לא נכללת בהוצאות מזומן');
  assert(split.noReceiptCash === 380, 'משכורת במזומן נכללת בהוצאות ללא קבלה במזומן');
}

section('הפקדות מצטברות');
{
  const open = reconcile.reconcileCash({
    incomeCash: 8000,
    tips: 2000,
    cashExpenses: 1000,
    deposited: 2000,
    actual: 10000,
  });
  assert(open.expected === 7000, 'יתרה צפויה 7000');
  assert(open.remaining === 5000, 'אחרי הפקדה של 2000 נשאר 5000');
  assert(open.difference === 3000, 'ההפרש מול היתרה הצפויה, לא מול הספירה כהפקדה');
  assert(open.remaining !== 10000, 'ספירת 10000 לא הופכת לסכום להפקדה');

  const first = reconcile.createDeposit({ id: 'a', date: '2026-10-02', amount: 2000 });
  const second = reconcile.createDeposit({ id: 'b', date: '2026-10-06', amount: 5000 });
  assert(first.ok && second.ok, 'שמירת הפקדה עם תאריך וסכום');
  const outside = reconcile.createDeposit({ id: 'c', date: '2026-09-01', amount: 900 });
  let list = reconcile.appendDeposit([], { ...first.deposit, savedAt: '2026-10-02T10:00:00.000Z' });
  list = reconcile.appendDeposit(list, { ...outside.deposit, savedAt: '2026-09-01T10:00:00.000Z' });
  list = reconcile.appendDeposit(list, { ...second.deposit, savedAt: '2026-10-06T10:00:00.000Z' });
  const reloaded = JSON.parse(JSON.stringify(list));
  const period = reconcile.depositsInPeriod(reloaded, '2026-10-01', '2026-10-31');
  assert(period.length === 2, 'הפקדה ישנה בתקופה נשארת, הפקדה מחוץ לתקופה לא נספרת');
  assert(reconcile.sumDeposits(period) === 7000, 'סך ההפקדות בתקופה');
  const closed = reconcile.reconcileCash({
    incomeCash: 8000,
    tips: 2000,
    cashExpenses: 1000,
    deposited: reconcile.sumDeposits(period),
    actual: 10000,
  });
  assert(closed.remaining === 0, 'אחרי השלמת ההפקדות לא נשאר להפקיד');
  const withoutFirst = reconcile.removeDeposit(reloaded, 'a');
  const afterDelete = reconcile.depositsInPeriod(withoutFirst, '2026-10-01', '2026-10-31');
  assert(afterDelete.length === 1 && reconcile.sumDeposits(afterDelete) === 5000, 'מחיקת הפקדה מעדכנת את הסכום');
  assert(!reconcile.createDeposit({ date: '', amount: 10 }).ok, 'בלי תאריך אין הפקדה');
  assert(!reconcile.createDeposit({ date: '2026-10-06', amount: 0 }).ok, 'סכום 0 לא נשמר כהפקדה');
}

section('פיוס מזומן — שמירה אחרי רענון');
{
  const key = '2026-10-01_2026-10-31';
  const saved = reconcile.rememberActual({}, key, 4400);
  const reloaded = JSON.parse(JSON.stringify(saved));
  assert(reconcile.recallActual(reloaded, key) === 4400, 'הספירה נשמרת לטווח התאריכים');
  assert(reconcile.recallActual(reloaded, '2026-09-01_2026-09-30') == null, 'טווח אחר לא מקבל את אותה ספירה');
  const cleared = reconcile.rememberActual(reloaded, key, null);
  assert(reconcile.recallActual(cleared, key) == null, 'מחיקת הספירה מחזירה למצב שטרם הוזן');
}

console.log(`\n${passed} עברו, ${failed} נכשלו`);
if (failed) process.exit(1);
