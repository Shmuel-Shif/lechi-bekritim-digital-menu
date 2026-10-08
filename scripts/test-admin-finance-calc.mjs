/**
 * Summary calculator reads displayed amounts and does not own the finance math.
 * Run: node scripts/test-admin-finance-calc.mjs
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
require(path.join(root, 'js/admin-finance-calc.js'));

const calc = globalThis.LechaimFinanceCalc;
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

function figure(text, label) {
  return calc.collectDisplayedAmounts([{ text, label }])[0];
}

const calcSrc = readFileSync(path.join(root, 'js/admin-finance-calc.js'), 'utf8');
const docsSrc = readFileSync(path.join(root, 'js/admin-documents.js'), 'utf8');
const html = readFileSync(path.join(root, 'admin.html'), 'utf8');
const reportStart = docsSrc.indexOf('function renderReport()');
const reportEnd = docsSrc.indexOf('function financeCalcApi()');
const reportFn = docsSrc.slice(reportStart, reportEnd);

assert(!/\beval\s*\(/.test(calcSrc), 'calculator does not use eval');
assert(!/sumZAmounts|till_day_reports|order_sessions|renderReport|business_documents/.test(calcSrc), 'calculator source has no finance data access');
assert(!/docs-fin-cash|docs-fin-tips|docs-fin-credit|docs-fin-sales/.test(calcSrc), 'calculator has no hardcoded summary fields');
assert(reportFn.includes('sumZAmounts(periodZRows())'), 'sales still come from Z rows');
assert(reportFn.includes('salesEl.textContent = formatMoney(zSplit.total)'), 'sales figure is still written by the existing renderer');
assert(reportFn.includes('cashEl.textContent = formatMoney(zSplit.cash)'), 'cash figure is still written by the existing renderer');
assert(reportFn.includes('creditEl.textContent = formatMoney(zSplit.credit)'), 'credit figure is still written by the existing renderer');
assert(reportFn.includes('resultEl.textContent = formatMoney(result)'), 'result figure is still written by the existing renderer');
assert(reportFn.includes('refreshFinanceCalcFigures();'), 'a range refresh only updates the open calculator');
assert(!reportFn.includes('attachFinanceCalcButtons'), 'the report no longer inserts row buttons');
assert(!html.includes('למחשבון') && !docsSrc.includes('למחשבון'), 'there is no per-row add-to-calculator label');
assert(!html.includes('docs-fin-calc-add') && !docsSrc.includes('docs-fin-calc-add'), 'there is no per-row calculator button');
assert(html.includes('id="docs-fin-calc-open"') && html.includes('>מחשבון</button>'), 'the summary has one calculator button');

const source = [
  { text: '€155', label: 'טיפים' },
  { text: '€1,060', label: 'אשראי' },
  { text: '€49.57', label: 'הוצאות ללא קבלה' },
  { text: '€0', label: 'שורה ריקה' },
];
const snapshot = JSON.stringify(source);

const opened = calc.beginSession(source, '01/09/2026 – 30/09/2026');
assert(opened.open && opened.tokens.length === 0, '1. opening the calculator starts an empty formula');
assert(opened.items.length === 4 && opened.items[3].cents === 0, '13. a displayed €0 stays available');

const closed = calc.closeSession(opened);
assert(closed.open === false, '2. closing the calculator closes the session');
assert(JSON.stringify(source) === snapshot, '15. closing does not change the summary figures');

let state = calc.beginSession(source, '01/09/2026 – 30/09/2026');
state = calc.pushValue(state, state.items[0]);
let view = calc.present(state);
assert(view.names === 'טיפים' && view.amounts.includes('€155'), '3. choosing a figure adds its label and amount');

state = calc.pushOp(state, '+');
state = calc.pushValue(state, state.items[1]);
view = calc.present(state);
assert(view.names === 'טיפים + אשראי' && view.resultText === '€1,215', '4. two figures can be added');

state = calc.pushOp(state, '−');
state = calc.pushValue(state, state.items[2]);
view = calc.present(state);
assert(view.resultText === '€1,165.43', '5. subtraction keeps cents: 155 + 1060 - 49.57');
assert(view.names.includes('הוצאות ללא קבלה') && view.amounts.includes('€49.57'), '14. cent values stay in the formula');

let product = calc.pushValue(calc.beginSession([{ text: '€12.50', label: 'א' }, { text: '€2', label: 'ב' }]), figure('€12.50', 'א'));
product = calc.pushOp(product, '×');
product = calc.pushValue(product, figure('€2', 'ב'));
assert(calc.present(product).resultText === '€25', '6. multiplication');

let ratio = calc.pushValue(calc.createState(), figure('€10', 'א'));
ratio = calc.pushOp(ratio, '÷');
ratio = calc.pushValue(ratio, figure('€4', 'ב'));
assert(calc.present(ratio).resultText === '€2.50', '7. division');

const chain = calc.present(state);
assert(chain.names === 'טיפים + אשראי − הוצאות ללא קבלה', '8. a chain keeps every label and operation');
state = calc.commitEquals(state);
assert(calc.present(state).resultText === '€1,165.43' && calc.present(state).message === '', '8. equals confirms a finished chain');

state = calc.clearState(state);
assert(state.tokens.length === 0 && calc.present(state).names === '', '9. C clears the formula');

state = calc.pushValue(state, figure('€80', 'מזומן'));
state = calc.pushOp(state, '+');
state = calc.backspace(state);
assert(state.tokens.length === 1 && state.tokens[0].label === 'מזומן', '10. backspace removes the last item');

let zero = calc.pushValue(calc.createState(), figure('€8', 'שמונה'));
zero = calc.pushOp(zero, '÷');
zero = calc.pushValue(zero, figure('€0', 'אפס'));
assert(calc.present(zero).resultText === '' && calc.present(zero).message === 'לא ניתן לחלק באפס', '11. division by zero shows an error and no number');

const september = calc.beginSession([{ text: '€100', label: 'נתון' }], 'ספטמבר 2026');
const withValue = calc.pushValue(september, september.items[0]);
const october = calc.syncSession(withValue, [{ text: '€250', label: 'נתון' }], 'אוקטובר 2026');
assert(october.tokens.length === 0 && october.items[0].cents === 25000, '12. a new date range replaces the figures and starts a new formula');

const again = calc.beginSession(source, '01/09/2026 – 30/09/2026');
assert(again.tokens.length === 0, 'reopening starts a new calculation');

const blockedValue = calc.pushValue(calc.pushValue(calc.createState(), figure('€1', 'א')), figure('€2', 'ב'));
assert(blockedValue.message === 'בחרו פעולה לפני הנתון הבא', 'two figures in a row are refused');
const blockedOp = calc.pushOp(calc.pushOp(calc.pushValue(calc.createState(), figure('€1', 'א')), '+'), '−');
assert(blockedOp.message === 'כבר נבחרה פעולה', 'two operations in a row are refused');
const startsWithOp = calc.pushOp(calc.createState(), '+');
assert(startsWithOp.message === 'בחרו נתון קודם', 'an operation cannot start the formula');
const unfinished = calc.commitEquals(calc.pushOp(calc.pushValue(calc.createState(), figure('€3', 'א')), '−'));
assert(unfinished.message === 'הנוסחה לא הושלמה', 'equals on an unfinished formula shows an error');

const cents = calc.pushValue(calc.createState(), figure('€0.10', 'א'));
const sumCents = calc.pushValue(calc.pushOp(cents, '+'), figure('€0.20', 'ב'));
assert(calc.present(sumCents).resultText === '€0.30', '14. 0.10 + 0.20 is 0.30, not a floating-point residue');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
