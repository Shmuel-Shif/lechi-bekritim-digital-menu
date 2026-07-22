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
    const type = String(order?.orderType || '').toLowerCase();
    if (type === 'takeaway' || type === 'take-away') return 'TAKE AWAY';
    if (order?.tableNumber != null && order.tableNumber !== '') {
      return `TABLE ${order.tableNumber}`;
    }
    return 'TABLE —';
  }

  function collectDrinkProductIds() {
    const ids = new Set();
    const categories = global.MENU_DATA?.categories;
    if (!Array.isArray(categories)) return ids;

    categories.forEach((cat) => {
      if (cat?.id !== 'coldDrinks' && cat?.id !== 'hotDrinks') return;
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

  function isBarItem(item, drinkIds) {
    if (!item?.productId) return false;
    return drinkIds.has(String(item.productId));
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

  function splitPrintableItems(order) {
    const printable = getPrintableItems(order);
    const drinkIds = collectDrinkProductIds();
    const kitchen = [];
    const bar = [];

    printable.forEach((item) => {
      if (isBarItem(item, drinkIds)) bar.push(item);
      else kitchen.push(item);
    });

    return { kitchen, bar, all: printable };
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
      return hotSides.find((entry) => entry && String(entry.id) === id) || null;
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

  /**
   * Kitchen/bar tickets use Latin transliteration (`printName`), never English UI names.
   * Never returns empty/undefined — falls back to name with a console warning.
   */
  function resolvePrintName(item) {
    if (item?.printName != null) {
      const direct = String(item.printName).trim();
      if (direct) return direct;
    }

    const productId = item?.productId == null ? '' : String(item.productId);
    const catalog = productId ? findCatalogProduct(productId) : null;
    const fromCatalog = getCatalogPrintName(catalog);
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
      /* One hot side per main — take the first linked side only */
      const side = linkedSides[0] || null;
      linkedSides.forEach((s) => consumedSideIds.add(String(s.itemId)));

      blocks.push({
        seq: seq++,
        productId: String(item.productId || ''),
        name: resolvePrintName(item),
        qty: Number(item.qty) || 0,
        sideProductId: side ? String(side.productId || '') : '',
        sideName: side ? resolvePrintName(side) : '',
      });
    });

    /* Orphan linked sides (parent missing from this ticket batch) */
    list.forEach((item) => {
      if (!item.linkedToMainItemId) return;
      const sideId = String(item.itemId);
      if (consumedSideIds.has(sideId)) return;

      const parentId = String(item.linkedToMainItemId);
      if (itemById.has(parentId) && !itemById.get(parentId).linkedToMainItemId) {
        return;
      }

      blocks.push({
        seq: seq++,
        productId: String(item.productId || ''),
        name: resolvePrintName(item),
        qty: Number(item.qty) || 0,
        sideProductId: '',
        sideName: '',
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
      const sig = `${block.productId}::${block.sideProductId}`;
      if (indexBySig.has(sig)) {
        merged[indexBySig.get(sig)].qty += block.qty;
        return;
      }
      indexBySig.set(sig, merged.length);
      merged.push({
        name: block.name,
        qty: block.qty,
        sideName: block.sideName,
      });
    });

    const lines = [];
    merged.forEach((block, index) => {
      /* Gap between dishes (unchanged density preference) */
      if (index > 0) {
        lines.push('');
      }

      /* Main: ~2x + bold */
      lines.push(
        `${POS.fontA}${POS.size2x}${POS.boldOn}` +
        `${block.qty} x ${block.name}` +
        `${POS.boldOff}`
      );

      /* Side under main: also ~2x, slightly less emphasis + indent */
      if (block.sideName) {
        lines.push('');
        lines.push(
          `${POS.fontA}${POS.size2x}` +
          `  + ${block.sideName}`
        );
      }
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
    const seq = Number(ticketSeq) > 0 ? Number(ticketSeq) : 1;
    const tableLine = formatTableLine(order);

    return [
      `${POS.fontA}${POS.size2x}${POS.boldOn}${LINE}`,
      '',
      'LECHAIM RESTAURANT',
      '',
      title,
      '',
      /* Table number — emphasized */
      tableLine,
      '',
      `Order ${seq}`,
      '',
      /* Time — emphasized */
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
    const ticket = buildBarTicket(resolved, seq);
    if (!ticket) return true;
    return (await sendTicket(ticket, 'bar')) === true;
  }

  /**
   * Kitchen → Bar → mark printed only when both succeed.
   * One table-order sequence number is shared by kitchen + bar for this wave.
   */
  async function printOrder(order) {
    const resolved = resolveOrder(order);
    if (!resolved) return false;

    const { all, kitchen, bar } = splitPrintableItems(resolved);
    if (!all.length) return true;

    const ticketSeq = (kitchen.length || bar.length)
      ? allocateTicketSequence(resolved)
      : 1;

    const kitchenOk = await printKitchen(resolved, ticketSeq);
    const barOk = await printBar(resolved, ticketSeq);

    if (!kitchenOk || !barOk) return false;

    const ids = all.map((item) => item.itemId).filter(Boolean);
    if (ids.length && global.LechaimOrderEngine?.markPrinted) {
      global.LechaimOrderEngine.markPrinted(ids);
    }

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
      const side = (sidesByMainId.get(mainId) || [])[0] || null;
      const qty = Number(item.qty) || 0;
      const unit = Number(item.price) || 0;
      blocks.push({
        seq: seq++,
        productId: String(item.productId || ''),
        name: resolvePrintName(item),
        qty,
        sideProductId: side ? String(side.productId || '') : '',
        sideName: side ? resolvePrintName(side) : '',
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
        sideName: '',
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
    const total = blocks.reduce((sum, row) => sum + (Number(row.lineTotal) || 0), 0);
    const tableLine = formatTableLine(resolved);
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
      if (block.sideName) {
        body.push(`  + ${block.sideName}`);
      }
    });

    /* Compact normal-size layout (~half of kitchen size2x tickets) */
    return [
      `${POS.fontA}${POS.sizeNormal}${POS.boldOn}${LINE}`,
      'LECHAIM RESTAURANT',
      'CUSTOMER BILL',
      tableLine,
      stamp,
      `${POS.boldOff}`,
      DIV,
      ...body,
      DIV,
      `${POS.boldOn}` + padBillLine('TOTAL', formatMoneyEuro(total), W),
      `${POS.boldOff}`,
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

  global.LechaimPrintEngine = {
    PRINT_SERVICE_URL,
    printKitchen,
    printBar,
    printOrder,
    printCustomerBill,
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
