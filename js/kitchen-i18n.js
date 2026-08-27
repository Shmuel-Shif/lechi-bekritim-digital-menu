/**
 * LECHAIM — Kitchen tablet copy (EL default, HE toggle).
 * Admin always uses Hebrew from TYPES / stored product_name / message.
 *
 * Extend DISH_EL or CANNED without changing schema.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'lechaim-kitchen-lang';

  const CANNED = [
    { id: 'help', el: 'Χρειάζομαι βοήθεια', he: 'צריך עזרה' },
    { id: 'problem', el: 'Υπάρχει πρόβλημα', he: 'יש בעיה' },
    { id: 'come', el: 'Έλα Σαμουήλ', he: 'בוא שמואל' },
  ];

  /** Equipment faults. Photo of the fault can be added later. */
  const FAULT_ITEMS = [
    { id: 'fridge', el: 'Ψυγείο', he: 'מקרר', icon: '❄️' },
    { id: 'freezer', el: 'Κατάψυξη', he: 'מקפיא', icon: '🧊' },
    { id: 'oven', el: 'Φούρνος', he: 'תנור', icon: '🔥' },
    { id: 'grill', el: 'Γκριλ', he: 'גריל', icon: '♨️' },
    { id: 'fryer', el: 'Φριτέζα', he: 'טיגון', icon: '🍳' },
    { id: 'ac', el: 'Κλιματιστικό', he: 'מזגן', icon: '💨' },
    { id: 'dishwasher', el: 'Πλυντήριο', he: 'מדיח', icon: '🍽️' },
    { id: 'electric', el: 'Ρεύμα', he: 'חשמל', icon: '⚡' },
    { id: 'water', el: 'Νερό', he: 'מים', icon: '💧' },
    { id: 'other', el: 'Κάτι άλλο', he: 'משהו אחר', icon: '➕' },
  ];

  /** Greek names for kitchen stock list. Missing ids fall back to printName / Hebrew. */
  const DISH_EL = {
    'hatzil-patuach': 'Μελιτζάνα',
    hummus: 'Χούμους',
    'hummus-egg': 'Χούμους με αυγό',
    'hummus-meat': 'Χούμους με κρέας',
    'fries-classic': 'Πατάτες',
    'starter-rice': 'Ρύζι',
    'starter-green-beans': 'Φασολάκια',
    'starter-puree': 'Πουρές',
    bread: 'Ψωμάκια',
    'staik-antarkot': 'Αντρεκότ',
    asado: 'Ασάντο',
    schnitzel: 'Σνίτσελ',
    'chicken-steak': 'Παργκίτ σχάρας',
    'whole-fish': 'Τσιπούρα ολόκληρη',
    'denis-fillet': 'Φιλέτο τσιπούρα',
    salmon: 'Σολομός',
    'hamburger-fries': 'Μπιφτέκι',
    'chicken-salad': 'Σαλάτα κοτόπουλο',
    'israeli-salad': 'Ισραηλινή σαλάτα',
    'market-salad': 'Σαλάτα αγοράς',
    'orange-juice': 'Χυμός πορτοκάλι',
    'fruit-shake': 'Φρουτοχυμός',
    limonana: 'Λεμονάδα δυόσμο',
    coke: 'Coca-Cola',
    'coke-zero': 'Coca-Cola Zero',
    fanta: 'Fanta',
    sprite: 'Sprite',
    'red-bull': 'Red Bull',
    heineken: 'Heineken',
    corona: 'Corona',
    soda: 'Σόδα',
    water: 'Νερό',
    espresso: 'Εσπρέσο',
    hafukh: 'Καπουτσίνο',
    'black-coffee': 'Καφές',
    'mint-tea': 'Τσάι δυόσμο',
    'fruit-plate': 'Φρούτα',
    'fries-side': 'Πατάτες',
    rice: 'Ρύζι',
    'green-beans': 'Φασολάκια',
    puree: 'Πουρές',
  };

  const UI = {
    el: {
      title: 'ΚΟΥΖΙΝΑ',
      groupUrgent: 'ΕΠΕΙΓΟΝ',
      groupOps: 'ΛΕΙΤΟΥΡΓΙΑ',
      groupComms: 'ΕΠΙΚΟΙΝΩΝΙΑ',
      sub: 'Ένα πάτημα → διαχείριση',
      fire: 'ΧΡΕΙΑΖΟΜΑΙ ΦΩΤΙΑ',
      gas: 'ΧΡΕΙΑΖΟΜΑΙ ΓΚΑΖΙ',
      stock: 'ΤΕΛΕΙΩΣΕ ΑΠΟΘΕΜΑ',
      help: 'ΒΟΗΘΕΙΑ',
      problem: 'ΠΡΟΒΛΗΜΑ',
      come: 'ΕΛΑ ΣΑΜΟΥΗΛ',
      fault: 'ΒΛΑΒΗ',
      faultTitle: 'Τι χάλασε;',
      faultOtherTitle: 'Περιγράψτε τη βλάβη',
      faultOtherPlaceholder: 'Τι χάλασε;',
      closeKitchen: 'ΚΛΕΙΣΙΜΟ ΚΟΥΖΙΝΑΣ',
      closeKitchenAsk: 'Να σταλεί αίτημα κλεισίματος κουζίνας;',
      closeKitchenYes: 'Ναι, κλείσιμο',
      closeKitchenNo: 'Άκυρο',
      stockTitle: 'Τι τελείωσε;',
      stockSearch: 'Αναζήτηση',
      stockEmpty: 'Δεν βρέθηκε',
      stockOut: 'εκτός',
      other: 'Άλλο',
      otherTitle: 'Άλλο προϊόν',
      otherPlaceholder: 'Γράψτε τι τελείωσε',
      otherSend: 'Αποστολή',
      msgTitle: 'Γενικά',
      msgPlaceholder: 'Ή γράψτε ελεύθερα',
      send: 'Αποστολή',
      sending: 'Αποστολή…',
      sent: 'Στάλθηκε',
      sentHint: 'Η ειδοποίηση πήγε στη διαχείριση',
      waiting: 'Αναμονή διαχείρισης',
      ack: 'Η ειδοποίηση ελήφθη',
      ackFrom: 'Διαχείριση',
      approved: 'Η διαχείριση ενέκρινε',
      chat: 'Συνομιλία',
      chatPlaceholder: 'Γράψτε μήνυμα',
      chatEmpty: 'Δεν υπάρχουν μηνύματα',
      chatSend: 'Αποστολή',
      fail: 'Αποτυχία αποστολής',
      needText: 'Γράψτε μήνυμα',
      close: 'Κλείσιμο',
      tabTables: 'Τραπέζια',
      tabNews: 'Νέα',
      tabAlerts: 'Κλήσεις',
      tablePrefix: 'Τραπέζι',
      tableFree: 'Ελεύθερο',
      tableActive: 'Ενεργό',
      tableNew: 'Νέα παραγγελία',
      tableFresh: 'ΝΕΟ',
      tableWave: 'ΝΕΟ ΚΥΜΑ',
      dishNew: 'ΝΕΟ',
      tableWaitPrint: 'Εγκρίθηκε, περιμένει bon',
      tableBill: 'Ζήτησε λογαριασμό',
      dishWait: 'Αναμονή',
      dishPrep: 'Σε ετοιμασία',
      dishReady: 'Έτοιμο',
      dishNote: 'Σημείωση',
      customerNote: 'Σημείωση πελάτη',
      startPrep: 'Έναρξη',
      markReady: 'Έτοιμο',
      waitCount: 'σε αναμονή',
      prepCount: 'σε ετοιμασία',
      readyCount: 'έτοιμα',
      newsEmpty: 'Δεν υπάρχουν νέα κύματα προς εκτύπωση',
      dishesEmpty: 'Δεν υπάρχουν πιάτα',
      itemsLabel: 'πιάτα',
      markedReady: 'Σημειώθηκε ως έτοιμο',
      markedPrep: 'Σημειώθηκε σε ετοιμασία',
      boardFail: 'Αποτυχία φόρτωσης τραπεζιών',
      statusFail: 'Αποτυχία ενημέρωσης. Τρέξτε supabase-kitchen-item-status.sql',
      tablesEmpty: 'Δεν υπάρχουν ενεργά τραπέζια',
      allReady: '✅ Έτοιμα όλα',
      allReadyDone: '✅ Όλα έτοιμα',
    },
    he: {
      title: 'מטבח',
      groupUrgent: 'דחוף',
      groupOps: 'תפעול',
      groupComms: 'קשר',
      sub: 'לחיצה אחת נשלחת לניהול',
      fire: 'צריך אש',
      gas: 'צריך גז',
      stock: 'נגמר מלאי',
      help: 'צריך עזרה',
      problem: 'יש בעיה',
      come: 'בוא שמואל',
      fault: 'תקלה',
      faultTitle: 'מה התקלקל?',
      faultOtherTitle: 'תארו את התקלה',
      faultOtherPlaceholder: 'מה התקלקל?',
      closeKitchen: 'סגירת מטבח',
      closeKitchenAsk: 'לשלוח בקשה לסגירת מטבח?',
      closeKitchenYes: 'כן, סגירה',
      closeKitchenNo: 'ביטול',
      stockTitle: 'מה נגמר?',
      stockSearch: 'חיפוש מנה',
      stockEmpty: 'אין מנות מתאימות',
      stockOut: 'לא במלאי',
      other: 'מוצר אחר',
      otherTitle: 'מוצר אחר',
      otherPlaceholder: 'מה נגמר?',
      otherSend: 'שלח',
      msgTitle: 'כללי',
      msgPlaceholder: 'או כתבו חופשי',
      send: 'שלח',
      sending: 'שולח…',
      sent: 'נשלח',
      sentHint: 'ההתראה הגיעה לניהול',
      waiting: 'ממתינים לניהול',
      ack: 'ההתראה התקבלה',
      ackFrom: 'ניהול',
      approved: 'ניהול אישר',
      chat: 'צ׳ט',
      chatPlaceholder: 'כתבו הודעה',
      chatEmpty: 'אין הודעות',
      chatSend: 'שלח',
      fail: 'השליחה נכשלה',
      needText: 'כתבו הודעה',
      close: 'סגור',
      tabTables: 'שולחנות',
      tabNews: 'חדשות',
      tabAlerts: 'קריאות',
      tablePrefix: 'שולחן',
      tableFree: 'פנוי',
      tableActive: 'פעיל',
      tableNew: 'הזמנה חדשה',
      tableFresh: 'חדש',
      tableWave: 'גל חדש',
      dishNew: 'חדש',
      tableWaitPrint: 'אושר, ממתין לבונה',
      tableBill: 'ביקש חשבון',
      dishWait: 'ממתין',
      dishPrep: 'בהכנה',
      dishReady: 'מוכן',
      dishNote: 'הערה',
      customerNote: 'הערת לקוח',
      startPrep: 'התחל הכנה',
      markReady: 'מוכן',
      waitCount: 'ממתינות',
      prepCount: 'בהכנה',
      readyCount: 'מוכנות',
      newsEmpty: 'אין גלים חדשים שמחכים לבונה',
      dishesEmpty: 'אין מנות פעילות',
      itemsLabel: 'פריטים',
      markedReady: 'סומן כמוכן',
      markedPrep: 'סומן בהכנה',
      boardFail: 'טעינת שולחנות נכשלה',
      statusFail: 'עדכון הסטטוס נכשל. הריצו supabase-kitchen-item-status.sql',
      tablesEmpty: 'אין שולחנות פעילים',
      allReady: '✅ הכל מוכן',
      allReadyDone: '✅ הכל מוכן במטבח',
    },
  };

  function normalizeLang(value) {
    return value === 'he' ? 'he' : 'el';
  }

  function getLang() {
    try {
      return normalizeLang(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return 'el';
    }
  }

  function setLang(lang) {
    const next = normalizeLang(lang);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_) { /* ignore */ }
    return next;
  }

  function t(lang, key) {
    const pack = UI[normalizeLang(lang)] || UI.el;
    return pack[key] || UI.el[key] || key;
  }

  function dishEl(id) {
    return DISH_EL[String(id || '')] || '';
  }

  const NOTE_PHRASES = [
    [/בלי בצל(?:ים)?/g, 'χωρίς κρεμμύδι'],
    [/בלי שום/g, 'χωρίς σκόρδο'],
    [/לא חריף|בלי חריף|לא פיקנטי/g, 'όχι πικάντικο'],
    [/חריף|פיקנטי/g, 'πικάντικο'],
    [/בלי מלח/g, 'χωρίς αλάτι'],
    [/מעט מלח/g, 'λίγο αλάτι'],
    [/בלי גלוטן/g, 'χωρίς γλουτένη'],
    [/טבעוני/g, 'vegan'],
    [/צמחוני/g, 'χορτοφαγικό'],
    [/בלי חלב|ללא חלב/g, 'χωρίς γαλακτοκομικά'],
    [/בלי ביצ(?:ה|ות)/g, 'χωρίς αυγό'],
    [/הרוטב בצד|רוטב בצד/g, 'σάλτσα στο πλάι'],
    [/בלי רוטב/g, 'χωρίς σάλτσα'],
    [/בלי ציפס|בלי צ['׳]יפס/g, 'χωρίς πατάτες'],
    [/בלי שמן/g, 'χωρίς λάδι'],
    [/שמן זית/g, 'ελαιόλαδο'],
    [/אלרגי(?:ה|ות)?/g, 'αλλεργία'],
    [/דחוף|מהר בבקשה/g, 'επείγον'],
    [/לחוד|בנפרד/g, 'χωριστά'],
    [/יחד/g, 'μαζί'],
    [/תוספת /g, 'έξτρα '],
    [/מעט |קצת /g, 'λίγο '],
    [/הרבה /g, 'πολύ '],
    [/בצד/g, 'στο πλάι'],
    [/בלי /g, 'χωρίς '],
  ];

  const NOTE_CACHE_KEY = 'lechaim-note-el';
  const noteCache = new Map();

  try {
    const stored = JSON.parse(localStorage.getItem(NOTE_CACHE_KEY) || '{}');
    Object.keys(stored).forEach((key) => noteCache.set(key, stored[key]));
  } catch (_) { /* ignore */ }

  function saveNoteCache() {
    try {
      const obj = {};
      [...noteCache.entries()].slice(-80).forEach(([key, value]) => {
        obj[key] = value;
      });
      localStorage.setItem(NOTE_CACHE_KEY, JSON.stringify(obj));
    } catch (_) { /* ignore */ }
  }

  function hasHebrew(text) {
    return /[\u0590-\u05FF]/.test(String(text || ''));
  }

  function dictionaryToGreek(text) {
    let out = String(text || '').trim();
    NOTE_PHRASES.forEach(([pattern, el]) => {
      out = out.replace(pattern, el);
    });
    return out.trim();
  }

  async function fetchGreek(text) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 2500);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=el&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return '';
      const data = await res.json();
      return (Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [])
        .map((row) => row && row[0])
        .filter(Boolean)
        .join('')
        .trim();
    } catch (_) {
      return '';
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function toGreek(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (noteCache.has(raw)) return noteCache.get(raw);
    const dict = dictionaryToGreek(raw);
    if (!hasHebrew(dict)) {
      noteCache.set(raw, dict);
      saveNoteCache();
      return dict;
    }
    const fetched = await fetchGreek(raw);
    const next = fetched || dict || raw;
    noteCache.set(raw, next);
    saveNoteCache();
    return next;
  }

  function canned() {
    return CANNED.slice();
  }

  function faultItems() {
    return FAULT_ITEMS.slice();
  }

  global.LechaimKitchenI18n = {
    STORAGE_KEY,
    CANNED,
    FAULT_ITEMS,
    DISH_EL,
    UI,
    getLang,
    setLang,
    normalizeLang,
    t,
    dishEl,
    toGreek,
    canned,
    faultItems,
  };
})(window);
