/**
 * Menu data — לחיים בכריתים
 */
const TRANSLATIONS = {
  he: {
    restaurantName: 'לחיים בכריתים',
    pageTitle: 'מסעדת לחיים | מסעדה כשרה למהדרין בכרתים',
    pageDescription: 'תפריט דיגיטלי — לחיים בכריתים, כרתים.',
    bh: 'ב״ה',
    myCart: 'הסל שלי',
    viewMenu: 'לצפייה בתפריט',
    heroTitle: 'מסעדת לחיים בכרתים',
    heroKosher: 'כשר למהדרין',
    heroTagline: 'דגים. שניצלים. פרגיות. קבב. סלטים ועוד..',
    skipToMenu: 'דלג לתפריט',
    myOrder: 'ההזמנה שלי',
    cartEmpty: 'הסל ריק הוסיפו מנות מהתפריט',
    total: 'סה״כ',
    clearCart: 'רוקן סל',
    addToCart: 'הוסף לסל',
    addedToCart: '{name} נוסף לסל',
    decrease: 'הפחת כמות',
    increase: 'הוסף כמות',
    close: 'סגור',
    openCart: 'פתח סל הזמנה',
    openMenu: 'פתח תפריט',
    showDish: 'הצג פרטים על {name}',
    perUnit: '{price} ליחידה',
    currency: '€',
    langToggleAria: 'החלפת שפה – עברית / English',
    mainsNote: 'כל המנות העיקריות מוגשות עם תוספת אחת חמה (למעט שיפודי קבב ומוקפץ עוף).',
    mainsSidesTitle: 'תוספות לבחירה',
    mainsSidesList: "צ'יפס פריך | אורז לבן | שעועית ירוקה מוקפצת | פירה | ירקות בתנור",
    sideForMain: 'תוספת ל־{name}',
    servedWith: 'מוגש עם: {sides}',
    maxSidesPerMain: 'ניתן לבחור תוספת חמה אחת לכל מנה עיקרית',
    chooseMainFirst: 'יש לבחור מנה עיקרית לפני תוספת חמה',
    chooseSidesTitle: 'בחרו תוספת חמה',
    chooseSidesSubtitle: 'תוספת אחת למנה: {name}',
    sidesSelected: '{count} מתוך 1 נבחרו',
    sidesContinue: 'המשך',
    sideLabel: 'תוספת',
    contact: 'יצירת קשר',
    hours: 'שעות פעילות',
    hoursDays: 'א׳ – ה׳',
    address: 'כתובת',
    addressText: 'Analipsi 700 14, Greece',
    copyright: 'כל הזכויות שמורות',
    footerTagline: 'The Pearl of Crete',
    followUs: 'עקבו אחרינו',
    categories: {
      starters: 'ראשונות ונשנושים',
      mains: 'מנות עיקריות',
      hotSides: 'תוספות חמות לבחירה',
      salads: 'סלטים',
      desserts: 'קינוחים',
      coldDrinks: 'שתייה קלה',
      hotDrinks: 'שתייה חמה',
    },
  },
  en: {
    restaurantName: 'LeChaim in Keri',
    pageTitle: 'Lechaim Restaurant | Mehadrin Kosher Restaurant in Crete',
    pageDescription: 'Digital menu — LeChaim in Keri, Crete.',
    bh: 'B"H',
    myCart: 'My Cart',
    viewMenu: 'View Menu',
    heroTitle: 'Lechaim Restaurant in Crete',
    heroKosher: 'Mehadrin Kosher',
    heroTagline: 'Fish. Schnitzel. Chicken. Kebab. Salads and more..',
    skipToMenu: 'Skip to menu',
    myOrder: 'My Order',
    cartEmpty: 'Your cart is empty — add dishes from the menu',
    total: 'Total',
    clearCart: 'Clear cart',
    addToCart: 'Add to cart',
    addedToCart: '{name} added to cart',
    decrease: 'Decrease quantity',
    increase: 'Increase quantity',
    close: 'Close',
    openCart: 'Open order cart',
    openMenu: 'Open menu',
    showDish: 'View details for {name}',
    perUnit: '{price} each',
    currency: '€',
    langToggleAria: 'Switch language – Hebrew / English',
    mainsNote: 'All main courses are served with one hot side (except kebab skewers and stir-fried chicken).',
    mainsSidesTitle: 'Sides to choose from',
    mainsSidesList: 'Crispy fries | White rice | Sautéed green beans | Mashed potatoes | Oven vegetables',
    sideForMain: 'Side for {name}',
    servedWith: 'Served with: {sides}',
    maxSidesPerMain: 'One hot side per main course',
    chooseMainFirst: 'Choose a main course before adding a hot side',
    chooseSidesTitle: 'Choose a hot side',
    chooseSidesSubtitle: 'One side for: {name}',
    sidesSelected: '{count} of 1 selected',
    sidesContinue: 'Continue',
    sideLabel: 'Side',
    contact: 'Contact',
    hours: 'Opening Hours',
    hoursDays: 'Sun – Thu',
    address: 'Address',
    addressText: 'Analipsi 700 14, Greece',
    copyright: 'All rights reserved',
    footerTagline: 'The Pearl of Crete',
    followUs: 'Follow us',
    categories: {
      starters: 'Starters & Snacks',
      mains: 'Main Courses',
      hotSides: 'Hot Sides',
      salads: 'Salads',
      desserts: 'Desserts',
      coldDrinks: 'Soft Drinks',
      hotDrinks: 'Hot Drinks',
    },
  },
};

