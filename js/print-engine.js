/**
 * LECHAIM — Print Engine (Stage 4 + 6.6)
 * Text tickets → Local Print Service (http://127.0.0.1:3001/print).
 * No direct TCP to printers. Order Engine / Admin unchanged.
 *
 * Swap `setSendTicket(fn)` to override transport without changing callers.
 */
(function (global) {
  'use strict';

  const LINE = '========================';
  const DIV = '------------------------';
  const PRINT_SERVICE_URL = 'http://127.0.0.1:3001/print';

  /* ESC/POS — ticket layout only (does not change order / queue logic) */
  const ESC = '\x1B';
  const GS = '\x1D';
  const POS = {
    fontA: `${ESC}M\x00`,
    fontB: `${ESC}M\x01`,
    sizeNormal: `${GS}!\x00`,
    /* ~2x width + height */
    size2x: `${GS}!\x11`,
    boldOn: `${ESC}E\x01`,
    boldOff: `${ESC}E\x00`,
  };

  /**
   * Default transport: POST to local print service.
   * Returns true only when the service responds with { success: true }.
   */
  let sendTicketImpl = async function sendTicketToLocalService(ticket, channel) {
    const printer = channel === 'bar' ? 'bar' : 'kitchen';

    let response;
    try {
      response = await fetch(PRINT_SERVICE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printer,
          ticket: String(ticket),
        }),
      });
    } catch (err) {
      console.error(
        '[LechaimPrintEngine] Print service unavailable',
        PRINT_SERVICE_URL,
        channel,
        err
      );
      return false;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      console.error(
        '[LechaimPrintEngine] Invalid response from print service',
        channel,
        response.status,
        err
      );
      return false;
    }

    if (!response.ok || data?.success !== true) {
      console.error(
        '[LechaimPrintEngine] Print request failed',
        channel,
        response.status,
        data
      );
      return false;
    }

    return true;
  };

  async function sendTicket(ticket, channel) {
    try {
      return (await sendTicketImpl(ticket, channel)) === true;
    } catch (err) {
      console.error('[LechaimPrintEngine] sendTicket failed', channel, err);
      return false;
    }
  }

  function setSendTicket(fn) {
    if (typeof fn !== 'function') {
      throw new Error('LechaimPrintEngine.setSendTicket expects a function');
    }
    sendTicketImpl = fn;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateTime(value) {
    const d = value ? new Date(value) : new Date();
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    return `${pad2(safe.getHours())}:${pad2(safe.getMinutes())}`;
  }

  function formatOrderNumber(order) {
    const raw = String(order?.orderId || '');
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
    if (raw) return raw.slice(-6).toUpperCase();
    return '0000';
  }

  function formatTableLine(order) {
    const classified = global.LechaimOrderTypes?.classifyOrderType?.(
      order?.orderType || order?.order_type,
      'print-engine.formatTableLine'
    );
    switch (classified) {
      case 'takeaway': {
        const isDelivery = String(order.fulfillmentType || order.fulfillment_type || '') === 'delivery'
          || Boolean(String(order.customerAddress || order.customer_address || '').trim());
        const no = order.publicOrderNo || order.public_order_no;
        const prefix = isDelivery ? 'DELIVERY' : 'TAKEAWAY';
        if (no != null && Number(no) > 0) return `${prefix} #${Number(no)}`;
        return prefix;
      }
      case 'butcher':
        return 'BUTCHER SHOP';
      case 'shabbat': {
        const no = order.publicOrderNo || order.public_order_no;
        if (no != null && Number(no) > 0) return `SHABBAT #${Number(no)}`;
        return 'SHABBAT';
      }
      case 'dine_in':
        if (order?.tableNumber != null && order.tableNumber !== '') {
          return `TABLE ${order.tableNumber}`;
        }
        return 'TABLE —';
      default:
        if (order?.tableNumber != null && order.tableNumber !== '') {
          return `TABLE ${order.tableNumber}`;
        }
        return 'TABLE —';
    }
  }

  function formatPickupLabel(order) {
    if (!order) return 'ASAP';
    const type = String(order.pickupType || order.pickup_type || '').toUpperCase();
    const time = order.pickupTime || order.pickup_time || null;
    const date = order.pickupDate || order.pickup_date || null;
    if (type === 'TIME' && time) {
      if (date) {
        const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const dateLabel = m ? `${m[3]}/${m[2]}/${m[1]}` : String(date);
        return `${dateLabel} ${time}`;
      }
      return String(time);
    }
    return 'ASAP';
  }

  function buildSelfPickupBlock(order) {
    const classified = global.LechaimOrderTypes?.classifyOrderType?.(
      order?.orderType || order?.order_type,
      'print-engine.selfPickup'
    );
    if (classified !== 'takeaway' && classified !== 'shabbat' && classified !== 'butcher') return [];

    const name = order.customerName || order.customer_name || '—';
    const phone = order.customerPhone || order.customer_phone || '—';
    const pickup = formatPickupLabel(order);

    const lines = [];
    if (classified === 'shabbat') {
      /* Number is already on the SHABBAT # line (large), same as TAKEAWAY. */
    } else if (classified === 'butcher') {
      const type = String(order.pickupType || order.pickup_type || '').toUpperCase();
      const time = order.pickupTime || order.pickup_time || null;
      const date = order.pickupDate || order.pickup_date || null;
      const address = String(order.customerAddress || order.customer_address || '').trim();
      const isDelivery = String(order.fulfillmentType || order.fulfillment_type || '') === 'delivery'
        || Boolean(address);
      const fee = Number(order.deliveryFee ?? order.delivery_fee);
      lines.push(
        'BUTCHER SHOP',
        `Customer: ${name}`,
        `Phone: ${phone}`,
        `Type: ${isDelivery ? 'Delivery' : 'Pickup'}`,
      );
      if (isDelivery && address) lines.push(`Address: ${address}`);
      if (isDelivery && Number.isFinite(fee)) lines.push(`Delivery fee: EUR ${fee.toFixed(2)}`);
      if (type === 'TIME' && (date || time)) {
        if (date) {
          const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
          lines.push(`${isDelivery ? 'Delivery' : 'Pickup'} date: ${m ? `${m[3]}/${m[2]}/${m[1]}` : date}`);
        }
        if (time) lines.push(`${isDelivery ? 'Delivery' : 'Pickup'} time: ${time}`);
      } else {
        lines.push(`${isDelivery ? 'Delivery' : 'Pickup'}: ASAP`);
      }
    } else {
      /* Takeaway pickup + delivery: kitchen bon stays TAKEAWAY/DELIVERY # only —
         no Customer / Address / Phone / Delivery ASAP. */
    }
    /* Customer notes stay in Admin only — not on kitchen bon.
       Order number is already on the TAKEAWAY # line (large). */
    lines.push('');
    return lines;
  }

  /** Always bar — fruit platter prints with cocktails, not kitchen. */
  const BAR_ONLY_PRODUCT_IDS = new Set([
    'fruit-plate',
    'shabbat-fruit-plate',
  ]);

  function collectCategoryProductIds(categoryIds) {
    const wanted = new Set(categoryIds);
    const ids = new Set();
    const categories = global.MENU_DATA?.categories;
    if (!Array.isArray(categories)) return ids;

    categories.forEach((cat) => {
      if (!wanted.has(cat?.id)) return;
      (cat.items || []).forEach((item) => {
        if (item?.id) ids.add(String(item.id));
      });
      (cat.subsections || []).forEach((sub) => {
        (sub.items || []).forEach((item) => {
          if (item?.id) ids.add(String(item.id));
        });
      });
    });

    return ids;
  }

  function collectDrinkProductIds() {
    return collectCategoryProductIds(['coldDrinks', 'hotDrinks', 'cocktails']);
  }

  function collectCocktailProductIds() {
    const ids = collectCategoryProductIds(['cocktails', 'hotDrinks']);
    BAR_ONLY_PRODUCT_IDS.forEach((id) => ids.add(id));
    (global.SHAKE_BASE_ITEMS || []).forEach((item) => {
      if (item?.id) ids.add(String(item.id));
    });
    (global.LIMONANA_ALCOHOL_ITEMS || []).forEach((item) => {
      if (item?.id) ids.add(String(item.id));
    });
    return ids;
  }

  function isBarItem(item, drinkIds) {
    if (!item?.productId) return false;
    const pid = String(item.productId);
    if (BAR_ONLY_PRODUCT_IDS.has(pid)) return true;
    if (drinkIds.has(pid)) return true;
    /* Shake bases are drink options — always bar with the fruit shake */
    if (global.SHAKE_BASE_IDS?.has?.(pid)) return true;
    if (global.LIMONANA_ALCOHOL_IDS?.has?.(pid)) return true;
    return false;
  }

  function isCocktailBarItem(item, cocktailIds) {
    if (!item?.productId) return false;
    const pid = String(item.productId);
    if (BAR_ONLY_PRODUCT_IDS.has(pid)) return true;
    if (cocktailIds.has(pid)) return true;
    if (global.SHAKE_BASE_IDS?.has?.(pid)) return true;
    if (global.LIMONANA_ALCOHOL_IDS?.has?.(pid)) return true;
    return false;
  }

  function resolveOrder(order) {
    if (order && typeof order === 'object') return order;
    return global.LechaimOrderEngine?.getOrder?.() || null;
  }

  /**
   * Items that still need printing (printed === false).
   * Uses Order Engine when order is omitted.
   */
  function getPrintableItems(order) {
    const resolved = resolveOrder(order);
    if (!resolved) {
      return global.LechaimOrderEngine?.getUnprintedItems?.() || [];
    }

    const items = Array.isArray(resolved.items) ? resolved.items : [];
    return items.filter((item) => item && item.printed !== true && Number(item.qty) > 0);
  }

  function hamburgerMealId() {
    return String(global.HAMBURGER_MEAL_ID || 'hamburger-fries');
  }

  function hamburgerDrinkIdSet() {
    const raw = global.HAMBURGER_DRINK_IDS;
    if (raw && typeof raw.has === 'function') return raw;
    if (Array.isArray(raw)) return new Set(raw.map(String));
    return new Set(['coke', 'coke-zero', 'fanta', 'sprite', 'red-bull', 'soda', 'water']);
  }

  function isHamburgerMealItem(item) {
    return String(item?.productId || '') === hamburgerMealId();
  }

  function isDonenessProduct(productId) {
    return Boolean(global.DONENESS_IDS?.has?.(String(productId || '')));
  }

  /**
   * Drink included with the hamburger meal — belongs on the BAR ticket
   * as a normal soft drink, never nested under the burger name.
   */
  function isHamburgerMealDrinkItem(item, parentById, drinkIds) {
    if (!item) return false;
    const pid = String(item.productId || '');
    if (isDonenessProduct(pid)) return false;
    const parent = item.linkedToMainItemId
      ? parentById.get(String(item.linkedToMainItemId))
      : null;
    if (parent && isHamburgerMealItem(parent)) return true;
    if (!item.linkedToMainItemId) return false;
    if (hamburgerDrinkIdSet().has(pid)) return true;
    return Boolean(drinkIds && drinkIds.has(pid));
  }

  function splitPrintableItems(order) {
    const printable = getPrintableItems(order);
    const drinkIds = collectDrinkProductIds();
    const cocktailIds = collectCocktailProductIds();
    const kitchen = [];
    const bar = [];
    const barDrinks = [];
    const barCocktails = [];

    const byId = new Map();
    function remember(item) {
      if (item?.itemId) byId.set(String(item.itemId), item);
    }
    printable.forEach(remember);
    (order?.items || []).forEach(remember);

    function pushBar(item, group) {
      if (!item || bar.includes(item)) return;
      bar.push(item);
      if (group === 'cocktails') barCocktails.push(item);
      else barDrinks.push(item);
    }

    function removeFromKitchen(item) {
      const idx = kitchen.indexOf(item);
      if (idx >= 0) kitchen.splice(idx, 1);
    }

    function drinksLinkedToBurger(burger) {
      const bid = String(burger?.itemId || '');
      if (!bid) return [];
      const seen = new Set();
      const out = [];
      const pools = [printable];
      if (Array.isArray(order?.items)) pools.push(order.items);
      pools.forEach((list) => {
        list.forEach((row) => {
          if (!row || Number(row.qty) <= 0) return;
          if (String(row.linkedToMainItemId || '') !== bid) return;
          if (isDonenessProduct(row.productId)) return;
          const id = row.itemId != null ? String(row.itemId) : `pid:${row.productId}`;
          if (seen.has(id)) return;
          seen.add(id);
          out.push(row);
        });
      });
      return out;
    }

    /* Linked sides follow parent, except hamburger drinks (bar) and doneness (kitchen). */
    function channelFor(item, seen = new Set()) {
      if (!item) return 'kitchen';
      const pid = String(item.productId || '');
      if (isDonenessProduct(pid)) return 'kitchen';
      if (isHamburgerMealDrinkItem(item, byId, drinkIds) || hamburgerDrinkIdSet().has(pid)) {
        return 'bar';
      }
      const id = item.itemId != null ? String(item.itemId) : '';
      if (id) {
        if (seen.has(id)) return isBarItem(item, drinkIds) ? 'bar' : 'kitchen';
        seen.add(id);
      }
      if (item.linkedToMainItemId) {
        const parent = byId.get(String(item.linkedToMainItemId));
        if (parent) return channelFor(parent, seen);
      }
      return isBarItem(item, drinkIds) ? 'bar' : 'kitchen';
    }

    function barGroupFor(item) {
      if (!item) return 'drinks';
      if (isHamburgerMealDrinkItem(item, byId, drinkIds) || hamburgerDrinkIdSet().has(String(item.productId || ''))) {
        return 'drinks';
      }
      return isCocktailBarItem(item, cocktailIds) ? 'cocktails' : 'drinks';
    }

    printable.forEach((item) => {
      if (channelFor(item) === 'bar') pushBar(item, barGroupFor(item));
      else kitchen.push(item);
    });

    function removeFromBar(item) {
      if (!item) return;
      const b = bar.indexOf(item);
      if (b >= 0) bar.splice(b, 1);
      const d = barDrinks.indexOf(item);
      if (d >= 0) barDrinks.splice(d, 1);
      const c = barCocktails.indexOf(item);
      if (c >= 0) barCocktails.splice(c, 1);
    }

    /* Included meal drink prints on bar like any other soft drink — never with the burger. */
    const burgers = printable.filter((item) => isHamburgerMealItem(item) && !item.linkedToMainItemId);
    burgers.forEach((burger) => {
      removeFromBar(burger);
      const drinks = drinksLinkedToBurger(burger);
      drinks.forEach((drink) => {
        removeFromKitchen(drink);
        pushBar(drink, 'drinks');
      });
    });

    if (burgers.length && !barDrinks.length) {
      console.warn(
        '[LechaimPrintEngine] hamburger meal has no bar drink in this wave',
        burgers.map((row) => row.itemId)
      );
    }

    return { kitchen, bar, barDrinks, barCocktails, all: printable };
  }

  function formatItemName(item) {
    return String(item?.name || item?.productId || '').trim() || 'Item';
  }

  const missingPrintNameWarned = new Set();

  function warnMissingPrintName(productId, displayName, source) {
    const key = productId || displayName || '(unknown)';
    if (missingPrintNameWarned.has(key)) return;
    missingPrintNameWarned.add(key);
    console.warn(
      `[LechaimPrintEngine] Missing printName for ${source}:`,
      displayName || productId || '(unknown)',
      productId ? `(id: ${productId})` : ''
    );
  }

  function findCatalogProduct(productId) {
    const id = productId == null ? '' : String(productId);
    if (!id) return null;

    const categories = global.MENU_DATA?.categories;
    if (Array.isArray(categories)) {
      for (let c = 0; c < categories.length; c += 1) {
        const cat = categories[c];
        const pools = [cat.items || []];
        (cat.subsections || []).forEach((sub) => pools.push(sub.items || []));
        for (let p = 0; p < pools.length; p += 1) {
          const found = pools[p].find((entry) => entry && String(entry.id) === id);
          if (found) return found;
        }
      }
    }

    const hotSides = global.HOT_SIDE_ITEMS;
    if (Array.isArray(hotSides)) {
      const found = hotSides.find((entry) => entry && String(entry.id) === id);
      if (found) return found;
    }

    const shakeBases = global.SHAKE_BASE_ITEMS;
    if (Array.isArray(shakeBases)) {
      const found = shakeBases.find((entry) => entry && String(entry.id) === id);
      if (found) return found;
    }

    const limonanaAlcohol = global.LIMONANA_ALCOHOL_ITEMS;
    if (Array.isArray(limonanaAlcohol)) {
      const found = limonanaAlcohol.find((entry) => entry && String(entry.id) === id);
      if (found) return found;
    }

    const doneness = global.DONENESS_ITEMS;
    if (Array.isArray(doneness)) {
      const found = doneness.find((entry) => entry && String(entry.id) === id);
      if (found) return found;
    }

    const shabbatCats = global.SHABBAT_MENU_DATA?.categories;
    if (Array.isArray(shabbatCats)) {
      for (let c = 0; c < shabbatCats.length; c += 1) {
        const found = (shabbatCats[c].items || []).find((entry) => entry && String(entry.id) === id);
        if (found) return found;
      }
    }

    return null;
  }

  function getCatalogPrintName(product) {
    if (!product) return '';
    if (product.printName == null) return '';
    return String(product.printName).trim();
  }

  /**
   * Scan MENU_DATA + HOT_SIDE_ITEMS and warn for any product without printName.
   * @returns {{ ok: boolean, missing: Array<{ id: string, name: string, source: string }> }}
   */
  function validatePrintNames() {
    const missing = [];

    function check(product, source) {
      if (!product?.id) return;
      const printName = getCatalogPrintName(product);
      if (printName) return;
      missing.push({
        id: String(product.id),
        name: String(product.name || product.id),
        source,
      });
      warnMissingPrintName(product.id, product.name || product.id, source);
    }

    const categories = global.MENU_DATA?.categories;
    if (Array.isArray(categories)) {
      categories.forEach((cat) => {
        (cat.items || []).forEach((item) => check(item, 'MENU_DATA'));
        (cat.subsections || []).forEach((sub) => {
          (sub.items || []).forEach((item) => check(item, 'MENU_DATA'));
        });
      });
    } else {
      console.warn('[LechaimPrintEngine] MENU_DATA.categories missing — cannot validate printName');
    }

    const hotSides = global.HOT_SIDE_ITEMS;
    if (Array.isArray(hotSides)) {
      hotSides.forEach((item) => check(item, 'HOT_SIDE_ITEMS'));
    } else {
      console.warn('[LechaimPrintEngine] HOT_SIDE_ITEMS missing — cannot validate printName');
    }

    const shakeBases = global.SHAKE_BASE_ITEMS;
    if (Array.isArray(shakeBases)) {
      shakeBases.forEach((item) => check(item, 'SHAKE_BASE_ITEMS'));
    }

    const limonanaAlcohol = global.LIMONANA_ALCOHOL_ITEMS;
    if (Array.isArray(limonanaAlcohol)) {
      limonanaAlcohol.forEach((item) => check(item, 'LIMONANA_ALCOHOL_ITEMS'));
    }

    const doneness = global.DONENESS_ITEMS;
    if (Array.isArray(doneness)) {
      doneness.forEach((item) => check(item, 'DONENESS_ITEMS'));
    }

    if (missing.length) {
      console.warn(
        `[LechaimPrintEngine] printName validation: ${missing.length} product(s) missing printName`,
        missing
      );
    } else {
      console.log('[LechaimPrintEngine] printName validation: all products OK');
    }

    return { ok: missing.length === 0, missing };
  }

  function hasHebrewChars(value) {
    return /[\u0590-\u05FF]/.test(String(value || ''));
  }

  /**
   * Kitchen/bar tickets use Latin transliteration (`printName`), never Hebrew UI names.
   * If a stored printName is Hebrew (legacy butcher rows), prefer catalog Latin name.
   * Never returns empty/undefined — falls back to name with a console warning.
   */
  function resolvePrintName(item) {
    const productId = item?.productId == null ? '' : String(item.productId);
    const catalog = productId ? findCatalogProduct(productId) : null;
    const fromCatalog = getCatalogPrintName(catalog);

    if (item?.printName != null) {
      const direct = String(item.printName).trim();
      if (direct && !hasHebrewChars(direct)) return direct;
      if (direct && hasHebrewChars(direct) && fromCatalog && !hasHebrewChars(fromCatalog)) {
        return fromCatalog;
      }
      if (direct) return direct;
    }

    if (fromCatalog) return fromCatalog;

    const fallback = formatItemName(item);
    warnMissingPrintName(
      productId || catalog?.id,
      catalog?.name || item?.name || fallback,
      catalog ? 'catalog' : 'order-item'
    );
    return fallback;
  }

  /**
   * Category-bar order from MENU_DATA.categories (same as the menu nav).
   * productId → { catIdx, itemIdx }
   */
  function buildProductCatalogOrder() {
    const order = new Map();
    let itemIdx = 0;

    function push(productId, catIdx) {
      const id = productId == null ? '' : String(productId);
      if (!id || order.has(id)) return;
      order.set(id, { catIdx, itemIdx: itemIdx++ });
    }

    const categories = global.MENU_DATA?.categories;
    if (Array.isArray(categories)) {
      categories.forEach((cat, catIdx) => {
        (cat.items || []).forEach((item) => push(item?.id, catIdx));
        (cat.subsections || []).forEach((sub) => {
          (sub.items || []).forEach((item) => push(item?.id, catIdx));
        });
      });
    }

    const hotSideCatIdx = Array.isArray(categories) ? categories.length : 0;
    (Array.isArray(global.HOT_SIDE_ITEMS) ? global.HOT_SIDE_ITEMS : []).forEach((item) => {
      push(item?.id, hotSideCatIdx);
    });
    const shakeCatIdx = hotSideCatIdx + 1;
    (Array.isArray(global.SHAKE_BASE_ITEMS) ? global.SHAKE_BASE_ITEMS : []).forEach((item) => {
      push(item?.id, shakeCatIdx);
    });
    const limonanaCatIdx = shakeCatIdx + 1;
    (Array.isArray(global.LIMONANA_ALCOHOL_ITEMS) ? global.LIMONANA_ALCOHOL_ITEMS : []).forEach((item) => {
      push(item?.id, limonanaCatIdx);
    });
    const donenessCatIdx = limonanaCatIdx + 1;
    (Array.isArray(global.DONENESS_ITEMS) ? global.DONENESS_ITEMS : []).forEach((item) => {
      push(item?.id, donenessCatIdx);
    });

    return order;
  }

  function catalogRank(productId, catalogOrder) {
    const hit = catalogOrder.get(String(productId || ''));
    if (hit) return hit;
    return { catIdx: Number.MAX_SAFE_INTEGER, itemIdx: Number.MAX_SAFE_INTEGER };
  }

  /**
   * Build ticket body from order items (by itemId + linkedToMainItemId).
   * Print order follows Categories Bar (MENU_DATA.categories).
   * One side under each main; identical main+side may merge qty. No notes.
   */
  function formatItemLines(items) {
    const list = Array.isArray(items) ? items.filter((item) => item && Number(item.qty) > 0) : [];
    if (!list.length) return [];

    const catalogOrder = buildProductCatalogOrder();
    const itemById = new Map();
    list.forEach((item) => {
      if (item.itemId) itemById.set(String(item.itemId), item);
    });

    const sidesByMainId = new Map();
    list.forEach((item) => {
      const parentId = item.linkedToMainItemId ? String(item.linkedToMainItemId) : '';
      if (!parentId) return;
      const parent = itemById.get(parentId);
      if (parent && isHamburgerMealItem(parent) && !isDonenessProduct(item.productId)) {
        return;
      }
      if (!sidesByMainId.has(parentId)) sidesByMainId.set(parentId, []);
      sidesByMainId.get(parentId).push(item);
    });

    const consumedSideIds = new Set();
    const blocks = [];
    let seq = 0;

    list.forEach((item) => {
      if (item.linkedToMainItemId) return;

      const mainId = String(item.itemId);
      const linkedSides = sidesByMainId.get(mainId) || [];
      linkedSides.forEach((s) => consumedSideIds.add(String(s.itemId)));
      const sideProductId = linkedSides
        .map((s) => String(s.productId || ''))
        .sort()
        .join('+');
      const sideNames = linkedSides
        .map((s) => resolvePrintName(s))
        .filter(Boolean);

      blocks.push({
        seq: seq++,
        productId: String(item.productId || ''),
        name: resolvePrintName(item),
        qty: Number(item.qty) || 0,
        unitType: item.unitType || item.unit_type || null,
        thawCount: item.thawCount == null && item.thaw_count == null
          ? null
          : Number(item.thawCount ?? item.thaw_count),
        sideProductId,
        sideNames,
      });
    });

    /* Orphan linked sides (parent missing from this ticket batch) */
    list.forEach((item) => {
      if (!item.linkedToMainItemId) return;
      const sideId = String(item.itemId);
      if (consumedSideIds.has(sideId)) return;

      const parentId = String(item.linkedToMainItemId);
      const parent = itemById.get(parentId);
      const hamburgerDrinkStandalone = Boolean(
        parent && isHamburgerMealItem(parent) && !isDonenessProduct(item.productId)
      );
      if (!hamburgerDrinkStandalone && parent && !parent.linkedToMainItemId) {
        return;
      }

      blocks.push({
        seq: seq++,
        productId: String(item.productId || ''),
        name: resolvePrintName(item),
        qty: Number(item.qty) || 0,
        unitType: item.unitType || item.unit_type || null,
        thawCount: item.thawCount == null && item.thaw_count == null
          ? null
          : Number(item.thawCount ?? item.thaw_count),
        sideProductId: '',
        sideNames: [],
      });
    });

    blocks.sort((a, b) => {
      const ra = catalogRank(a.productId, catalogOrder);
      const rb = catalogRank(b.productId, catalogOrder);
      if (ra.catIdx !== rb.catIdx) return ra.catIdx - rb.catIdx;
      if (ra.itemIdx !== rb.itemIdx) return ra.itemIdx - rb.itemIdx;
      return a.seq - b.seq;
    });

    /* Merge only fully identical main + side (same products), keep category order */
    const merged = [];
    const indexBySig = new Map();
    blocks.forEach((block) => {
      const sig = `${block.productId}::${block.sideProductId}::${block.unitType || ''}::${block.thawCount ?? ''}`;
      if (indexBySig.has(sig)) {
        merged[indexBySig.get(sig)].qty += block.qty;
        return;
      }
      indexBySig.set(sig, merged.length);
      merged.push({
        name: block.name,
        qty: block.qty,
        unitType: block.unitType || null,
        thawCount: block.thawCount,
        sideNames: Array.isArray(block.sideNames) ? block.sideNames : [],
      });
    });

    const lines = [];
    merged.forEach((block, index) => {
      /* Gap between dishes (unchanged density preference) */
      if (index > 0) {
        lines.push('');
      }

      const isPack = String(block.unitType || '') === 'pack';
      const mainLine = isPack
        ? `${block.qty} PACK ${block.name}`
        : `${block.qty} x ${block.name}`;

      /* Main: ~2x + bold */
      lines.push(
        `${POS.fontA}${POS.size2x}${POS.boldOn}` +
        mainLine +
        `${POS.boldOff}`
      );
      if (isPack && Number.isFinite(Number(block.thawCount))) {
        lines.push(`Thaw: ${Math.max(0, Math.floor(Number(block.thawCount)))}`);
      }

      /* Sides under main: also ~2x, slightly less emphasis + indent */
      (Array.isArray(block.sideNames) ? block.sideNames : []).forEach((sideName) => {
        if (!sideName) return;
        lines.push('');
        lines.push(
          `${POS.fontA}${POS.size2x}` +
          `  + ${sideName}`
        );
      });
    });

    return lines;
  }

  const PRINT_SEQ_STORAGE_KEY = 'lechaim-print-ticket-seq';

  function readPrintSeqStore() {
    try {
      const raw = global.localStorage.getItem(PRINT_SEQ_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      console.warn('[LechaimPrintEngine] failed to read print seq store', err);
      return {};
    }
  }

  function writePrintSeqStore(store) {
    try {
      global.localStorage.setItem(PRINT_SEQ_STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
      console.warn('[LechaimPrintEngine] failed to write print seq store', err);
    }
  }

  /**
   * Next ticket sequence for this open order (Order 1, Order 2, …).
   * Same number is used for kitchen + bar in one print wave.
   */
  function allocateTicketSequence(order) {
    const key = order?.orderId
      ? `order:${order.orderId}`
      : (order?.tableNumber != null
        ? `table:${order.tableNumber}`
        : `session:${order?.sessionId || 'unknown'}`);

    const store = readPrintSeqStore();
    const next = (Number(store[key]) || 0) + 1;
    store[key] = next;

    const keys = Object.keys(store);
    if (keys.length > 100) {
      keys.slice(0, keys.length - 80).forEach((k) => {
        delete store[k];
      });
    }

    writePrintSeqStore(store);
    return next;
  }

  function buildTicket(order, title, items, ticketSeq) {
    if (!items.length) return '';

    const stamp = formatDateTime(order?.updatedAt || order?.createdAt || Date.now());
    const body = formatItemLines(items);
    const tableLine = formatTableLine(order);
    const pickupBlock = buildSelfPickupBlock(order);

    return [
      `${POS.fontA}${POS.size2x}${POS.boldOn}${LINE}`,
      '',
      title,
      '',
      /* Table number — emphasized */
      tableLine,
      '',
      ...pickupBlock,
      /* Time — last detail line, immediately before products */
      stamp,
      `${POS.boldOff}`,
      '',
      DIV,
      '',
      ...body,
      '',
      DIV,
      '',
      LINE,
      `${POS.fontA}${POS.sizeNormal}${POS.boldOff}`,
    ].join('\n');
  }

  function buildKitchenTicket(order, ticketSeq) {
    const resolved = resolveOrder(order);
    if (!resolved) return '';
    const { kitchen } = splitPrintableItems(resolved);
    return buildTicket(resolved, 'KITCHEN', kitchen, ticketSeq);
  }

  function buildBarTicket(order, ticketSeq) {
    const resolved = resolveOrder(order);
    if (!resolved) return '';
    const { bar } = splitPrintableItems(resolved);
    return buildTicket(resolved, 'BAR', bar, ticketSeq);
  }

  function buildBarDrinksTicket(order, ticketSeq) {
    const resolved = resolveOrder(order);
    if (!resolved) return '';
    const { barDrinks } = splitPrintableItems(resolved);
    return buildTicket(resolved, 'BAR', barDrinks, ticketSeq);
  }

  function buildBarCocktailsTicket(order, ticketSeq) {
    const resolved = resolveOrder(order);
    if (!resolved) return '';
    const { barCocktails } = splitPrintableItems(resolved);
    return buildTicket(resolved, 'BAR', barCocktails, ticketSeq);
  }

  async function printKitchen(order, ticketSeq) {
    const resolved = resolveOrder(order);
    const seq = ticketSeq != null ? ticketSeq : allocateTicketSequence(resolved);
    const ticket = buildKitchenTicket(resolved, seq);
    if (!ticket) return true; /* nothing to print = success / no-op */
    return (await sendTicket(ticket, 'kitchen')) === true;
  }

  async function printBar(order, ticketSeq) {
    const resolved = resolveOrder(order);
    const seq = ticketSeq != null ? ticketSeq : allocateTicketSequence(resolved);
    const drinksTicket = buildBarDrinksTicket(resolved, seq);
    const cocktailsTicket = buildBarCocktailsTicket(resolved, seq);

    if (drinksTicket) {
      if ((await sendTicket(drinksTicket, 'bar')) !== true) return false;
    }
    if (cocktailsTicket) {
      if ((await sendTicket(cocktailsTicket, 'bar')) !== true) return false;
    }
    return true;
  }

  /**
   * Kitchen → Bar → mark printed only when both succeed.
   * One table-order sequence number is shared by kitchen + bar for this wave.
   */
  function playPrintSuccessSound() {
    try {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      const ctx = playPrintSuccessSound._ctx || new Ctx();
      playPrintSuccessSound._ctx = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const now = ctx.currentTime;
      /* Soft “new ticket” ding — different from admin alert */
      const tones = [
        { freq: 523.25, at: 0, dur: 0.16 },
        { freq: 659.25, at: 0.12, dur: 0.16 },
        { freq: 783.99, at: 0.24, dur: 0.28 },
      ];
      tones.forEach((tone) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.22, now + tone.at + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (err) {
      console.warn('[LechaimPrintEngine] print sound failed', err);
    }
  }

  async function printOrder(order) {
    const resolved = resolveOrder(order);
    if (!resolved) return false;

    const { all, kitchen, bar } = splitPrintableItems(resolved);
    if (!all.length) return true;

    let ticketSeq;
    if (resolved.ticketSeq != null && Number.isFinite(Number(resolved.ticketSeq))) {
      ticketSeq = Number(resolved.ticketSeq);
    } else if (kitchen.length || bar.length) {
      ticketSeq = allocateTicketSequence(resolved);
    } else {
      ticketSeq = 1;
    }

    const kitchenOk = await printKitchen(resolved, ticketSeq);
    const barOk = await printBar(resolved, ticketSeq);

    if (!kitchenOk || !barOk) return false;

    if (!resolved._skipLocalMarkPrinted) {
      const ids = all.map((item) => item.itemId).filter(Boolean);
      if (ids.length && global.LechaimOrderEngine?.markPrinted) {
        global.LechaimOrderEngine.markPrinted(ids);
      }
    }

    playPrintSuccessSound();
    return true;
  }

  function formatMoneyEuro(amount) {
    const n = Number(amount) || 0;
    return `€${n.toFixed(2)}`;
  }

  function formatBillDateTime(value) {
    const d = value ? new Date(value) : new Date();
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    return `${pad2(safe.getDate())}/${pad2(safe.getMonth() + 1)}/${safe.getFullYear()} ${pad2(safe.getHours())}:${pad2(safe.getMinutes())}`;
  }

  function padBillLine(left, right, width = 42) {
    const r = String(right);
    let l = String(left);
    /* Count code points so Euro is 1 column (printer maps it to 1 glyph) */
    const rightCols = Array.from(r).length;
    const maxLeft = Math.max(1, width - rightCols - 1);
    const leftChars = Array.from(l);
    if (leftChars.length > maxLeft) {
      l = leftChars.slice(0, maxLeft).join('');
    }
    const leftCols = Array.from(l).length;
    const spaces = Math.max(1, width - leftCols - rightCols);
    return l + ' '.repeat(spaces) + r;
  }

  /**
   * All order items (printed + unprinted) grouped for customer bill.
   * No Order 1/2 labels — one combined check.
   */
  function buildCustomerBillBlocks(order) {
    const list = (order?.items || []).filter((item) => item && Number(item.qty) > 0);
    if (!list.length) return [];

    const catalogOrder = buildProductCatalogOrder();
    const sidesByMainId = new Map();
    list.forEach((item) => {
      const parentId = item.linkedToMainItemId ? String(item.linkedToMainItemId) : '';
      if (!parentId) return;
      if (!sidesByMainId.has(parentId)) sidesByMainId.set(parentId, []);
      sidesByMainId.get(parentId).push(item);
    });

    const blocks = [];
    let seq = 0;

    list.forEach((item) => {
      if (item.linkedToMainItemId) return;
      const mainId = String(item.itemId);
      const linkedSides = sidesByMainId.get(mainId) || [];
      const qty = Number(item.qty) || 0;
      const unit = Number(item.price) || 0;
      blocks.push({
        seq: seq++,
        productId: String(item.productId || ''),
        name: resolvePrintName(item),
        qty,
        sideProductId: linkedSides.map((s) => String(s.productId || '')).sort().join('+'),
        sideNames: linkedSides.map((s) => resolvePrintName(s)).filter(Boolean),
        lineTotal: unit * qty,
      });
    });

    /* Orphan sides billed alone if parent missing */
    list.forEach((item) => {
      if (!item.linkedToMainItemId) return;
      const parentId = String(item.linkedToMainItemId);
      const parent = list.find((row) => String(row.itemId) === parentId && !row.linkedToMainItemId);
      if (parent) return;
      const qty = Number(item.qty) || 0;
      blocks.push({
        seq: seq++,
        productId: String(item.productId || ''),
        name: resolvePrintName(item),
        qty,
        sideProductId: '',
        sideNames: [],
        lineTotal: (Number(item.price) || 0) * qty,
      });
    });

    blocks.sort((a, b) => {
      const ra = catalogRank(a.productId, catalogOrder);
      const rb = catalogRank(b.productId, catalogOrder);
      if (ra.catIdx !== rb.catIdx) return ra.catIdx - rb.catIdx;
      if (ra.itemIdx !== rb.itemIdx) return ra.itemIdx - rb.itemIdx;
      return a.seq - b.seq;
    });

    const merged = [];
    const indexBySig = new Map();
    blocks.forEach((block) => {
      const sig = `${block.productId}::${block.sideProductId}`;
      if (indexBySig.has(sig)) {
        const row = merged[indexBySig.get(sig)];
        row.qty += block.qty;
        row.lineTotal += block.lineTotal;
        return;
      }
      indexBySig.set(sig, merged.length);
      merged.push({ ...block });
    });

    return merged;
  }

  function buildCustomerBillTicket(order) {
    const resolved = resolveOrder(order);
    if (!resolved) return '';

    const blocks = buildCustomerBillBlocks(resolved);
    if (!blocks.length) return '';

    const stamp = formatBillDateTime(resolved.updatedAt || resolved.createdAt || Date.now());
    const itemsTotal = blocks.reduce((sum, row) => sum + (Number(row.lineTotal) || 0), 0);
    const subtotal = resolved.subtotal != null && Number.isFinite(Number(resolved.subtotal))
      ? Number(resolved.subtotal)
      : itemsTotal;
    const discountPercent = resolved.discountPercent != null
      ? Number(resolved.discountPercent)
      : (resolved.discount_percent != null ? Number(resolved.discount_percent) : null);
    const discountAmount = resolved.discountAmount != null
      ? Number(resolved.discountAmount)
      : (resolved.discount_amount != null ? Number(resolved.discount_amount) : null);
    const couponCode = resolved.couponCode || resolved.coupon_code || null;
    const hasDiscount = Boolean(
      couponCode &&
      discountAmount != null &&
      Number.isFinite(discountAmount) &&
      discountAmount > 0
    );
    const payable = hasDiscount
      ? (resolved.billTotal != null
        ? Number(resolved.billTotal)
        : Math.max(0, subtotal - discountAmount))
      : itemsTotal;

    const tableLine = formatTableLine(resolved);
    const pickupInfo = (() => {
      const classified = global.LechaimOrderTypes?.classifyOrderType?.(
        resolved.orderType || resolved.order_type,
        'print-engine.customerBill'
      );
      if (classified !== 'takeaway') return [];
      const lines = [];
      lines.push(
        `Customer: ${resolved.customerName || resolved.customer_name || '—'}`,
        `Phone: ${resolved.customerPhone || resolved.customer_phone || '—'}`,
        `Pickup: ${formatPickupLabel(resolved)}`,
      );
      /* Notes + ORDER # are Admin / TAKEAWAY header only. */
      return lines;
    })();
    const body = [];
    const W = 42;

    blocks.forEach((block) => {
      body.push(
        padBillLine(
          `${block.qty} x ${block.name}`,
          formatMoneyEuro(block.lineTotal),
          W
        )
      );
      (Array.isArray(block.sideNames) ? block.sideNames : []).forEach((sideName) => {
        if (!sideName) return;
        body.push(`  + ${sideName}`);
      });
    });

    const totalsBlock = hasDiscount
      ? [
          padBillLine('Subtotal', formatMoneyEuro(subtotal), W),
          padBillLine(
            `Discount -${discountPercent != null ? discountPercent : ''}%`,
            `-${formatMoneyEuro(discountAmount)}`,
            W
          ),
          `${POS.boldOn}` + padBillLine('TOTAL', formatMoneyEuro(payable), W),
          `${POS.boldOff}`,
        ]
      : [
          `${POS.boldOn}` + padBillLine('TOTAL', formatMoneyEuro(payable), W),
          `${POS.boldOff}`,
        ];

    /* Compact normal-size layout (~half of kitchen size2x tickets) */
    return [
      `${POS.fontA}${POS.sizeNormal}${POS.boldOn}${LINE}`,
      'LECHAIM RESTAURANT',
      'CUSTOMER BILL',
      tableLine,
      stamp,
      `${POS.boldOff}`,
      ...(pickupInfo.length ? [DIV, ...pickupInfo] : []),
      DIV,
      ...body,
      DIV,
      ...totalsBlock,
      'Service does not include tip.',
      '',
      `${POS.boldOn}THANK YOU!${POS.boldOff}`,
      'We hope you enjoyed your meal.',
      'Have a wonderful vacation in Crete!',
      LINE,
      `${POS.fontA}${POS.sizeNormal}${POS.boldOff}`,
    ].join('\n');
  }

  /**
   * Print customer bill to BAR only. Does not print kitchen tickets.
   * Does not close the table.
   */
  async function printCustomerBill(order) {
    const resolved = resolveOrder(order);
    if (!resolved) return false;

    const ticket = buildCustomerBillTicket(resolved);
    if (!ticket) {
      console.error('[LechaimPrintEngine] customer bill empty — nothing to print');
      return false;
    }

    return (await sendTicket(ticket, 'bar')) === true;
  }

  /**
   * Print an arbitrary ESC/POS text ticket to kitchen or bar.
   * Used by isolated admin modules (e.g. staff hours) without touching order flow.
   */
  async function printRawTicket(ticket, channel = 'bar') {
    const text = String(ticket || '').trim();
    if (!text) return false;
    const dest = channel === 'kitchen' ? 'kitchen' : 'bar';
    return (await sendTicket(text, dest)) === true;
  }

  global.LechaimPrintEngine = {
    PRINT_SERVICE_URL,
    printKitchen,
    printBar,
    printOrder,
    printCustomerBill,
    printRawTicket,
    buildKitchenTicket,
    buildBarTicket,
    buildCustomerBillTicket,
    getPrintableItems,
    setSendTicket,
    validatePrintNames,
    resolvePrintName,
  };

  /* Stage 8.5 — run catalog printName check as soon as the engine loads */
  try {
    validatePrintNames();
  } catch (err) {
    console.warn('[LechaimPrintEngine] printName validation failed', err);
  }
})(window);
