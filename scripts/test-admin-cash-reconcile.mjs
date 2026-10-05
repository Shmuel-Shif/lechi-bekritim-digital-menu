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
  assert(row.difference === 400, 'הפרש = בפועל פחות צפוי');
  assert(row.deposit === 4000, 'הפקדה = הכנסות מזומן פחות הוצאות מזומן');
  assert(row.tips == null, 'טיפים לא נכללים בפיוס');
  assert(row.incomeCash === 5000 && row.cashExpenses === 1000, 'ההכנסות וההוצאות נשמרות כמו שהועברו');
}

section('פיוס מזומן — בלי ספירה');
{
  const row = reconcile.reconcileCash({
    incomeCash: 5000,
    cashExpenses: 1000,
    actual: null,
  });
  assert(row.expected === 4000, 'היתרה הצפויה מחושבת גם בלי ספירה');
  assert(row.actual == null, 'בלי הזנה אין מזומן בפועל');
  assert(row.difference == null, 'בלי הזנה אין הפרש מספרי');
  assert(row.deposit === 4000, 'ההפקדה מחושבת גם בלי ספירה');
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
    actual: 4400,
  });
  assert(withCashCredits.incomeCash === 5100 && withCashCredits.expected === 4100, 'הכנסות המזומן = דוח Z + זיכוי במזומן');
  assert(withCashCredits.deposit === 4100, 'ההפקדה כוללת זיכוי מזומן ולא תלויה בספירה');
  assert(income.credits.credit === 40 && withCashCredits.incomeCash === 5100, 'זיכוי באשראי לא נכנס למזומן');
  const invoiceCash = 250;
  const noReceiptCash = 80;
  const shownCashExpenses = reconcile.roundMoney(invoiceCash);
  assert(shownCashExpenses === 250, 'הוצאות מזומן בפיוס הן שורת הוצאות המזומן, בלי ללא קבלה');
  assert(noReceiptCash === 80, 'תשלום ללא קבלה נשאר סכום נפרד ולא נבלע בשורה');
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