const DISH_I18N = {
  en: {
    'salad-plate': {
      name: 'Opening Salad Platter',
      desc: 'Selection of refreshing house salads with warm pitas (recommended for the table center).',
    },
    hummus: {
      name: 'House Hummus',
      desc: 'Creamy handmade hummus, served with olive oil, cumin and pitas.',
    },
    'hummus-egg': {
      name: 'Hummus with Egg',
      desc: 'Creamy handmade hummus, served with olive oil, cumin and pitas, topped with egg.',
    },
    'hummus-meat': {
      name: 'Hummus with Meat',
      desc: 'Creamy handmade hummus, served with olive oil, cumin and pitas, topped with meat.',
    },
    mushrooms: {
      name: 'Hot Mushrooms',
      desc: 'Fresh mushrooms sautéed in garlic, olive oil and parsley.',
    },
    'fries-classic': {
      name: 'Classic Fries',
      desc: 'Crispy potato fries.',
    },
    schnitzel: {
      name: "Chef's Schnitzel",
      desc: 'Crispy chicken breast in golden breadcrumb coating.',
    },
    'chicken-steak': {
      name: 'Grilled Chicken Steak',
      desc: 'Juicy chicken cut with Mediterranean seasoning.',
    },
    'whole-fish': {
      name: 'Whole Baked Sea Bream',
      desc: 'Fresh sea bream baked with herbs and olive oil.',
    },
    salmon: {
      name: 'Oven-Baked Salmon',
      desc: 'Salmon fillet with a delicate glaze.',
    },
    kebab: {
      name: 'Kebab Skewers',
      desc: 'Served on a tortilla with tahini and a small side salad.',
    },
    'chicken-stirfry': {
      name: 'Stir-Fried Chicken',
      desc: 'Stir-fried spaghetti with chicken pieces and vegetables in Asian style.',
    },
    'chicken-salad': {
      name: 'Rich Chicken Salad',
      desc: 'Warm chicken on lettuce with seasonal vegetables and vinaigrette.',
    },
    'israeli-salad': {
      name: 'Israeli Salad',
      desc: 'With herbs.',
    },
    'green-salad': {
      name: 'Green Salad',
      desc: 'With vinaigrette.',
    },
    'market-salad': {
      name: 'Market Salad',
      desc: 'Seasonal vegetables.',
    },
    'fruit-plate': {
      name: 'Seasonal Fruit Platter',
      desc: 'Selection of fresh, refreshing cut fruits.',
    },
    'coke-zero': { name: 'Coca-Cola / Coke Zero', desc: '' },
    'fanta-sprite': { name: 'Fanta / Sprite', desc: '' },
    'red-bull': { name: 'Red Bull', desc: '' },
    beer: { name: 'Beer', desc: '' },
    'soda-water': { name: 'Soda / Mineral Water', desc: '' },
    'fruit-shake': {
      name: 'Refreshing Fruit Shake',
      desc: "Water / orange / soda base (ask the waiter about today's fruits).",
    },
    'espresso-hafukh': {
      name: 'Espresso / Hafukh',
      desc: 'Soy milk available.',
    },
    'black-coffee': { name: 'Black Coffee', desc: '' },
    'mint-tea': { name: 'Hot Mint Tea', desc: '' },
    puree: { name: 'Mashed Potatoes', desc: '' },
    rice: { name: 'White Rice', desc: '' },
    'oven-vegetables': { name: 'Oven Vegetables', desc: '' },
    'green-beans': { name: 'Sautéed Green Beans', desc: '' },
    'fries-side': { name: 'Crispy Fries', desc: '' },
  },
};

function dishImage(id) {
  return `assets/images/dishes/${id}.webp`;
}

