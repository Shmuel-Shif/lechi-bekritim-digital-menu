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
      tabDelivery: 'Διανομές',
      tabPickup: 'Πακέτο',
      tabNews: 'Νέα',
      tabAlerts: 'Κλήσεις',
      tablePrefix: 'Τραπέζι',
      pickupPrefix: 'Πακέτο',
      deliveryPrefix: 'Διανομή',
      tableFree: 'Ελεύθερο',
      tableActive: 'Ενεργό',
      tableNew: 'Νέα παραγγελία',
      tableFresh: 'ΝΕΟ',
      tableWave: 'ΝΕΟ ΚΥΜΑ',
      tableLate: '20′ ΑΡΓΕΙ',
      dishNew: 'ΝΕΟ',
      tableWaitPrint: 'Εγκρίθηκε, περιμένει bon',
      tableBill: 'Ζήτησε λογαριασμό',
      dishWait: 'Αναμονή',
      dishPrep: 'Σε ετοιμασία',
      dishReady: 'Έτοιμο',
      dishNote: 'Σημείωση',
      customerNote: 'Σημείωση πελάτη',
      tableUrgent: 'ΕΠΕΙΓΟΝ',
      dishUrgent: 'ΕΠΕΙΓΟΝ',
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
      pickupEmpty: 'Δεν υπάρχουν παραγγελίες πακέτου',
      deliveryEmpty: 'Δεν υπάρχουν διανομές',
      allReady: '✅ Έτοιμα όλα',
      allReadyDone: '✅ Όλα έτοιμα',
      prepTitle: 'Σύνολο για ετοιμασία',
      prepEmpty: 'Δεν υπάρχουν πιάτα προς ετοιμασία',
      prepMains: 'Πιάτα',
      prepSides: 'Συνοδευτικά',
      prepFor: 'για {name}',
      prepTable: 'Τραπέζι {n}',
      progressReady: 'έτοιμο',
      readyOf: '{ready} / {total} Έτοιμα',
      noteNew: 'Νέα σημείωση',
      noteNewMany: '{n} νέες σημειώσεις',
      noteAck: 'Το διάβασα',
      noteOpenTable: 'Άνοιγμα τραπεζιού',
      noteAckFail: 'Αποτυχία επιβεβαίωσης. Τρέξτε supabase-order-item-notes-seen.sql',
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
      tabDelivery: 'משלוחים',
      tabPickup: 'איסוף עצמי',
      tabNews: 'חדשות',
      tabAlerts: 'קריאות',
      tablePrefix: 'שולחן',
      pickupPrefix: 'איסוף',
      deliveryPrefix: 'משלוח',
      tableFree: 'פנוי',
      tableActive: 'פעיל',
      tableNew: 'הזמנה חדשה',
      tableFresh: 'חדש',
      tableWave: 'גל חדש',
      tableLate: 'מעל 20 דק׳',
      dishNew: 'חדש',
      tableWaitPrint: 'אושר, ממתין לבונה',
      tableBill: 'ביקש חשבון',
      dishWait: 'ממתין',
      dishPrep: 'בהכנה',
      dishReady: 'מוכן',
      dishNote: 'הערה',
      customerNote: 'הערת לקוח',
      tableUrgent: 'דחוף',
      dishUrgent: 'דחוף',
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
      pickupEmpty: 'אין הזמנות איסוף עצמי',
      deliveryEmpty: 'אין משלוחים',
      allReady: '✅ הכל מוכן',
      allReadyDone: '✅ הכל מוכן במטבח',
      prepTitle: 'סה״כ להכין עכשיו',
      prepEmpty: 'אין כרגע מנות להכנה',
      prepMains: 'מנות',
      prepSides: 'תוספות',
      prepFor: 'ל{name}',
      prepTable: 'שולחן {n}',
      progressReady: 'מוכן',
      readyOf: '{ready} מתוך {total} מוכן',
      noteNew: 'הערה חדשה',
      noteNewMany: '{n} הערות חדשות',
      noteAck: 'קראתי',
      noteOpenTable: 'פתח שולחן',
      noteAckFail: 'אישור ההערה נכשל. הריצו supabase-order-item-notes-seen.sql',
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
    canned,
    faultItems,
  };
})(window);
