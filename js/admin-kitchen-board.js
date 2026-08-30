/**
 * LECHAIM — Admin kitchen tab: active-table readiness board.
 * Tracking only. Does not print, close tables, change prices, or session.status.
 */
(function (global) {
  'use strict';

  const api = global.LechaimSupabaseOrders;
  const typesApi = global.LechaimOrderTypes;
  const sessionApi = global.LechaimOrderSession;

  const gridEl = document.getElementById('kitchen-ready-grid');
  const emptyEl = document.getElementById('kitchen-ready-empty');
  const paneAlerts = document.getElementById('kitchen-pane-alerts');
  const paneTables = document.getElementById('kitchen-pane-tables');
  const detailEl = document.getElementById('kitchen-ready-detail');
  const detailTitle = document.getElementById('kitchen-ready-detail-title');
  const detailMeta = document.getElementById('kitchen-ready-detail-meta');
  const detailItems = document.getElementById('kitchen-ready-detail-items');

  const TABLE_MIN = sessionApi?.TABLE_MIN || 60;
  const TABLE_MAX = sessionApi?.TABLE_MAX || 73;

  let board = [];
  let openTable = null;
  let currentPane = 'tables';
  let refreshTimer = null;
  let unsubscribe = null;
  let active = false;
  let boardPrimed = false;
  let seenSessions = new Set();
  let pollTimer = null;
  let noteModalItemId = '';
  let noteModalSelected = new Set();
  let noteModalOther = false;
  let noteFocusRelease = null;

  const NOTE_JOIN = ' · ';
  const NOTE_PRESETS = [
    { id: 'add_bread_1', he: 'להוסיף לחם 1', el: 'Προσθέστε 1 ψωμί' },
    { id: 'add_bread_2', he: 'להוסיף לחם 2', el: 'Προσθέστε 2 ψωμί' },
    { id: 'no_sauce', he: 'בלי רוטב', el: 'Χωρίς σάλτσα' },
    { id: 'no_cilantro', he: 'בלי כוסברה', el: 'Χωρίς κόλιανδρο' },
    { id: 'no_cumin', he: 'בלי כמון', el: 'Χωρίς κύμινο' },
    { id: 'no_olive_oil', he: 'בלי שמן זית', el: 'Χωρίς ελαιόλαδο' },
    { id: 'no_chickpeas', he: 'בלי גרגירי חומוס', el: 'Χωρίς ρεβίθια' },
    { id: 'no_salt', he: 'בלי מלח', el: 'Χωρίς αλάτι' },
    { id: 'do_not_heat', he: 'לא לחמם', el: 'Να μη ζεσταθεί' },
    { id: 'double_2', he: 'לשים כפול 2', el: 'Διπλή μερίδα' },
    { id: 'must_be_hot', he: 'חשוב שיהיה חם', el: 'Να είναι ζεστό' },
    { id: 'grilled_veg_side', he: 'ירקות על האש בצד', el: 'Λαχανικά σχάρας στο πλάι' },
    { id: 'no_sweet_potato_puree', he: 'בלי פירה בטטה', el: 'Χωρίς πουρέ γλυκοπατάτας' },
    { id: 'must_chimichurri', he: 'חובה צ\'ימיצ\'ורי', el: 'Υποχρεωτικά τσιμιτσούρι' },
    { id: 'large_cut', he: 'נתח גדול', el: 'Μεγάλο κομμάτι' },
    { id: 'side_rice', he: 'אורז', el: 'ρύζι' },
    { id: 'side_fries', he: "צ'יפס", el: 'πατάτες' },
    { id: 'side_beans', he: 'שעועית', el: 'φασολάκια' },
    { id: 'side_puree', he: 'פירה', el: 'πουρές' },
    { id: 'make_thin', he: 'שיהיה דק', el: 'Να είναι λεπτό' },
    { id: 'no_strong_spice', he: 'בלי תיבול חזק', el: 'Χωρίς δυνατό καρύκευμα' },
    { id: 'not_too_much_sauce', he: 'בלי הרבה רוטב', el: 'Χωρίς πολλή σάλτσα' },
    { id: 'all_veg_side', he: 'כל הירקות בצד', el: 'Όλα τα λαχανικά στο πλάι' },
    { id: 'add_half_beans', he: 'להוסיף גם חצי שעועית', el: 'Προσθέστε και μισή μερίδα φασολάκια' },
    { id: 'add_half_rice', he: 'להוסיף גם חצי אורז', el: 'Προσθέστε και μισή μερίδα ρύζι' },
    { id: 'add_half_puree', he: 'להוסיף גם חצי פירה', el: 'Προσθέστε και μισή μερίδα πουρέ' },
    { id: 'add_half_fries', he: 'להוסיף גם חצי צ\'יפס', el: 'Προσθέστε και μισή μερίδα πατάτες' },
    { id: 'no_veg_at_all', he: 'בלי ירק בכלל', el: 'Χωρίς λαχανικά καθόλου' },
    { id: 'double_amount', he: 'כמות כפולה', el: 'Διπλή ποσότητα' },
    { id: 'no_tomato', he: 'בלי עגבנייה', el: 'Χωρίς ντομάτα' },
    { id: 'pargit_uncut', he: 'פרגית לא חתוכה', el: 'Περγκίτ χωρίς κόψιμο' },
    { id: 'not_heavily_seasoned', he: 'לא מתובל חזק', el: 'Όχι πολύ καρυκευμένο' },
    { id: 'no_lemon', he: 'בלי לימון', el: 'Χωρίς λεμόνι' },
    { id: 'add_cilantro', he: 'להוסיף כוסברה', el: 'Προσθέστε κόλιανδρο' },
    { id: 'fresh_lemon_side', he: 'לימון טרי בצד', el: 'Φρέσκο λεμόνι στο πλάι' },
    { id: 'no-onion', he: 'בלי בצל', el: 'Χωρίς κρεμμύδι' },
    { id: 'spicy', he: 'חריף', el: 'Πικάντικο' },
    { id: 'not-spicy', he: 'לא חריף', el: 'Όχι πικάντικο' },
    { id: 'sauce-side', he: 'רוטב בצד', el: 'Σάλτσα στο πλάι' },
    { id: 'serve-apart', he: 'להגיש בנפרד', el: 'Σερβίρεται ξεχωριστά' },
    { id: 'hold-late', he: 'להוציא מאוחר', el: 'Να βγει αργότερα' },
    { id: 'no-oil', he: 'בלי שמן', el: 'Χωρίς λάδι' },
    { id: 'no-salt', he: 'בלי מלח', el: 'Χωρίς αλάτι' },
  ];
  const NOTE_PRESET_BY_ID = new Map();
  const NOTE_PRESET_BY_HE = new Map();
  const NOTE_PRESET_BY_EL = new Map();
  const NOTE_PRESETS_BY_CATEGORY = {
    starters: ['add_bread_1', 'add_bread_2', 'no_cilantro', 'no_cumin', 'no_olive_oil', 'no_chickpeas', 'no_salt', 'do_not_heat', 'double_2', 'must_be_hot'],
    specials: ['grilled_veg_side', 'no_sweet_potato_puree', 'must_chimichurri', 'no_cilantro', 'large_cut'],
    mains: [
      'side_rice', 'side_fries', 'side_beans', 'side_puree',
      'make_thin', 'no_salt',
      'no_strong_spice', 'not_too_much_sauce', 'all_veg_side',
      'add_half_beans', 'add_half_rice', 'add_half_puree', 'add_half_fries', 'no_veg_at_all',
      'no_sauce',
    ],
    salads: [
      'double_amount', 'no_tomato', 'pargit_uncut', 'not_heavily_seasoned',
      'no_salt', 'no_lemon', 'no_olive_oil', 'add_cilantro', 'fresh_lemon_side',
    ],
  };
  let noteModalCategoryIds = [];
  let noteModalSideFrom = null;

  const HOT_SIDE_SWAP = [
    { key: 'fries', ids: ['fries-side', 'fries-classic'], he: "צ'יפס", el: 'πατάτες' },
    { key: 'rice', ids: ['rice', 'starter-rice'], he: 'אורז', el: 'ρύζι' },
    { key: 'beans', ids: ['green-beans', 'starter-green-beans'], he: 'שעועית', el: 'φασολάκια' },
    { key: 'puree', ids: ['puree', 'starter-puree'], he: 'פירה', el: 'πουρές' },
  ];
  const HOT_SIDE_SWAP_BY_ID = new Map();
  HOT_SIDE_SWAP.forEach((row) => {
    row.ids.forEach((id) => HOT_SIDE_SWAP_BY_ID.set(id, row));
  });
  HOT_SIDE_SWAP.forEach((from) => {
    HOT_SIDE_SWAP.forEach((to) => {
      if (from.key === to.key) return;
      NOTE_PRESETS.push({
        id: `side_swap_${from.key}_${to.key}`,
        he: `במקום ${from.he} שיהיה ${to.he}`,
        el: `Αντί για ${from.el}, ${to.el}`,
      });
    });
  });
  NOTE_PRESETS.forEach((row) => {
    if (!NOTE_PRESET_BY_ID.has(row.id)) NOTE_PRESET_BY_ID.set(row.id, row);
    if (!NOTE_PRESET_BY_HE.has(row.he)) NOTE_PRESET_BY_HE.set(row.he, row);
    if (!NOTE_PRESET_BY_EL.has(row.el)) NOTE_PRESET_BY_EL.set(row.el, row);
  });

  const noteModal = document.getElementById('dish-note-modal');
  const noteModalDish = document.getElementById('dish-note-dish-name');
  const notePresetGrid = document.getElementById('dish-note-presets');
  const noteAsideWrap = document.getElementById('dish-note-aside');
  const noteAsideGrid = document.getElementById('dish-note-aside-presets');
  const noteSwapWrap = document.getElementById('dish-note-side-swap');
  const ASIDE_NOTE_IDS = new Set(['no_sauce']);
  const noteSwapGrid = document.getElementById('dish-note-side-swap-presets');
  const noteOtherBtn = document.getElementById('dish-note-other');
  const noteFreeWrap = document.getElementById('dish-note-free-wrap');
  const noteFreeInput = document.getElementById('dish-note-free');
  const noteErrorEl = document.getElementById('dish-note-error');
  const noteSaveBtn = document.getElementById('dish-note-save');
  const noteCancelBtn = document.getElementById('dish-note-cancel');
  const noteBackdrop = document.getElementById('dish-note-backdrop');

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function isKitchenModifier(item) {
    const id = String(item?.productId || item?.product_id || '');
    return Boolean(
      global.DONENESS_IDS?.has?.(id)
      || global.SHAKE_BASE_IDS?.has?.(id)
      || global.LIMONANA_ALCOHOL_IDS?.has?.(id)
      || id.startsWith('doneness-')
      || id.startsWith('shake-base-')
      || id.startsWith('limonana-alcohol')
    );
  }

  function isStandaloneStarter(item) {
    const id = String(item?.productId || item?.product_id || '');
    return id === 'fries-classic' || id.startsWith('starter-');
  }

  function isAddon(item) {
    if (isStandaloneStarter(item)) return false;
    if (isKitchenModifier(item)) return true;
    return Boolean(item?.linkedToMainItemId || item?.parent_item_id);
  }

  const BAR_ONLY_IDS = new Set(['fruit-plate', 'shabbat-fruit-plate']);

  function barProductIds() {
    const ids = new Set(BAR_ONLY_IDS);
    const wanted = new Set(['coldDrinks', 'hotDrinks', 'cocktails']);
    (global.MENU_DATA?.categories || []).forEach((cat) => {
      if (!wanted.has(String(cat?.id || ''))) return;
      (cat.items || []).forEach((item) => {
        if (item?.id) ids.add(String(item.id));
      });
      (cat.subsections || []).forEach((sub) => {
        (sub.items || []).forEach((item) => {
          if (item?.id) ids.add(String(item.id));
        });
      });
    });
    (global.SHAKE_BASE_ITEMS || []).forEach((item) => {
      if (item?.id) ids.add(String(item.id));
    });
    (global.LIMONANA_ALCOHOL_ITEMS || []).forEach((item) => {
      if (item?.id) ids.add(String(item.id));
    });
    if (global.HAMBURGER_DRINK_IDS && typeof global.HAMBURGER_DRINK_IDS.forEach === 'function') {
      global.HAMBURGER_DRINK_IDS.forEach((id) => ids.add(String(id)));
    }
    return ids;
  }

  function isBarBonItem(item, byId, barIds, seen) {
    if (!item) return false;
    const pid = String(item.productId || '');
    if (global.DONENESS_IDS?.has?.(pid)) return false;
    if (pid && barIds.has(pid)) return true;
    const walk = seen || new Set();
    const id = String(item.itemId || '');
    if (id) {
      if (walk.has(id)) return Boolean(pid && barIds.has(pid));
      walk.add(id);
    }
    if (!item.linkedToMainItemId) return false;
    const parent = byId.get(String(item.linkedToMainItemId));
    if (!parent) return false;
    if (String(parent.productId) === String(global.HAMBURGER_MEAL_ID || 'hamburger-fries')) return true;
    return isBarBonItem(parent, byId, barIds, walk);
  }

  function kitchenBonItems(items) {
    const list = items || [];
    const barIds = barProductIds();
    const byId = new Map();
    list.forEach((item) => {
      if (item?.itemId) byId.set(String(item.itemId), item);
    });
    return list.filter((item) => !isBarBonItem(item, byId, barIds));
  }

  function catalogMenuOrder() {
    const order = new Map();
    let n = 0;
    const add = (id) => {
      const key = String(id || '');
      if (!key || order.has(key)) return;
      order.set(key, n);
      n += 1;
    };
    (global.MENU_DATA?.categories || []).forEach((cat) => {
      (cat.items || []).forEach((item) => add(item.id));
      (cat.subsections || []).forEach((sub) => {
        (sub.items || []).forEach((row) => add(row.id));
      });
    });
    (global.HOT_SIDE_ITEMS || []).forEach((item) => add(item.id));
    return order;
  }

  function compareItems(a, b) {
    const order = catalogMenuOrder();
    const ia = order.has(String(a?.productId || '')) ? order.get(String(a.productId)) : 10000;
    const ib = order.has(String(b?.productId || '')) ? order.get(String(b.productId)) : 10000;
    if (ia !== ib) return ia - ib;
    const ta = Date.parse(a?.createdAt || '') || 0;
    const tb = Date.parse(b?.createdAt || '') || 0;
    if (ta !== tb) return ta - tb;
    return String(a?.itemId || '').localeCompare(String(b?.itemId || ''));
  }

  function isReady(item) {
    return String(item?.kitchenStatus || item?.kitchen_status || '') === 'ready';
  }

  function hasHeOrEl(value) {
    return /[\u0590-\u05FF\u0370-\u03FF]/.test(String(value || ''));
  }

  function catalogPrintName(productId) {
    const id = String(productId || '');
    if (!id) return '';
    const extras = []
      .concat(global.HOT_SIDE_ITEMS || [])
      .concat(global.SHAKE_BASE_ITEMS || [])
      .concat(global.DONENESS_ITEMS || [])
      .concat(global.LIMONANA_ALCOHOL_ITEMS || []);
    const extra = extras.find((row) => String(row.id) === id);
    if (extra?.printName) return String(extra.printName).trim();
    const cats = global.MENU_DATA?.categories || [];
    for (let i = 0; i < cats.length; i += 1) {
      const items = cats[i].items || [];
      for (let j = 0; j < items.length; j += 1) {
        if (String(items[j].id) === id && items[j].printName) return String(items[j].printName).trim();
      }
      const subs = cats[i].subsections || [];
      for (let s = 0; s < subs.length; s += 1) {
        const subItems = subs[s].items || [];
        for (let j = 0; j < subItems.length; j += 1) {
          if (String(subItems[j].id) === id && subItems[j].printName) return String(subItems[j].printName).trim();
        }
      }
    }
    return '';
  }

  function bonName(item) {
    const stored = String(item?.printName || '').trim();
    const catalog = catalogPrintName(item?.productId);
    if (stored && !hasHeOrEl(stored)) return stored;
    if (catalog && !hasHeOrEl(catalog)) return catalog;
    if (stored) return stored;
    return catalog || item?.name || item?.productId || '';
  }

  function notify(title, body, tone) {
    global.LechaimAdminKitchen?.notify?.(title, body, tone ? { tone } : false);
  }

  function mapItem(row, extras) {
    return {
      itemId: String(row.id),
      productId: String(row.product_id || ''),
      name: String(row.product_name || row.print_name || row.product_id || ''),
      printName: String(row.print_name || ''),
      qty: Number(row.quantity) || 0,
      notes: row.notes == null ? '' : String(row.notes),
      notesEl: row.notes_el == null ? '' : String(row.notes_el),
      notesVersion: Number(row.notes_version) || 0,
      notesSeenVersion: Number(row.notes_seen_version) || 0,
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      createdAt: row.created_at || null,
      kitchenStatus: api?.normalizeKitchenStatus?.(row.kitchen_status) || 'waiting',
      kitchenUrgent: Boolean(row.kitchen_urgent),
      wavePrinted: Boolean(extras?.printedAt),
      wavePrintedAt: extras?.printedAt || null,
    };
  }

  function ts(value) {
    const n = Date.parse(value || '');
    return Number.isFinite(n) ? n : 0;
  }

  function flatten(session, orders) {
    const list = [...(orders || [])];
    const hasPrintedWave = list.some((order) => order?.printed_at);
    const items = [];
    list.forEach((order) => {
      if (!order?.printed_at && !hasPrintedWave) return;
      (order.order_items || []).forEach((row) => {
        const mapped = mapItem(row, { printedAt: order.printed_at || null });
        if (mapped.qty > 0) items.push(mapped);
      });
    });
    if (!items.length) return null;
    const kitchenItems = kitchenBonItems(items);
    if (!kitchenItems.length) return null;
    const startedAt = session.kitchen_started_at || null;
    const startedRef = { kitchenStartedAt: startedAt };
    kitchenItems.forEach((item) => {
      item.isLate = Boolean(startedAt)
        && Math.max(ts(item.createdAt), ts(item.wavePrintedAt)) > ts(startedAt) + 800;
    });
    kitchenItems.forEach((item) => {
      if (!item.isLate || !item.linkedToMainItemId) return;
      const parent = kitchenItems.find((row) => String(row.itemId) === String(item.linkedToMainItemId));
      if (parent) parent.isLate = true;
    });
    return {
      sessionId: String(session.session_id),
      tableNumber: Number(session.table_number),
      kitchenAllReady: Boolean(session.kitchen_all_ready),
      kitchenStarted: Boolean(session.kitchen_started_at),
      kitchenStartedAt: startedAt,
      kitchenWaveAckAt: session.kitchen_wave_ack_at || startedAt,
      customerNotes: (sessionApi?.stripPlaceReservationNote
        ? sessionApi.stripPlaceReservationNote(session.notes)
        : String(session.notes || '')).trim(),
      remoteOrders: orders || [],
      items: kitchenItems,
    };
  }

  function hasNewWave(entry) {
    if (!entry?.kitchenStarted) return false;
    const ack = ts(entry.kitchenWaveAckAt) || ts(entry.kitchenStartedAt);
    return (entry.items || []).some((item) => ts(item.createdAt) > ack + 800);
  }

  function counts(items) {
    const progress = global.LechaimKitchenProgress?.fromItems?.(items);
    if (progress) {
      return {
        ready: progress.readyKitchenUnits,
        total: progress.totalKitchenUnits,
        allReady: progress.allReady,
      };
    }
    const list = (items || []).filter((item) => Number(item.qty) > 0 && !isAddon(item));
    const ready = list.filter(isReady).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const total = list.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    return { ready, total, allReady: total > 0 && list.every(isReady) };
  }

  function buildBoard(rows) {
    const next = [];
    (rows || []).forEach(({ session, orders }) => {
      const classified = typesApi?.classifyOrderType?.(session?.order_type, 'admin-kitchen-board') || session?.order_type;
      if (classified !== 'dine_in' && classified !== 'dinein') return;
      const n = Number(session?.table_number);
      if (!Number.isInteger(n) || n < TABLE_MIN || n > TABLE_MAX) return;
      const entry = flatten(session, orders);
      if (!entry) return;
      next.push(entry);
    });
    next.sort((a, b) => a.tableNumber - b.tableNumber);
    return next;
  }

  function groupItems(items) {
    const list = (items || []).filter((item) => Number(item.qty) > 0).sort(compareItems);
    const sidesByParent = new Map();
    list.forEach((item) => {
      if (!item.linkedToMainItemId) return;
      const key = String(item.linkedToMainItemId);
      if (!sidesByParent.has(key)) sidesByParent.set(key, []);
      sidesByParent.get(key).push(item);
    });
    const used = new Set();
    const groups = [];
    list.forEach((item) => {
      if (isAddon(item)) return;
      const sides = (sidesByParent.get(String(item.itemId)) || []).slice().sort(compareItems);
      sides.forEach((side) => used.add(String(side.itemId)));
      groups.push({ main: item, sides });
    });
    list.forEach((item) => {
      if (!isAddon(item) || used.has(String(item.itemId))) return;
      const parent = groups.find((row) => String(row.main.itemId) === String(item.linkedToMainItemId));
      if (parent) {
        parent.sides.push(item);
        used.add(String(item.itemId));
        return;
      }
      if (isKitchenModifier(item)) {
        const target = groups[groups.length - 1];
        if (!target) return;
        target.sides.push(item);
        used.add(String(item.itemId));
        return;
      }
      groups.push({ main: item, sides: [] });
      used.add(String(item.itemId));
    });
    groups.sort((a, b) => compareItems(a.main, b.main));
    return groups;
  }

  function dishHtml(item, isSide, groupReady) {
    const ready = isSide || isAddon(item) ? Boolean(groupReady) : isReady(item);
    const late = !isSide && !isAddon(item) && Boolean(item.isLate) && !ready;
    const qty = Number(item.qty) > 1 || !isSide ? ` × ${escapeHtml(String(item.qty))}` : '';
    const label = isSide || isAddon(item) ? `+ ${bonName(item)}${qty}` : `${bonName(item)}${qty}`;
    const showCheck = !isSide && !isAddon(item);
    const urgent = !isSide && !isAddon(item) && Boolean(item.kitchenUrgent) && !ready;
    const note = displayNoteHe(item);
    const itemId = String(item.itemId || '');
    const noteLine = note ? `<small>${escapeHtml(note)}</small>` : '';
    const noteBtn = (isSide || isAddon(item))
      ? ''
      : `<button type="button" class="kitchen-ready-note-btn${note ? ' has-note' : ''}" data-kitchen-note-open="${escapeHtml(itemId)}">הערה</button>`;
    const urgentBtn = (isSide || isAddon(item) || ready)
      ? ''
      : `<button type="button" class="kitchen-ready-urgent${item.kitchenUrgent ? ' is-on' : ''}" data-kitchen-urgent="${escapeHtml(item.itemId)}">דחוף</button>`;
    return `
      <article class="kitchen-ready-dish${ready ? ' is-ready' : ' is-wait'}${isSide || isAddon(item) ? ' is-side' : ''}${late ? ' is-late' : ''}${urgent ? ' is-urgent' : ''}">
        ${showCheck ? `<span class="kitchen-ready-mark" aria-hidden="true">${ready ? '✓' : ''}</span>` : ''}
        <div class="kitchen-ready-dish__copy">
          <strong>${late ? '<em class="kitchen-ready-new">חדש</em> ' : ''}${escapeHtml(label)}</strong>
          ${noteLine}
        </div>
        ${noteBtn}
        ${urgentBtn}
      </article>
    `;
  }

  function renderDetail() {
    if (!detailEl) return;
    const entry = board.find((row) => row.tableNumber === Number(openTable));
    if (!entry) {
      openTable = null;
      detailEl.hidden = true;
      return;
    }
    const tally = counts(entry.items);
    const allDone = entry.kitchenAllReady && tally.allReady;
    if (detailTitle) detailTitle.textContent = `שולחן ${entry.tableNumber}`;
    const statusText = allDone
      ? '✅ הכל מוכן במטבח'
      : (!entry.kitchenStarted
        ? 'חדש — ממתין למטבח'
        : (hasNewWave(entry)
          ? 'גל חדש — ממתין לאישור במטבח'
          : `בהכנה · ${tally.ready} מתוך ${tally.total} מוכנים`));
    if (detailMeta) {
      detailMeta.innerHTML = escapeHtml(statusText);
    }
    if (detailItems && !noteModalItemId) {
      const groups = groupItems(entry.items);
      detailItems.innerHTML = groups.map((row) => {
        const ready = isReady(row.main);
        const late = Boolean(row.main.isLate) && !ready;
        const urgent = Boolean(row.main.kitchenUrgent) && !ready;
        return `
        <div class="kitchen-ready-group${ready ? ' is-ready' : ' is-wait'}${late ? ' is-late' : ''}${urgent ? ' is-urgent' : ''}">
          ${dishHtml(row.main, false)}
          ${row.sides.map((side) => dishHtml(side, true, ready)).join('')}
        </div>
      `;
      }).join('');
    }
    detailEl.hidden = false;
  }

  function hasUrgent(entry) {
    return (entry?.items || []).some((item) => item.kitchenUrgent && !isAddon(item) && !isReady(item));
  }

  function itemNoteText(item) {
    return String(item?.notesEl || item?.notes || '').trim();
  }

  function isUnreadNote(item) {
    if (!itemNoteText(item)) return false;
    return (Number(item?.notesVersion) || 0) > (Number(item?.notesSeenVersion) || 0);
  }

  function hasUnreadNotes(entry) {
    return (entry?.items || []).some(isUnreadNote);
  }

  function hasAnyNotes(entry) {
    return (entry?.items || []).some((item) => Boolean(itemNoteText(item)));
  }

  const LATE_MS = 20 * 60 * 1000;

  function isOverdue(entry) {
    const tally = counts(entry?.items);
    if (entry?.kitchenAllReady && tally.allReady) return false;
    const waiting = (entry?.items || []).filter((item) => Number(item.qty) > 0 && !isAddon(item) && !isReady(item));
    if (!waiting.length) return false;
    const now = Date.now();
    return waiting.some((item) => {
      const start = ts(item.createdAt);
      return start > 0 && now - start >= LATE_MS;
    });
  }

  function renderBoard() {
    const html = board.map((entry) => {
      const tally = counts(entry.items);
      const allDone = entry.kitchenAllReady && tally.allReady;
      const urgent = !allDone && hasUrgent(entry);
      const fresh = !entry.kitchenStarted && !allDone && !urgent;
      const wave = !fresh && !urgent && hasNewWave(entry) && !allDone;
      const overdue = !allDone && !urgent && !fresh && !wave && isOverdue(entry);
      const note = !allDone && !urgent && !fresh && !wave && !overdue && hasUnreadNotes(entry);
      const hasNotes = hasAnyNotes(entry);
      const stateClass = allDone && !wave
        ? ' is-done'
        : (urgent
          ? ' is-urgent'
          : (fresh
            ? ' is-fresh'
            : (wave
              ? ' is-wave'
              : (overdue ? ' is-late' : (note ? ' is-note' : ' is-cooking')))));
      const face = urgent ? '🫨' : (fresh ? '🥳' : (wave ? '😇' : (overdue ? '⏰' : (note ? '🤓' : ''))));
      const label = allDone
        ? '✅ הכל מוכן'
        : (urgent
          ? 'דחוף'
          : (fresh
            ? 'חדש במטבח'
            : (wave
              ? 'גל חדש'
              : (overdue
                ? 'מעל 20 דק׳'
                : (note
                  ? 'הערה חדשה'
                  : `בהכנה · ${escapeHtml(String(tally.ready))} מתוך ${escapeHtml(String(tally.total))}`)))));
      return `
        <button type="button" class="kitchen-ready-card${stateClass}${hasNotes ? ' has-notes' : ''}" data-kitchen-table="${escapeHtml(String(entry.tableNumber))}">
          ${face ? `<span class="kitchen-ready-card__face" aria-hidden="true">${face}</span>` : ''}
          <strong>שולחן ${escapeHtml(String(entry.tableNumber))}</strong>
          <span>${label}</span>
          ${global.LechaimKitchenProgress?.barHtml?.(
            global.LechaimKitchenProgress.fromItems(entry.items),
            { compact: true, className: 'kitchen-ready-kprog' }
          ) || ''}
        </button>
      `;
    }).join('');
    if (gridEl) gridEl.innerHTML = html;
    if (emptyEl) emptyEl.hidden = board.length > 0;
    if (openTable != null) renderDetail();
  }

  async function loadBoard() {
    if (!api?.getOpenSessionsWithOrders) return;
    try {
      const rows = await api.getOpenSessionsWithOrders();
      const next = buildBoard(rows);
      if (boardPrimed) {
        next.forEach((entry) => {
          if (!seenSessions.has(entry.sessionId) && !entry.kitchenStarted) {
            notify('מטבח', `שולחן ${entry.tableNumber} — הזמנה חדשה`);
          }
        });
      }
      seenSessions = new Set(next.map((entry) => entry.sessionId));
      boardPrimed = true;
      board = next;
      renderBoard();
    } catch (err) {
      console.warn('[admin-kitchen-board] load failed', err);
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => loadBoard(), 200);
  }

  function findTableForItem(itemId, orderId) {
    const id = String(itemId || '');
    const order = String(orderId || '');
    for (const entry of board) {
      if (entry.items.some((item) => item.itemId === id)) return entry.tableNumber;
    }
    return null;
  }

  function onRealtime(payload) {
    const table = payload?.table;
    const event = payload?.eventType || payload?.event;
    const row = payload?.new || payload?.old;

    if (table === 'order_items' && event === 'UPDATE') {
      const prev = api?.normalizeKitchenStatus?.(payload?.old?.kitchen_status);
      const next = api?.normalizeKitchenStatus?.(payload?.new?.kitchen_status);
      if (prev !== next && (next === 'ready' || prev === 'ready')) {
        const mapped = {
          itemId: payload?.new?.id,
          productId: payload?.new?.product_id,
          linkedToMainItemId: payload?.new?.parent_item_id,
          parent_item_id: payload?.new?.parent_item_id,
          printName: payload?.new?.print_name,
          name: payload?.new?.product_name,
        };
        const isExtra = isAddon(mapped)
          || isBarBonItem(mapped, new Map(), barProductIds());
        if (!isExtra) {
          const name = String(payload?.new?.product_name || payload?.new?.print_name || 'מנה');
          const qty = Number(payload?.new?.quantity) || 1;
          const tableNo = findTableForItem(payload?.new?.id, payload?.new?.order_id);
          const where = tableNo ? ` — שולחן ${tableNo}` : '';
          if (next === 'ready') {
            notify('מטבח', `${name} ×${qty} מוכן${where}`);
          } else {
            notify('מטבח', `${name} ×${qty} הוחזר להכנה${where}`);
          }
        }
      }
    }

    if (table === 'order_sessions' && event === 'UPDATE') {
      const now = Boolean(payload?.new?.kitchen_all_ready);
      const hadOld = payload?.old && Object.prototype.hasOwnProperty.call(payload.old, 'kitchen_all_ready');
      const was = hadOld ? Boolean(payload.old.kitchen_all_ready) : now;
      if (hadOld && !was && now) {
        const n = Number(payload?.new?.table_number);
        notify('מטבח', Number.isInteger(n) ? `כל ההזמנה של שולחן ${n} מוכנה` : 'כל ההזמנה מוכנה', 'ready');
      }
      const hadStarted = payload?.old && Object.prototype.hasOwnProperty.call(payload.old, 'kitchen_started_at');
      if (hadStarted && !payload.old.kitchen_started_at && payload?.new?.kitchen_started_at) {
        const n = Number(payload?.new?.table_number);
        notify('מטבח', Number.isInteger(n) ? `שולחן ${n} — התחילו להכין` : 'המטבח התחיל להכין');
      }
    }

    scheduleRefresh();
  }

  function setPane(pane) {
    currentPane = pane === 'tables' ? 'tables' : 'alerts';
    document.querySelectorAll('[data-kitchen-pane]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.kitchenPane === currentPane);
    });
    if (paneAlerts) paneAlerts.hidden = currentPane !== 'alerts';
    if (paneTables) paneTables.hidden = currentPane !== 'tables';
    if (currentPane !== 'tables') {
      openTable = null;
      if (detailEl) detailEl.hidden = true;
    }
  }

  function start() {
    if (active) return;
    active = true;
    loadBoard();
    if (api?.subscribeToOrders) {
      unsubscribe = api.subscribeToOrders(onRealtime);
    }
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => loadBoard(), 4000);
  }

  function stop() {
    active = false;
    window.clearTimeout(refreshTimer);
    window.clearInterval(pollTimer);
    pollTimer = null;
    if (typeof unsubscribe === 'function') unsubscribe();
    unsubscribe = null;
  }

  document.querySelectorAll('[data-kitchen-pane]').forEach((btn) => {
    btn.addEventListener('click', () => setPane(btn.dataset.kitchenPane));
  });

  gridEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-kitchen-table]');
    if (!btn) return;
    openTable = Number(btn.dataset.kitchenTable);
    renderDetail();
  });

  document.getElementById('kitchen-ready-detail-close')?.addEventListener('click', () => {
    openTable = null;
    if (detailEl) detailEl.hidden = true;
  });

  function uniqueNoteIds(ids) {
    const seen = new Set();
    const next = [];
    (ids || []).forEach((id) => {
      const key = String(id || '');
      if (!key || seen.has(key) || !NOTE_PRESET_BY_ID.has(key)) return;
      seen.add(key);
      next.push(key);
    });
    return next;
  }

  function catalogCategoryId(productId) {
    const id = String(productId || '');
    if (!id) return '';
    const cats = global.MENU_DATA?.categories || [];
    for (let i = 0; i < cats.length; i += 1) {
      const cat = cats[i];
      const catId = String(cat?.id || '');
      if ((cat.items || []).some((row) => String(row?.id) === id)) return catId;
      const subs = cat.subsections || [];
      for (let s = 0; s < subs.length; s += 1) {
        if ((subs[s].items || []).some((row) => String(row?.id) === id)) return catId;
      }
    }
    return '';
  }

  function noteIdsForItem(item) {
    const fromCatalog = catalogCategoryId(item?.productId);
    const stored = String(item?.category || item?.category_id || '').trim();
    const categoryId = NOTE_PRESETS_BY_CATEGORY[fromCatalog]
      ? fromCatalog
      : (NOTE_PRESETS_BY_CATEGORY[stored] ? stored : fromCatalog);
    return uniqueNoteIds(NOTE_PRESETS_BY_CATEGORY[categoryId] || []);
  }

  function visibleNotePresets() {
    const seen = new Set();
    const list = [];
    const add = (id) => {
      const key = String(id || '');
      if (!key || seen.has(key) || isSideSwapPresetId(key) || ASIDE_NOTE_IDS.has(key)) return;
      const row = NOTE_PRESET_BY_ID.get(key);
      if (!row) return;
      seen.add(key);
      list.push(row);
    };
    (noteModalCategoryIds || []).forEach(add);
    [...noteModalSelected].forEach(add);
    return list;
  }

  function visibleAsideNotePresets() {
    const ids = [];
    const add = (id) => {
      const key = String(id || '');
      if (!ASIDE_NOTE_IDS.has(key) || ids.includes(key)) return;
      if (NOTE_PRESET_BY_ID.get(key)) ids.push(key);
    };
    (noteModalCategoryIds || []).forEach(add);
    [...noteModalSelected].forEach(add);
    return ids.map((id) => NOTE_PRESET_BY_ID.get(id)).filter(Boolean);
  }

  function isSideSwapPresetId(id) {
    return String(id || '').startsWith('side_swap_');
  }

  function matchPresetByText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    return NOTE_PRESET_BY_HE.get(raw) || NOTE_PRESET_BY_EL.get(raw) || null;
  }

  function parseStoredNote(he) {
    const raw = String(he || '').trim();
    const selected = new Set();
    const leftover = [];
    if (!raw) return { selected, freeHe: '' };
    raw.split(/\s*·\s*|\s*,\s*/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
      const preset = matchPresetByText(part);
      if (preset) selected.add(preset.id);
      else leftover.push(part);
    });
    return { selected, freeHe: leftover.join(NOTE_JOIN) };
  }

  function displayNoteHe(item) {
    const raw = String(item?.notes || '').trim();
    if (!raw) return '';
    const parsed = parseStoredNote(raw);
    return composeNoteHe(parsed.selected, parsed.freeHe) || raw;
  }

  function attachedHotSide(item) {
    if (!item?.itemId) return null;
    const entry = board.find((row) => row.tableNumber === Number(openTable));
    const kids = (entry?.items || []).filter((row) => (
      String(row.linkedToMainItemId || '') === String(item.itemId)
      && Number(row.qty) > 0
      && !isKitchenModifier(row)
    ));
    const sides = kids
      .map((row) => HOT_SIDE_SWAP_BY_ID.get(String(row.productId || '')))
      .filter(Boolean);
    if (!sides.length) return null;
    const keys = new Set(sides.map((row) => row.key));
    if (keys.size !== 1) return null;
    return sides[0];
  }

  function swapPresetsForCurrentSide() {
    if (!noteModalSideFrom) return [];
    return HOT_SIDE_SWAP
      .filter((to) => to.key !== noteModalSideFrom.key)
      .map((to) => NOTE_PRESET_BY_ID.get(`side_swap_${noteModalSideFrom.key}_${to.key}`))
      .filter(Boolean);
  }

  function swapChipLabel(preset) {
    const match = String(preset?.id || '').match(/^side_swap_([a-z]+)_([a-z]+)$/);
    if (!match) return preset?.he || '';
    const from = HOT_SIDE_SWAP.find((row) => row.key === match[1]);
    const to = HOT_SIDE_SWAP.find((row) => row.key === match[2]);
    if (!from || !to) return preset?.he || '';
    return `${from.he} → ${to.he}`;
  }

  function composeNoteHe(presetIds, freeHe) {
    const labels = NOTE_PRESETS.filter((row) => presetIds.has(row.id)).map((row) => row.he);
    const free = String(freeHe || '').trim();
    if (free) labels.push(free);
    return labels.join(NOTE_JOIN);
  }

  function composeNoteEl(presetIds, freeEl) {
    const labels = NOTE_PRESETS.filter((row) => presetIds.has(row.id)).map((row) => row.el);
    const free = String(freeEl || '').trim();
    if (free) labels.push(free);
    return labels.join(NOTE_JOIN);
  }

  function findOpenItem(itemId) {
    const entry = board.find((row) => row.tableNumber === Number(openTable));
    return (entry?.items || []).find((row) => String(row.itemId) === String(itemId || '')) || null;
  }

  function setNoteError(message) {
    if (!noteErrorEl) return;
    const text = String(message || '').trim();
    noteErrorEl.textContent = text;
    noteErrorEl.hidden = !text;
  }

  function renderNotePresets() {
    if (!notePresetGrid) return;
    notePresetGrid.innerHTML = visibleNotePresets().map((row) => `
      <button type="button" class="dish-note-chip${noteModalSelected.has(row.id) ? ' is-on' : ''}" data-dish-note-preset="${escapeHtml(row.id)}">
        <span class="dish-note-chip__mark" aria-hidden="true">${noteModalSelected.has(row.id) ? '✓' : ''}</span>
        ${escapeHtml(row.he)}
      </button>
    `).join('');
    const asideRows = visibleAsideNotePresets();
    if (noteAsideWrap) noteAsideWrap.hidden = asideRows.length === 0;
    if (noteAsideGrid) {
      noteAsideGrid.innerHTML = asideRows.map((row) => `
        <button type="button" class="dish-note-chip dish-note-chip--aside${noteModalSelected.has(row.id) ? ' is-on' : ''}" data-dish-note-preset="${escapeHtml(row.id)}">
          <span class="dish-note-chip__mark" aria-hidden="true">${noteModalSelected.has(row.id) ? '✓' : ''}</span>
          ${escapeHtml(row.he)}
        </button>
      `).join('');
    }
    const swapRows = swapPresetsForCurrentSide();
    const extraSwaps = [...noteModalSelected]
      .map((id) => NOTE_PRESET_BY_ID.get(id))
      .filter((row) => row && isSideSwapPresetId(row.id) && !swapRows.some((item) => item.id === row.id));
    const allSwaps = swapRows.concat(extraSwaps);
    if (noteSwapWrap) noteSwapWrap.hidden = allSwaps.length === 0;
    if (noteSwapGrid) {
      noteSwapGrid.innerHTML = allSwaps.map((row) => `
        <button type="button" class="dish-note-chip dish-note-chip--swap${noteModalSelected.has(row.id) ? ' is-on' : ''}" data-dish-note-preset="${escapeHtml(row.id)}">
          <span class="dish-note-chip__mark" aria-hidden="true">${noteModalSelected.has(row.id) ? '✓' : ''}</span>
          ${escapeHtml(swapChipLabel(row))}
        </button>
      `).join('');
    }
    if (noteOtherBtn) {
      noteOtherBtn.classList.toggle('is-on', noteModalOther);
      noteOtherBtn.setAttribute('aria-pressed', noteModalOther ? 'true' : 'false');
      const mark = noteOtherBtn.querySelector('.dish-note-chip__mark');
      if (mark) mark.textContent = noteModalOther ? '✓' : '';
    }
    if (noteFreeWrap) noteFreeWrap.hidden = !noteModalOther;
  }

  function closeNoteModal() {
    noteModalItemId = '';
    noteModalSelected = new Set();
    noteModalCategoryIds = [];
    noteModalSideFrom = null;
    noteModalOther = false;
    if (typeof noteFocusRelease === 'function') noteFocusRelease();
    noteFocusRelease = null;
    if (noteFreeInput) noteFreeInput.value = '';
    if (noteSwapWrap) noteSwapWrap.hidden = true;
    if (noteAsideWrap) noteAsideWrap.hidden = true;
    noteModal?.querySelector('.dish-note-modal__panel')?.classList.remove('dish-note-modal__panel--mains');
    setNoteError('');
    if (noteSaveBtn) {
      noteSaveBtn.disabled = false;
      noteSaveBtn.textContent = 'שמור הערה';
    }
    if (noteModal) {
      noteModal.hidden = true;
      noteModal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('admin-modal-open');
  }

  function openNoteModal(itemId) {
    const item = findOpenItem(itemId);
    if (!item || !noteModal) return;
    const parsed = parseStoredNote(item.notes);
    noteModalItemId = String(item.itemId);
    noteModalCategoryIds = noteIdsForItem(item);
    noteModalSideFrom = attachedHotSide(item);
    noteModalSelected = parsed.selected;
    noteModalOther = Boolean(parsed.freeHe);
    if (noteModalDish) noteModalDish.textContent = bonName(item);
    if (noteFreeInput) noteFreeInput.value = parsed.freeHe;
    setNoteError('');
    const panel = noteModal.querySelector('.dish-note-modal__panel');
    const isMains = catalogCategoryId(item.productId) === 'mains'
      || (NOTE_PRESETS_BY_CATEGORY.mains || []).some((id) => (noteModalCategoryIds || []).includes(id));
    panel?.classList.toggle('dish-note-modal__panel--mains', isMains);
    renderNotePresets();
    noteModal.hidden = false;
    noteModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    if (typeof noteFocusRelease === 'function') noteFocusRelease();
    const release = global.LechaimFocusTrap?.activate?.(noteModal);
    noteFocusRelease = typeof release === 'function' ? release : null;
    (noteModalOther ? noteFreeInput : notePresetGrid?.querySelector('button'))?.focus?.();
  }

  async function saveNoteModal() {
    const id = noteModalItemId;
    if (!id || !api?.updateItemNotes) return;
    const item = findOpenItem(id);
    if (!item) return;
    let freeHe = noteModalOther ? String(noteFreeInput?.value || '').trim() : '';
    if (freeHe) {
      const known = matchPresetByText(freeHe);
      if (known) {
        noteModalSelected.add(known.id);
        freeHe = '';
        if (noteFreeInput) noteFreeInput.value = '';
        noteModalOther = false;
      }
    }
    const notesHe = composeNoteHe(noteModalSelected, freeHe);
    if (!notesHe) {
      try {
        if (noteSaveBtn) {
          noteSaveBtn.disabled = true;
          noteSaveBtn.textContent = 'שומר…';
        }
        await api.updateItemNotes(id, '', '');
        item.notes = '';
        item.notesEl = '';
        closeNoteModal();
        renderBoard();
      } catch (err) {
        console.warn('[admin-kitchen-board] note clear failed', err);
        setNoteError('לא הצלחנו לשמור את ההערה. נסה שוב.');
        if (noteSaveBtn) {
          noteSaveBtn.disabled = false;
          noteSaveBtn.textContent = 'שמור הערה';
        }
      }
      return;
    }

    let freeEl = '';
    if (freeHe) {
      if (!api.translateNoteHeToEl) {
        setNoteError('לא הצלחנו לתרגם את ההערה. נסה שוב.');
        return;
      }
      try {
        if (noteSaveBtn) {
          noteSaveBtn.disabled = true;
          noteSaveBtn.textContent = 'מתרגם…';
        }
        setNoteError('');
        freeEl = await api.translateNoteHeToEl(freeHe);
      } catch (err) {
        console.warn('[admin-kitchen-board] note translate failed', err);
        const msg = String(err?.message || '');
        setNoteError(/not_configured|Failed to send|FunctionsHttpError|Function not found/i.test(msg)
          ? 'שירות התרגום לא זמין. בחרו הערה מוכנה, או בדקו את translate-note ב-Supabase.'
          : 'לא הצלחנו לתרגם את ההערה. נסה שוב.');
        if (noteSaveBtn) {
          noteSaveBtn.disabled = false;
          noteSaveBtn.textContent = 'שמור הערה';
        }
        return;
      }
    }

    const notesEl = composeNoteEl(noteModalSelected, freeEl);
    if (!notesEl) {
      setNoteError('לא הצלחנו לתרגם את ההערה. נסה שוב.');
      if (noteSaveBtn) {
        noteSaveBtn.disabled = false;
        noteSaveBtn.textContent = 'שמור הערה';
      }
      return;
    }

    try {
      if (noteSaveBtn) {
        noteSaveBtn.disabled = true;
        noteSaveBtn.textContent = 'שומר…';
      }
      await api.updateItemNotes(id, notesHe, notesEl);
      item.notes = notesHe;
      item.notesEl = notesEl;
      closeNoteModal();
      renderBoard();
    } catch (err) {
      console.warn('[admin-kitchen-board] note save failed', err);
      const missing = /notes_el/i.test(String(err?.message || ''));
      setNoteError(missing
        ? 'חסרה עמודת notes_el — הריצו supabase-order-item-notes-el.sql'
        : 'לא הצלחנו לשמור את ההערה. נסה שוב.');
      if (noteSaveBtn) {
        noteSaveBtn.disabled = false;
        noteSaveBtn.textContent = 'שמור הערה';
      }
    }
  }

  function onNotePresetClick(event) {
    const btn = event.target.closest('[data-dish-note-preset]');
    if (!btn) return;
    const id = String(btn.dataset.dishNotePreset || '');
    if (!id) return;
    if (noteModalSelected.has(id)) {
      noteModalSelected.delete(id);
    } else {
      if (isSideSwapPresetId(id)) {
        [...noteModalSelected].forEach((key) => {
          if (isSideSwapPresetId(key)) noteModalSelected.delete(key);
        });
      }
      noteModalSelected.add(id);
    }
    renderNotePresets();
  }
  notePresetGrid?.addEventListener('click', onNotePresetClick);
  noteAsideGrid?.addEventListener('click', onNotePresetClick);
  noteSwapGrid?.addEventListener('click', onNotePresetClick);

  noteOtherBtn?.addEventListener('click', () => {
    noteModalOther = !noteModalOther;
    if (!noteModalOther && noteFreeInput) noteFreeInput.value = '';
    renderNotePresets();
    if (noteModalOther) noteFreeInput?.focus();
  });

  noteCancelBtn?.addEventListener('click', closeNoteModal);
  noteBackdrop?.addEventListener('click', closeNoteModal);
  noteSaveBtn?.addEventListener('click', () => {
    saveNoteModal();
  });
  noteModal?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNoteModal();
    }
  });

  detailItems?.addEventListener('click', async (event) => {
    const noteBtn = event.target.closest('[data-kitchen-note-open]');
    if (noteBtn) {
      const id = String(noteBtn.dataset.kitchenNoteOpen || '');
      if (id) openNoteModal(id);
      return;
    }

    const btn = event.target.closest('[data-kitchen-urgent]');
    if (!btn || !api?.updateItemKitchenUrgent) return;
    const id = String(btn.dataset.kitchenUrgent || '');
    const entry = board.find((row) => row.tableNumber === Number(openTable));
    const item = (entry?.items || []).find((row) => String(row.itemId) === id);
    if (!item || isAddon(item)) return;
    const next = !Boolean(item.kitchenUrgent);
    try {
      await api.updateItemKitchenUrgent(id, next);
      item.kitchenUrgent = next;
      renderBoard();
    } catch (err) {
      console.warn('[admin-kitchen-board] urgent save failed', err);
    }
  });

  global.LechaimAdminKitchenBoard = { start, stop, refresh: loadBoard };
})(window);