const MENU_DATA = {
  restaurant: 'לחיים בכריתים',
  categories: [
    {
      id: 'starters',
      titleKey: 'categories.starters',
      items: [
        {
          id: 'salad-plate',
          name: 'פלטת סלטים פתיחה',
          description: 'מבחר סלטי הבית המרעננים לצד פיתות חמות (מומלץ למרכז שולחן).',
          price: 15,
        },
        {
          id: 'hummus',
          name: 'חומוס הבית',
          description: 'חומוס קרמי בעבודת יד, מוגש עם שמן זית, כמון ופיתות.',
          price: 15,
        },
        {
          id: 'hummus-egg',
          name: 'חומוס עם ביצה',
          description: 'חומוס קרמי בעבודת יד, מוגש עם שמן זית, כמון ופיתות בתוספת ביצה.',
          price: 17,
        },
        {
          id: 'hummus-meat',
          name: 'חומוס בשר',
          description: 'חומוס קרמי בעבודת יד, מוגש עם שמן זית, כמון ופיתות בתוספת בשר.',
          price: 19,
        },
        {
          id: 'mushrooms',
          name: 'פטריות חמות',
          description: 'פטריות טריות מוקפצות בשום, שמן זית ופטרוזיליה.',
          price: 10,
        },
        {
          id: 'fries-classic',
          name: "צ'יפס קלאסי",
          description: 'מנת תפוחי אדמה פריכים.',
          price: 10,
        },
      ],
    },
    {
      id: 'mains',
      titleKey: 'categories.mains',
      descriptionKey: 'mainsNote',
      sidesTitleKey: 'mainsSidesTitle',
      sidesListKey: 'mainsSidesList',
      items: [
        {
          id: 'schnitzel',
          name: 'השניצל של השף',
          description: 'חזה עוף פריך בציפוי פירורי לחם מוזהבים.',
          price: 25,
        },
        {
          id: 'chicken-steak',
          name: 'סטייק פרגית בגריל',
          description: 'נתח פרגית עסיסי בתיבול ים־תיכוני.',
          price: 26,
        },
        {
          id: 'whole-fish',
          name: 'דניס שלם בתנור',
          description: 'דניס טרי אפוי עם עשבי תיבול ושמן זית.',
          price: 29,
        },
        {
          id: 'salmon',
          name: 'נתח סלמון בתנור',
          description: 'פילה סלמון בזיגוג עדין.',
          price: 29,
        },
        {
          id: 'kebab',
          name: 'שיפודי קבב',
          description: 'מוגש על טורטייה לצד טחינה וסלטון קטן בצד.',
          price: 27,
        },
        {
          id: 'chicken-stirfry',
          name: 'מוקפץ עוף',
          description: 'ספגטי מוקפצות עם נתחי עוף וירקות בסגנון אסייתי.',
          price: 20,
        },
      ],
    },
    {
      id: 'salads',
      titleKey: 'categories.salads',
      items: [
        {
          id: 'chicken-salad',
          name: 'סלט פרגית עשיר',
          description: 'נתחי פרגית חמים על מצע חסות, ירקות העונה ורוטב ויניגרט.',
          price: 18,
        },
        {
          id: 'israeli-salad',
          name: 'סלט ישראלי',
          description: 'עם עשבי תיבול.',
          price: 10,
        },
        {
          id: 'green-salad',
          name: 'סלט ירוק',
          description: 'עם רוטב ויניגרט.',
          price: 9,
        },
        {
          id: 'market-salad',
          name: 'סלט שוק',
          description: 'ירקות העונה.',
          price: 9,
        },
      ],
    },
    {
      id: 'desserts',
      titleKey: 'categories.desserts',
      items: [
        {
          id: 'fruit-plate',
          name: 'פלטת פירות העונה',
          description: 'מבחר פירות טריים, מרעננים וחתוכים.',
          price: 18,
        },
      ],
    },
    {
      id: 'coldDrinks',
      titleKey: 'categories.coldDrinks',
      items: [
        { id: 'coke-zero', name: 'קוקה קולה / קולה זירו', description: '', price: 3 },
        { id: 'fanta-sprite', name: 'פאנטה / ספרייט', description: '', price: 3 },
        { id: 'red-bull', name: 'רד בול', description: '', price: 3 },
        { id: 'beer', name: 'בירה', description: '', price: 4 },
        { id: 'soda-water', name: 'סודה / מים מינרליים', description: '', price: 3 },
        {
          id: 'fruit-shake',
          name: 'שייק פירות מרענן',
          description: 'על בסיס מים / תפוזים / סודה (שאלו את המלצר על פירות היום).',
          price: 8,
        },
      ],
    },
    {
      id: 'hotDrinks',
      titleKey: 'categories.hotDrinks',
      items: [
        {
          id: 'espresso-hafukh',
          name: 'קפה אספרסו / הפוך',
          description: 'אפשרות לחלב סויה.',
          price: 5,
        },
        { id: 'black-coffee', name: 'קפה שחור', description: '', price: 5 },
        { id: 'mint-tea', name: 'תה חם עם נענע', description: '', price: 5 },
      ],
    },
  ],
};

const HOT_SIDE_ITEMS = [
  { id: 'fries-side', name: "צ'יפס פריך", description: '', price: 0 },
  { id: 'rice', name: 'אורז לבן', description: '', price: 0 },
  { id: 'green-beans', name: 'שעועית ירוקה מוקפצת', description: '', price: 0 },
  { id: 'puree', name: 'פירה', description: '', price: 0 },
  { id: 'oven-vegetables', name: 'ירקות בתנור', description: '', price: 0 },
];

const MAIN_COURSE_IDS = new Set(['schnitzel', 'chicken-steak', 'whole-fish', 'salmon']);
const HOT_SIDE_IDS = new Set(['fries-side', 'rice', 'green-beans', 'puree', 'oven-vegetables']);
const MAX_SIDES_PER_MAIN = 1;

const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
};
