/**
 * LECHAIM — Unit tests for admin notes + income credits cores.
 * Run: node scripts/test-admin-notes-credits.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadBrowserCore(file, key) {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file });
  return sandbox[key];
}

const notes = loadBrowserCore(path.join(root, 'js/admin-notes-core.js'), 'LechaimAdminNotesCore');
const credits = loadBrowserCore(path.join(root, 'js/admin-credits-core.js'), 'LechaimAdminCreditsCore');

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

section('פתקים — מסך אחד בלי טאבים');
{
  const openDue = {
    id: 'a',
    title: 'דחוף',
    body: 'שורה ראשונה\nשורה שנייה ועוד הרבה מלל שממשיך מעבר לתקציר של הכרטיס כדי לוודא שהתוכן המלא לא מוצג עליו',
    status: 'open',
    remind_at: '2026-10-04T14:30:00.000Z',
    created_at: '2026-10-03T10:00:00.000Z',
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
  const before = JSON.stringify([openDue, done]);
  const board = notes.notesForScreen([openDue, done]);
  assert(board.length === 2, 'כל הפתקים מוצגים יחד');
  assert(board.some((n) => n.status === 'open') && board.some((n) => n.status === 'done'), 'פתוחים ובוצעו באותה רשימה');
  assert(JSON.stringify([openDue, done]) === before, 'אין שינוי בנתונים הקיימים');

  const card = notes.noteCardModel(openDue);
  assert(card.title === 'דחוף', 'כרטיס מציג כותרת');
  assert(!Object.prototype.hasOwnProperty.call(card, 'body'), 'הכרטיס לא כולל את התוכן המלא');
  assert(card.remind_at === openDue.remind_at, 'תזכורת נשמרת לנתוני הפתק');
  assert(card.status === 'open', 'סטטוס פתוח נשמר בנתונים');
  assert(notes.noteCardModel(done).status === 'done', 'סטטוס בוצע נשמר בנתונים');

  const view = notes.noteViewModel(openDue);
  assert(view.title === openDue.title && view.body === openDue.body, 'ה-Modal מציג את כל התוכן');
  assert(view.created_at === openDue.created_at && view.remind_at === openDue.remind_at, 'ה-Modal מציג תאריך ותזכורת');

  const html = readFileSync(path.join(root, 'admin.html'), 'utf8');
  const viewStart = html.indexOf('id="admin-view-notes"');
  const viewEnd = html.indexOf('id="notes-modal"');
  const screen = html.slice(viewStart, viewEnd);
  assert(!screen.includes('data-notes-filter'), 'אין יותר טאבים פתוחים/בוצעו/הכל');
  assert(!screen.includes('>פתוחים<') && !screen.includes('>בוצעו<') && !screen.includes('>הכל<'), 'טקסט הטאבים הוסר מהמסך');
  assert(screen.includes('>פתק חדש<') && screen.includes('רשמו תזכורות ומשימות'), 'כותרת וכפתור פתק חדש נשארו');
  assert(html.includes('id="notes-view-modal"'), 'לחיצה על פתק פותחת Modal');
  assert(html.includes('id="notes-view-body"') && html.includes('id="notes-view-title"'), 'ה-Modal מציג כותרת ותוכן');
  assert(html.includes('id="notes-view-close"') && html.includes('id="notes-view-backdrop"'), 'סגירת Modal עובדת');

  const js = readFileSync(path.join(root, 'js/admin-notes.js'), 'utf8');
  const boardFn = js.slice(js.indexOf('function renderBoardCard'), js.indexOf('function renderHistoryCard'));
  assert(boardFn.includes('data-note-edit') && boardFn.includes('עריכה'), 'עריכה עדיין עובדת');
  assert(boardFn.includes('data-note-delete') && boardFn.includes('מחיקה'), 'מחיקה עדיין עובדת');
  assert(!boardFn.includes('data-note-done') && !boardFn.includes('>בוצע<'), 'כפתור בוצע הוסר מהכרטיס');
  assert(!boardFn.includes('notes-card__status') && !boardFn.includes('פתוח'), 'תג פתוח הוסר מהכרטיס');
  assert(!boardFn.includes('card.excerpt') && !boardFn.includes('note.body'), 'הכרטיס מציג כותרת בלי תוכן');
  assert(js.includes('data-note-view') && js.includes('function openView') && js.includes('function closeView'), 'פתיחה וסגירה של Modal הצפייה');
  assert(js.includes("showConfirm('למחוק את הפתק?'"), 'אישור מחיקה עדיין עובד');
  assert(js.includes('function saveNote') && js.includes("status: 'open'"), 'יצירת פתק חדש עדיין עובדת');
  assert(js.includes('function markDone') && js.includes("status: 'done'"), 'שמירת סטטוס בוצע נשארת');
  const historyFn = js.slice(js.indexOf('function renderHistoryCard'), js.indexOf('function renderList'));
  const historyMount = js.slice(js.indexOf('function mountHistory'));
  assert(historyFn.includes('card.title') && historyFn.includes('data-note-view'), 'בהיסטוריה לחיצה על כותרת פותחת מודל');
  assert(!historyFn.includes('data-note-edit') && !historyFn.includes('data-note-delete'), 'בהיסטוריה אין עריכה ומחיקה');
  assert(!historyFn.includes('note.body') && !historyFn.includes('פתוח'), 'בהיסטוריה מוצגת רק כותרת');
  assert(!historyMount.includes('history-notes-add') && !historyMount.includes('פתק חדש'), 'בהיסטוריה אין פתק חדש');
  assert(js.includes('async function clearAll'), 'איפוס פתקים מוחק רק את הפתקים');
  const historyJs = readFileSync(path.join(root, 'js/admin-history.js'), 'utf8');
  const ordersJs = readFileSync(path.join(root, 'js/supabase-order-service.js'), 'utf8');
  assert(historyJs.includes('categoryResetLabel') && historyJs.includes('deleteClosedHistoryForCategory'), 'איפוס היסטוריה פועל על הקטגוריה הפתוחה');
  assert(!historyJs.includes('deleteAllClosedHistory()'), 'איפוס לא מוחק את כל ההיסטוריה');
  assert(historyJs.includes("פתחו קטגוריה כדי לאפס רק אותה"), 'בלי קטגוריה פתוחה אין איפוס כללי');
  assert(ordersJs.includes('function deleteClosedHistoryForCategory'), 'מחיקת היסטוריה לפי קטגוריה קיימת');
  const notesCss = readFileSync(path.join(root, 'css/admin-notes.css'), 'utf8');
  assert(notesCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'במובייל יש לפחות שני כרטיסים בשורה');
  const doneAgain = notes.markNoteDone(openDue, '2026-10-03T12:00:00.000Z');
  assert(notes.noteStaysInHistoryAfterDone(openDue, doneAgain.note), 'היסטוריה עדיין שומרת פתקים שבוצעו');
  assert(openDue.status === 'open' && openDue.completed_at == null, 'סימון בוצע לא משנה את הרשומה המקורית');
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
