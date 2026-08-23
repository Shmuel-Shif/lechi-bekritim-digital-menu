/**
 * LECHAIM — Warehouse / raw-goods catalog (admin only).
 * Isolated from MENU_DATA and the dishes `inventory` table.
 *
 * Stage 1: names + categories only.
 * Later slots on each item: qty, unit, minQty (alerts / +/- come in UI).
 */
(function (global) {
  'use strict';

  const STOCK_CATALOG = {
    categories: [
      {
        id: 'stock-fish',
        emoji: '🐟',
        title: 'דגים',
        items: [
          { id: 'stock-salmon', name: 'סלמון' },
          { id: 'stock-denis-fillet', name: 'פילה דניס' },
          { id: 'stock-denis-whole', name: 'דניס שלם' },
        ],
      },
      {
        id: 'stock-meats',
        emoji: '🥩',
        title: 'בשרים',
        items: [
          { id: 'stock-ground-beef', name: 'בשר טחון' },
          { id: 'stock-pargiot', name: 'פרגיות' },
          { id: 'stock-chicken-breast', name: 'חזה עוף' },
          { id: 'stock-entrecote', name: 'סטייק אנטריקוט' },
          { id: 'stock-asado', name: 'אסאדו' },
        ],
      },
      {
        id: 'stock-drinks',
        emoji: '🥤',
        title: 'שתייה',
        items: [
          { id: 'stock-red-bull', name: 'רד בול' },
          { id: 'stock-coke', name: 'קוקה קולה' },
          { id: 'stock-coke-zero', name: 'קוקה קולה זירו' },
          { id: 'stock-sprite', name: 'ספרייט' },
          { id: 'stock-fanta', name: 'פאנטה' },
          { id: 'stock-corona', name: 'בירה קורונה' },
          { id: 'stock-heineken', name: 'בירה היינקן' },
          { id: 'stock-soda', name: 'סודה' },
          { id: 'stock-water', name: 'מים' },
          { id: 'stock-water-liter', name: 'מים ליטר גדול' },
        ],
      },
      {
        id: 'stock-bread',
        emoji: '🍞',
        title: 'לחם',
        items: [
          { id: 'stock-burger-bun', name: 'לחמניות המבורגר' },
          { id: 'stock-challah', name: 'חלות' },
        ],
      },
      {
        id: 'stock-grocery',
        emoji: '🛒',
        title: 'מוצרי מכולת, תבלינים ורטבים',
        items: [
          { id: 'stock-chickpeas', name: 'גרגירי חומוס' },
          { id: 'stock-ketchup', name: 'קטשופ' },
          { id: 'stock-mayo', name: 'מיונז' },
          { id: 'stock-wheat', name: 'חיטה' },
          { id: 'stock-beans', name: 'שעועית' },
          { id: 'stock-turmeric', name: 'כורכום' },
          { id: 'stock-cumin', name: 'כמון' },
          { id: 'stock-paprika', name: 'פפריקה' },
          { id: 'stock-black-pepper', name: 'פלפל שחור' },
          { id: 'stock-sugar', name: 'סוכר' },
          { id: 'stock-salt', name: 'מלח' },
          { id: 'stock-silan', name: 'סילאן' },
          { id: 'stock-tomato-paste', name: 'רסק עגבניות' },
          { id: 'stock-tahini', name: 'טחינה' },
          { id: 'stock-frozen-beans', name: 'שעועית קפואה' },
          { id: 'stock-canola-oil', name: 'שמן קנולה' },
          { id: 'stock-olive-oil', name: 'שמן זית כתית מעולה' },
          { id: 'stock-flour', name: 'קמח' },
          { id: 'stock-chili-flakes', name: 'צ\'ילי גרוס' },
          { id: 'stock-spice-mix', name: 'תבלין' },
          { id: 'stock-basmati', name: 'אורז בסמטי' },
          { id: 'stock-lemon-juice', name: 'מיץ לימון' },
          { id: 'stock-sesame', name: 'שומשום' },
        ],
      },
      {
        id: 'stock-produce',
        emoji: '🥬🍎',
        title: 'ירקות ופירות',
        groups: [
          {
            id: 'stock-produce-veg',
            title: 'ירקות',
            items: [
              { id: 'stock-potato', name: 'תפוחי אדמה' },
              { id: 'stock-sweet-potato', name: 'בטטה' },
              { id: 'stock-tomato', name: 'עגבניות' },
              { id: 'stock-cherry-tomato', name: 'עגבניות שרי' },
              { id: 'stock-date-tomato', name: 'עגבניות תמר' },
              { id: 'stock-mini-cucumber', name: 'מלפפונים קטנים' },
              { id: 'stock-pepper-red', name: 'פלפל אדום' },
              { id: 'stock-pepper-orange', name: 'פלפל כתום' },
              { id: 'stock-pepper-yellow', name: 'פלפל צהוב' },
              { id: 'stock-pepper-hot', name: 'פלפל חריף' },
              { id: 'stock-lettuce-green', name: 'חסה ירוקה' },
              { id: 'stock-eggplant', name: 'חצילים' },
              { id: 'stock-zucchini', name: 'קישואים' },
              { id: 'stock-carrot', name: 'גזר' },
              { id: 'stock-beet', name: 'סלק' },
              { id: 'stock-onion-white', name: 'בצל לבן' },
              { id: 'stock-onion-red', name: 'בצל סגול' },
              { id: 'stock-cabbage-white', name: 'כרוב לבן' },
              { id: 'stock-cabbage-red', name: 'כרוב סגול' },
              { id: 'stock-scallion', name: 'בצל ירוק' },
              { id: 'stock-mushroom', name: 'פטריות' },
            ],
          },
          {
            id: 'stock-produce-herbs',
            title: 'עשבי תיבול',
            items: [
              { id: 'stock-mint', name: 'נענע' },
              { id: 'stock-basil', name: 'בזיליקום' },
              { id: 'stock-cilantro', name: 'כוסברה' },
              { id: 'stock-parsley', name: 'פטרוזיליה' },
            ],
          },
          {
            id: 'stock-produce-fruit',
            title: 'פירות',
            items: [
              { id: 'stock-strawberry', name: 'תותים' },
              { id: 'stock-green-grape', name: 'ענבים ירוקים' },
              { id: 'stock-nectarine', name: 'נקטרינות' },
              { id: 'stock-apple', name: 'תפוחים' },
              { id: 'stock-kiwi', name: 'קיווי' },
              { id: 'stock-orange', name: 'תפוזים' },
              { id: 'stock-banana', name: 'בננות' },
              { id: 'stock-pineapple', name: 'אננס' },
              { id: 'stock-lemon', name: 'לימונים' },
              { id: 'stock-peach', name: 'אפרסקים' },
            ],
          },
        ],
      },
    ],
  };

  function expandItem(item) {
    return {
      id: item.id,
      name: item.name,
      qty: item.qty == null ? null : item.qty,
      unit: item.unit || null,
      minQty: item.minQty == null ? null : item.minQty,
    };
  }

  function getCatalog() {
    return STOCK_CATALOG.categories.map((cat) => {
      const groups = (cat.groups || []).map((group) => ({
        id: group.id,
        title: group.title,
        items: (group.items || []).map(expandItem),
      }));
      const items = groups.length
        ? groups.flatMap((group) => group.items)
        : (cat.items || []).map(expandItem);
      return {
        id: cat.id,
        emoji: cat.emoji,
        title: cat.title,
        groups,
        items,
      };
    });
  }

  global.LechaimStockCatalog = {
    getCatalog,
  };
})(window);
