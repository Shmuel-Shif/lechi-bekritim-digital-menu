/**
 * Node tests for LechaimPrintSessionWaves (staff / shared wave print helper).
 * Run: node scripts/test-staff-print-waves.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const waves = require(join(__dirname, '..', 'js', 'print-session-waves.js'));

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

function sampleOrders() {
  return [
    {
      id: 'wave-1',
      order_number: 1,
      status: 'ready',
      printed_at: '2026-10-03T10:00:00.000Z',
      created_at: '2026-10-03T09:00:00.000Z',
      order_items: [
        { id: 'i1', product_id: 'schnitzel', product_name: 'שניצל', print_name: 'Schnitzel', quantity: 1, price: 14 },
        { id: 'i2', product_id: 'salad', product_name: 'סלט', print_name: 'Salad', quantity: 1, price: 8 },
      ],
    },
    {
      id: 'wave-2',
      order_number: 2,
      status: 'submitted',
      printed_at: null,
      created_at: '2026-10-03T11:00:00.000Z',
      order_items: [
        { id: 'i3', product_id: 'fries', product_name: 'צ׳יפס', print_name: 'Fries', quantity: 1, price: 5 },
        { id: 'i4', product_id: 'coke', product_name: 'קולה', print_name: 'Coke', quantity: 1, price: 3, parent_item_id: null },
      ],
    },
  ];
}

section('חלוקת מנות — קיימות מול חדשות');
{
  const parts = waves.partitionOrderLines(sampleOrders(), new Set());
  assert(parts.existing.length === 2, 'הזמנה ישנה מוצגת');
  assert(parts.pending.length === 2, 'מנות חדשות בגל נפרד');
  assert(parts.existing.every((row) => !row.isLateAdd), 'קיימות לא late-add');
  assert(parts.pending.every((row) => row.isLateAdd), 'חדשות הן late-add');
  assert(parts.existing[0].name.includes('שניצל') || parts.existing.some((r) => /שניצל|Schnitzel/i.test(r.name)), 'שניצל נשמר');
}

section('בניית הזמנת הדפסה — רק Wave חדש');
{
  const synthetic = waves.buildPrintOrderFromSession({
    tableNumber: 5,
    sessionId: 'sess-1',
    orders: sampleOrders(),
  });
  assert(synthetic._deltaOnly === true, 'מצב delta בלבד');
  assert(synthetic.items.length === 2, 'רק 2 מנות חדשות בהדפסה');
  const names = synthetic.items.map((row) => row.name).join(' ');
  assert(/Fries|צ׳יפס/i.test(names), 'צ׳יפס בהדפסה');
  assert(/Coke|קולה/i.test(names), 'קולה בהדפסה');
  assert(!/Schnitzel|שניצל/i.test(names), 'שניצל לא בהדפסה');
  assert(!/Salad|סלט/i.test(names), 'סלט לא בהדפסה');
  assert(synthetic.ticketSeq === 2, 'מספר בונ = wave 2');
  assert(synthetic.tableNumber === 5, 'מספר שולחן');
  assert(synthetic._waveIds.includes('wave-2'), 'מזהה wave להדפסה');
  assert(!synthetic._waveIds.includes('wave-1'), 'wave ישן לא מסומן להדפסה');
}

section('גל ישן לא משתנה');
{
  const orders = sampleOrders();
  const before = JSON.stringify(orders[0]);
  waves.buildPrintOrderFromSession({
    tableNumber: 5,
    sessionId: 'sess-1',
    orders,
  });
  assert(before === JSON.stringify(orders[0]), 'הזמנה ישנה לא השתנתה');
}

section('unprintedWaves');
{
  const pending = waves.unprintedWaves(sampleOrders(), new Set());
  assert(pending.length === 1 && pending[0].id === 'wave-2', 'רק wave לא מודפס');
  const none = waves.unprintedWaves(sampleOrders(), new Set(['wave-2']));
  assert(none.length === 0, 'לאחר סימון מקומי — אין להדפסה');
}

section('approve candidates');
{
  const need = waves.wavesNeedingApprove(sampleOrders(), new Set());
  assert(need.length === 1 && need[0].id === 'wave-2', 'wave submitted צריך אישור');
}

section('printUnprintedSessionWaves — הצלחה + כשל בלי מחיקה');
{
  const orders = sampleOrders();
  const marked = [];
  const approved = [];
  let printCalled = false;
  const fakeApi = {
    async getSessionOrders() { return orders; },
    async markOrderApproved(id) { approved.push(id); },
    async markOrderPrinted(id) { marked.push(id); },
  };
  const fakePrint = {
    async printOrder(order) {
      printCalled = true;
      assert(order.items.length === 2, 'printOrder קיבל רק מנות חדשות');
      assert(order._deltaOnly === true, 'printOrder במצב delta');
      return true;
    },
  };
  const ok = await waves.printUnprintedSessionWaves({
    tableNumber: 5,
    sessionId: 'sess-1',
    orders,
    api: fakeApi,
    printEngine: fakePrint,
    locallyPrintedIds: new Set(),
  });
  assert(ok.ok && ok.printed && ok.saved, 'הדפסה הצליחה וההזמנה נשמרה');
  assert(printCalled, 'נקרא למנגנון Printing הקיים');
  assert(approved.includes('wave-2'), 'אושר לפני הדפסה כמו Admin');
  assert(marked.includes('wave-2'), 'סומן printed_at');
  assert(orders[0].printed_at, 'wave ישן נשאר מודפס');
  assert(orders[0].order_items.length === 2, 'פריטי wave ישן נשמרו');

  const failPrint = {
    async printOrder() { return false; },
  };
  const marked2 = [];
  const fail = await waves.printUnprintedSessionWaves({
    tableNumber: 5,
    sessionId: 'sess-1',
    orders: sampleOrders(),
    api: {
      async getSessionOrders() { return sampleOrders(); },
      async markOrderApproved() {},
      async markOrderPrinted(id) { marked2.push(id); },
    },
    printEngine: failPrint,
    locallyPrintedIds: new Set(),
  });
  assert(fail.ok === false && fail.saved === true, 'כשל הדפסה לא מוחק הזמנה');
  assert(fail.messageKey === 'orderSavedPrintFailed', 'הודעה ידידותית לכשל');
  assert(marked2.length === 0, 'לא מסמנים printed אחרי כשל');
}

section('בחירת הזמנה ל«הוסף לשולחן»');
{
  const orders = sampleOrders();
  const target = waves.pickSessionAddTargetOrder(orders);
  assert(target && target.id === 'wave-2', 'מעדיף wave לא מודפס');
  const onlyPrinted = [orders[0]];
  const printedTarget = waves.pickSessionAddTargetOrder(onlyPrinted);
  assert(printedTarget && printedTarget.id === 'wave-1', 'אם אין לא-מודפס — האחרון המודפס');
  assert(waves.pickSessionAddTargetOrder([]) == null, 'בלי הזמנות — null');
}

section('linked companions נשמרים ב-delta');
{
  const orders = [
    {
      id: 'w1',
      order_number: 1,
      printed_at: '2026-10-03T10:00:00.000Z',
      status: 'ready',
      created_at: '2026-10-03T09:00:00.000Z',
      order_items: [
        { id: 'm0', product_id: 'old', product_name: 'ישן', quantity: 1, price: 1 },
      ],
    },
    {
      id: 'w2',
      order_number: 2,
      printed_at: null,
      status: 'submitted',
      created_at: '2026-10-03T11:00:00.000Z',
      order_items: [
        { id: 'm1', product_id: 'hamburger-fries', product_name: 'המבורגר', print_name: 'Burger', quantity: 1, price: 16 },
        { id: 'd1', product_id: 'coke', product_name: 'קולה', print_name: 'Coke', quantity: 1, price: 3, parent_item_id: 'm1' },
      ],
    },
  ];
  const synthetic = waves.buildPrintOrderFromSession({
    tableNumber: 7,
    sessionId: 's',
    orders,
  });
  assert(synthetic.items.length === 2, 'המבורגר + שתייה מקושרת');
  assert(synthetic.items.some((r) => r.linkedToMainItemId === 'm1'), 'קישור parent נשמר');
}

console.log(`\n${failed ? 'FAIL' : 'PASS'} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
