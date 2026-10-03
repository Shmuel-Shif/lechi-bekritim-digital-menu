/**
 * LECHAIM — Unit tests for admin notes + income credits cores.
 * Run: node scripts/test-admin-notes-credits.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const notes = require(path.join(root, 'js/admin-notes-core.js'));
const credits = require(path.join(root, 'js/admin-credits-core.js'));

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

section('פתקים — יצירה / עריכה / מחיקה / בוצע');
{
  const created = notes.createNoteRecord({
    id: 'n1',
    title: 'להזמין ירקות',
    body: 'עגבניות ומלפפונים',
  }, '2026-10-03T10:00:00.000Z');
  assert(created.ok, 'יצירת פתק');
  assert(created.note.title === 'להזמין ירקות', 'כותרת נשמרת');
  assert(created.note.body === 'עגבניות ומלפפונים', 'תוכן נשמר');
  assert(created.note.status === 'open', 'סטטוס פתוח ביצירה');
  assert(created.note.remind_at == null, 'פתק ללא תזכורת');

  const withRemind = notes.createNoteRecord({
    id: 'n2',
    title: 'שיחה לספק',
    body: 'לבדוק מחיר',
    remind_at: '2026-10-04T14:00:00.000Z',
  }, '2026-10-03T10:00:00.000Z');
  assert(withRemind.ok && withRemind.note.remind_at === '2026-10-04T14:00:00.000Z', 'פתק עם תזכורת');

  const edited = notes.applyNoteEdit(created.note, {
    title: 'להזמין ירקות ועשבי תיבול',
    body: 'עוד בזיליקום',
    remind_at: '2026-10-05T09:00:00.000Z',
  }, '2026-10-03T11:00:00.000Z');
  assert(edited.ok && edited.note.title.includes('עשבי'), 'עריכת פתק');

  const done = notes.markNoteDone(edited.note, '2026-10-03T12:00:00.000Z');
  assert(done.ok && done.note.status === 'done', 'סימון פתק כבוצע');
  assert(done.note.completed_at === '2026-10-03T12:00:00.000Z', 'תאריך ביצוע נשמר');
  assert(
    notes.noteStaysInHistoryAfterDone(edited.note, done.note),
    'פתק שבוצע נשאר בהיסטוריה'
  );

  const other = notes.createNoteRecord({
    id: 'n3',
    title: 'פתק אחר',
    body: 'נשאר',
  }, '2026-10-03T10:00:00.000Z').note;
  const afterDelete = [created.note, other].filter((row) => row.id !== 'n1');
  assert(afterDelete.length === 1 && afterDelete[0].id === 'n3', 'מחיקת פתק מהרשימה');
}

section('פתקים — תזכורת וסינון');
{
  const openDue = {
    id: 'a',
    title: 'דחוף',
    body: 'עכשיו',
    status: 'open',
    remind_at: '2026-10-01T08:00:00.000Z',
    created_at: '2026-09-30T08:00:00.000Z',
    completed_at: null,
  };
  const openLater = {
    id: 'b',
    title: 'בהמשך',
    body: 'מחר',
    status: 'open',
    remind_at: '2026-10-10T08:00:00.000Z',
    created_at: '2026-10-02T08:00:00.000Z',
    completed_at: null,
  };
  const done = {
    id: 'c',
    title: 'סיימתי',
    body: 'ok',
    status: 'done',
    remind_at: null,
    created_at: '2026-09-01T08:00:00.000Z',
    completed_at: '2026-09-02T08:00:00.000Z',
  };
  assert(notes.isReminderDue(openDue, '2026-10-03T12:00:00.000Z'), 'תזכורת שהגיעה מודגשת');
  assert(!notes.isReminderDue(openLater, '2026-10-03T12:00:00.000Z'), 'תזכורת עתידית לא due');
  assert(!notes.isReminderDue(done, '2026-10-03T12:00:00.000Z'), 'בוצע לא due');

  const onlyOpen = notes.filterNotes([openDue, openLater, done], 'open');
  assert(onlyOpen.length === 2 && onlyOpen.every((n) => n.status === 'open'), 'סינון פתוחים');
  const onlyDone = notes.filterNotes([openDue, openLater, done], 'done');
  assert(onlyDone.length === 1 && onlyDone[0].id === 'c', 'סינון שבוצעו');
  const all = notes.filterNotes([openDue, openLater, done], 'all');
  assert(all.length === 3, 'הצגת כל הפתקים');
  assert(all[0].id === 'a', 'פתק due מוצג ראשון בין הפתוחים');
}

section('זיכויים — יצירה ושדות');
{
  const cash = credits.buildCreditDocument({
    document_date: '2026-10-03',
    amount: 300,
    description: 'החזר ספק',
    method: 'cash',
  }, 'user-1');
  assert(cash.ok, 'יצירת זיכוי');
  assert(cash.row.document_date === '2026-10-03', 'שמירת תאריך');
  assert(cash.row.amount_total === 300, 'שמירת סכום');
  assert(cash.row.notes === 'החזר ספק', 'שמירת תיאור');
  assert(cash.row.category === 'cash', 'זיכוי במזומן');
  assert(cash.row.document_type === 'income_credit', 'סוג מסמך זיכוי');
  assert(cash.row.supplier_name === 'זיכויים', 'תיקיית זיכויים');
  assert(cash.row.storage_path == null, 'זיכוי בלי קובץ');

  const withFile = credits.buildCreditDocument({
    document_date: '2026-10-03',
    amount: 80,
    description: 'זיכוי עם צילום',
    method: 'credit',
    storage_path: '2026/10/abc/photo.jpg',
    original_filename: 'photo.jpg',
    mime_type: 'image/jpeg',
    file_size_bytes: 12345,
  }, 'user-1');
  assert(withFile.ok, 'יצירת זיכוי עם קובץ');
  assert(withFile.row.storage_path === '2026/10/abc/photo.jpg', 'נתיב קובץ בזיכוי');
  assert(withFile.row.original_filename === 'photo.jpg', 'שם קובץ בזיכוי');
  assert(withFile.row.mime_type === 'image/jpeg', 'סוג קובץ בזיכוי');

  const card = credits.validateCreditInput({
    date: '2026-10-03',
    amount: 500,
    description: 'זיכוי אשראי',
    method: 'credit',
  });
  assert(card.ok && card.credit.category === 'credit', 'זיכוי באשראי');

  const bank = credits.validateCreditInput({
    date: '2026-10-03',
    amount: 120,
    description: 'העברה',
    method: 'bank',
  });
  assert(bank.ok && bank.credit.category === 'bank', 'זיכוי בחשבון בנק');
  assert(credits.payMethodLabel('bank') === 'חשבון בנק', 'תווית חשבון בנק');
}

section('זיכויים — מסמכים ודוחות');
{
  const rows = [
    {
      supplier_name: 'זיכויים',
      document_type: 'income_credit',
      category: 'cash',
      amount_total: 300,
      document_date: '2026-10-03',
      notes: 'מזומן',
      status: 'saved',
    },
    {
      supplier_name: 'זיכויים',
      document_type: 'income_credit',
      category: 'credit',
      amount_total: 500,
      document_date: '2026-10-03',
      notes: 'אשראי',
      status: 'saved',
    },
    {
      supplier_name: 'זיכויים',
      document_type: 'income_credit',
      category: 'bank',
      amount_total: 100,
      document_date: '2026-10-03',
      notes: 'בנק',
      status: 'saved',
    },
    {
      supplier_name: 'ירקות',
      document_type: 'manual_payment',
      category: 'cash',
      amount_total: 80,
      status: 'saved',
    },
  ];
  const meta = credits.creditDisplayMeta(rows[1]);
  assert(meta && meta.kindLabel === 'זיכוי' && meta.paymentMethod === 'credit', 'הצגת הזיכוי במסמכים');
  assert(meta.amount === 500 && meta.description === 'אשראי', 'סכום ותיאור בזיכוי');

  const byMethod = credits.sumCreditsByMethod(rows);
  assert(byMethod.cash === 300, 'זיהוי זיכוי מזומן בדוחות');
  assert(byMethod.credit === 500, 'זיהוי זיכוי אשראי בדוחות');
  assert(byMethod.bank === 100, 'זיהוי זיכוי חשבון בנק בדוחות');
  assert(byMethod.total === 900, 'סך זיכויים');

  const expenses = credits.excludeCreditsFromExpenses(rows);
  assert(expenses.length === 1 && expenses[0].supplier_name === 'ירקות', 'זיכויים לא נספרים כהוצאה');

  const report = credits.reportIncomeWithCredits(
    { cash: 1000, credit: 2000, total: 3000 },
    rows
  );
  assert(report.sales === 3000, 'מכירות קיימות לא משתנות');
  assert(report.credits.credit === 500, 'זיכוי אשראי מזוהה בדוח');
  assert(report.incomeTotal === 3900, 'הכנסה כוללת מכירות + זיכויים');
  assert(report.incomeBank === 100, 'הכנסת בנק מגיעה מזיכויים בלבד');
}

section('רגרסיה — לוגיקות בסיס');
{
  assert(notes.validateNoteInput({ title: '', body: 'x' }).ok === false, 'פתק בלי כותרת נדחה');
  assert(credits.validateCreditInput({ date: '2026-10-03', amount: 10, description: '', method: 'cash' }).ok === false, 'זיכוי בלי תיאור נדחה');
  assert(credits.isCreditDocument({ document_type: 'manual_payment', supplier_name: 'תשלום ללא קבלה' }) === false, 'תשלום רגיל לא מסומן כזיכוי');
  assert(notes.filterNotes([], 'all').length === 0, 'היסטוריית פתקים ריקה תקינה');
}

console.log(`\nסיכום: ${passed} עברו, ${failed} נכשלו`);
if (failed > 0) process.exit(1);
console.log('כל הבדיקות עברו בהצלחה');
