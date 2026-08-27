/**
 * LECHAIM — Kitchen tables board inside kitchen.html.
 * Same Supabase orders as admin. Does not print, close tables, or change prices.
 */
(function (global) {
  'use strict';

  const api = global.LechaimSupabaseOrders;
  const i18n = global.LechaimKitchenI18n;
  const sessionApi = global.LechaimOrderSession;
  const typesApi = global.LechaimOrderTypes;

  const gridEl = document.getElementById('kt-tables-grid');
  const statusEl = document.getElementById('kt-status');
  const drawerEl = document.getElementById('kt-table-sheet');
  const drawerTitle = document.getElementById('kt-table-title');
  const drawerMeta = document.getElementById('kt-table-meta');
  const drawerItems = document.getElementById('kt-table-items');
  const viewTables = document.getElementById('kt-view-tables');
  const viewAlerts = document.getElementById('kt-view-alerts');

  const TABLE_MIN = sessionApi?.TABLE_MIN || 60;
  const TABLE_MAX = sessionApi?.TABLE_MAX || 73;

  if (!gridEl) return;

  let board = [];
  let openTable = null;
  let currentTab = 'tables';
  let refreshTimer = null;
  let sending = false;
  let primed = false;
  let audioCtx = null;

  function lang() {
    return i18n?.getLang?.() || 'el';
  }

  function txt(key) {
    return i18n?.t?.(lang(), key) || key;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function setError(text) {
    if (!statusEl) return;
    if (!text) {
      if (statusEl.classList.contains('is-err')) {
        statusEl.textContent = '';
        statusEl.classList.remove('is-err');
      }
      return;
    }
    statusEl.textContent = text;
    statusEl.classList.add('is-err');
  }

  function formatClock(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatElapsed(iso) {
    if (!iso) return '—';
    const start = new Date(iso).getTime();
    if (Number.isNaN(start)) return '—';
    const mins = Math.floor(Math.max(0, Date.now() - start) / 60000);
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    if (hours > 0) return `${hours}:${String(remaining).padStart(2, '0')}`;
    return `${mins}′`;
  }

  function kitchenStatus(value) {
    return api?.normalizeKitchenStatus?.(value) || 'waiting';
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

  function statusLabel(uiStatus) {
    if (uiStatus === 'pending_print') return txt('tableNew');
    if (uiStatus === 'preparing') return txt('tableWaitPrint');
    if (uiStatus === 'active') return txt('tableActive');
    if (uiStatus === 'bill_requested') return txt('tableBill');
    return txt('tableFree');
  }

  function dishStatusLabel(status) {
    if (status === 'preparing') return txt('dishPrep');
    if (status === 'ready') return txt('dishReady');
    return txt('dishWait');
  }

  function dishName(item) {
    return bonName(item);
  }

  function extraNameSet() {
    const names = new Set();
    []
      .concat(global.HOT_SIDE_ITEMS || [])
      .concat(global.DONENESS_ITEMS || [])
      .forEach((row) => {
        if (row?.id) names.add(String(row.id).toLowerCase());
        if (row?.name) names.add(String(row.name).trim().toLowerCase());
        if (row?.printName) names.add(String(row.printName).trim().toLowerCase());
      });
    return names;
  }

  function isAddon(item) {
    if (item?.linkedToMainItemId || item?.parent_item_id) return true;
    const id = String(item?.productId || item?.product_id || '');
    if (
      global.HOT_SIDE_IDS?.has?.(id)
      || global.DONENESS_IDS?.has?.(id)
      || global.SHAKE_BASE_IDS?.has?.(id)
      || global.LIMONANA_ALCOHOL_IDS?.has?.(id)
      || id.startsWith('doneness-')
      || id.startsWith('shake-base-')
      || id.startsWith('limonana-alcohol')
    ) return true;
    const names = extraNameSet();
    if (id && names.has(id.toLowerCase())) return true;
    const label = String(item?.printName || item?.print_name || item?.name || item?.product_name || '')
      .trim()
      .toLowerCase();
    return Boolean(label && names.has(label));
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

  function isFresh(entry) {
    return Boolean(entry?.order?.sessionId) && !entry.order.kitchenStarted;
  }

  function ts(value) {
    const n = Date.parse(value || '');
    return Number.isFinite(n) ? n : 0;
  }

  function hasNewWave(entry) {
    const order = entry?.order;
    if (!order?.kitchenStarted) return false;
    const ack = ts(order.kitchenWaveAckAt) || ts(order.kitchenStartedAt);
    return (order.items || []).some((item) => ts(item.createdAt) > ack + 800);
  }

  function waveChimeKey(entry) {
    const order = entry?.order;
    if (!order?.sessionId || !hasNewWave(entry)) return '';
    let latest = 0;
    (order.items || []).forEach((item) => {
      latest = Math.max(latest, ts(item.createdAt));
    });
    return `${order.sessionId}:wave:${latest}`;
  }

  function isLateItem(item, order) {
    if (!item || !order?.kitchenStartedAt) return false;
    return Math.max(ts(item.createdAt), ts(item.wavePrintedAt)) > ts(order.kitchenStartedAt) + 800;
  }

  function cardTone(status) {
    if (status === 'pending_print') return 'new';
    if (status === 'preparing') return 'waitprint';
    if (status === 'bill_requested') return 'bill';
    if (status === 'active') return 'active';
    return 'free';
  }

  function isPrinted(order) {
    return Boolean(order?.printed_at);
  }

  function playNewTicketChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      [
        { freq: 523, at: 0, dur: 0.18 },
        { freq: 784, at: 0.16, dur: 0.22 },
        { freq: 1046, at: 0.34, dur: 0.32 },
      ].forEach((tone) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.32, now + tone.at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (_) { /* ignore */ }
  }

  function unlockAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch (_) { /* ignore */ }
  }

  function mapItem(row, extras) {
    return {
      itemId: String(row.id),
      orderId: extras.orderId ? String(extras.orderId) : (row.order_id ? String(row.order_id) : ''),
      productId: String(row.product_id || ''),
      name: String(row.product_name || row.print_name || row.product_id || ''),
      printName: String(row.print_name || ''),
      qty: Number(row.quantity) || 0,
      price: Number(row.price) || 0,
      notes: row.notes == null ? '' : String(row.notes),
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      createdAt: row.created_at || extras.createdAt || null,
      kitchenStatus: kitchenStatus(row.kitchen_status),
      wavePrinted: Boolean(extras.wavePrinted),
      wavePrintedAt: extras.printedAt || null,
    };
  }

  function flattenDineIn(session, orders) {
    const list = [...(orders || [])];
    const hasPrintedWave = list.some(isPrinted);
    const items = [];
    list.forEach((order) => {
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      const wavePrinted = isPrinted(order);
      if (!wavePrinted && !hasPrintedWave) return;
      lines.forEach((row) => {
        const mapped = mapItem(row, {
          wavePrinted,
          createdAt: row.created_at || order.created_at,
          printedAt: order.printed_at || null,
          orderId: order.id,
        });
        if (mapped.qty > 0) items.push(mapped);
      });
    });
    const kitchenItems = kitchenBonItems(items);
    const startedAt = session.kitchen_started_at || null;
    const startedRef = { kitchenStartedAt: startedAt };
    kitchenItems.forEach((item) => {
      item.isLate = isLateItem(item, startedRef);
    });
    kitchenItems.forEach((item) => {
      if (!item.isLate || !item.linkedToMainItemId) return;
      const parent = kitchenItems.find((row) => String(row.itemId) === String(item.linkedToMainItemId));
      if (parent) parent.isLate = true;
    });
    return {
      sessionId: String(session.session_id),
      tableNumber: Number(session.table_number),
      createdAt: session.created_at || null,
      billRequested: Boolean(session.bill_requested || session.status === 'bill_requested'),
      kitchenAllReady: Boolean(session.kitchen_all_ready),
      kitchenStarted: Boolean(session.kitchen_started_at),
      kitchenStartedAt: session.kitchen_started_at || null,
      kitchenWaveAckAt: session.kitchen_wave_ack_at || session.kitchen_started_at || null,
      customerNotes: (sessionApi?.stripPlaceReservationNote
        ? sessionApi.stripPlaceReservationNote(session.notes)
        : String(session.notes || '')).trim(),
      items: kitchenItems,
      remoteOrders: orders || [],
    };
  }

  function resolveUiStatus(entry) {
    if (!entry) return 'free';
    if (entry.billRequested) return 'bill_requested';
    const waves = entry.remoteOrders || [];
    const live = waves.filter((order) => (order.order_items || []).some((row) => Number(row.quantity) > 0));
    if (live.some((order) => !isPrinted(order) && String(order.status || 'submitted') === 'submitted')) {
      return 'pending_print';
    }
    if (live.some((order) => !isPrinted(order) && String(order.status || '') === 'preparing')) {
      return 'preparing';
    }
    return 'active';
  }

  function compareItems(a, b) {
    const ta = Date.parse(a?.createdAt || '') || 0;
    const tb = Date.parse(b?.createdAt || '') || 0;
    if (ta !== tb) return ta - tb;
    return String(a?.itemId || '').localeCompare(String(b?.itemId || ''));
  }

  function countableItems(items) {
    return (items || []).filter((item) => Number(item.qty) > 0 && !isAddon(item));
  }

  function itemStats(items) {
    const stats = { waiting: 0, preparing: 0, ready: 0 };
    countableItems(items).forEach((item) => {
      const qty = Number(item.qty) || 0;
      if (qty <= 0) return;
      stats[item.kitchenStatus === 'preparing' || item.kitchenStatus === 'ready' ? item.kitchenStatus : 'waiting'] += qty;
    });
    return stats;
  }

  function statsHtml(items) {
    const stats = itemStats(items);
    if (!(stats.waiting + stats.preparing + stats.ready)) return '';
    return `
      <span class="kt-kstat">
        ${stats.waiting ? `<span class="kt-kstat__item is-wait">${escapeHtml(String(stats.waiting))} ${escapeHtml(txt('waitCount'))}</span>` : ''}
        ${stats.preparing ? `<span class="kt-kstat__item is-prep">${escapeHtml(String(stats.preparing))} ${escapeHtml(txt('prepCount'))}</span>` : ''}
        ${stats.ready ? `<span class="kt-kstat__item is-ready">${escapeHtml(String(stats.ready))} ${escapeHtml(txt('readyCount'))}</span>` : ''}
      </span>
    `;
  }

  function buildBoard(rows) {
    const byTable = new Map();
    (rows || []).forEach(({ session, orders }) => {
      const classified = typesApi?.classifyOrderType?.(session?.order_type, 'kitchen-board') || session?.order_type;
      if (classified !== 'dine_in' && classified !== 'dinein') return;
      const n = Number(session?.table_number);
      if (!Number.isInteger(n) || n < TABLE_MIN || n > TABLE_MAX) return;
      byTable.set(n, flattenDineIn(session, orders));
    });

    const next = [];
    for (let n = TABLE_MIN; n <= TABLE_MAX; n += 1) {
      const match = byTable.get(n) || null;
      if (!match || !match.items.length) continue;
      next.push({
        tableNumber: n,
        uiStatus: resolveUiStatus(match),
        order: match,
        itemCount: countableItems(match.items).reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
        openedAt: match.createdAt || null,
      });
    }
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
      const target = parent || groups[groups.length - 1];
      if (!target) return;
      target.sides.push(item);
      used.add(String(item.itemId));
    });
    groups.sort((a, b) => {
      const aLate = a.main.isLate && !isDishReady(a.main) ? 0 : 1;
      const bLate = b.main.isLate && !isDishReady(b.main) ? 0 : 1;
      if (aLate !== bLate) return aLate - bLate;
      return compareItems(a.main, b.main);
    });
    return groups;
  }

  function isDishReady(item) {
    return (item?.kitchenStatus || 'waiting') === 'ready';
  }

  function readyCounts(items) {
    const list = countableItems(items);
    const ready = list.filter(isDishReady).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const total = list.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    return { ready, total, allReady: total > 0 && list.every(isDishReady) };
  }

  function dishActions(item) {
    if (!item?.itemId || isAddon(item)) return '';
    const ready = isDishReady(item);
    return `
      <button type="button"
        class="kt-ready${ready ? ' is-on' : ''}"
        data-kt-dish-toggle="${escapeHtml(item.itemId)}"
        aria-pressed="${ready ? 'true' : 'false'}"
        aria-label="${escapeHtml(ready ? txt('dishReady') : txt('dishWait'))}"
      ></button>
    `;
  }

  function noteHtml(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    return `<p class="kt-dish__notes" data-kt-note="${escapeHtml(raw)}">${escapeHtml(raw)}</p>`;
  }

  async function hydrateNotes(root) {
    if (!root) return;
    const nodes = [...root.querySelectorAll('[data-kt-note]')];
    if (!nodes.length) return;
    const showEl = lang() !== 'he';
    await Promise.all(nodes.map(async (node) => {
      const src = node.getAttribute('data-kt-note') || '';
      if (!showEl) {
        node.textContent = src;
        return;
      }
      const translated = await i18n.toGreek?.(src);
      node.textContent = translated || src;
    }));
  }

  function renderSide(item, groupReady) {
    const qty = Number(item.qty) || 1;
    return `
      <div class="kt-dish kt-dish--side ${groupReady ? 'is-ready' : 'is-waiting'}">
        <span class="kt-dish__name">+ ${escapeHtml(dishName(item))}${qty > 1 ? ` × ${escapeHtml(String(qty))}` : ''}</span>
        ${noteHtml(item.notes)}
      </div>
    `;
  }

  function unitSides(sides, parentQty, unitIndex) {
    const units = Math.max(1, Number(parentQty) || 1);
    return (sides || []).map((side) => {
      const sq = Number(side.qty) || 1;
      const per = sq / units;
      if (Number.isInteger(per) && per >= 1) {
        return { ...side, qty: per };
      }
      if (unitIndex === 0) return side;
      return { ...side, qty: 0 };
    }).filter((side) => Number(side.qty) > 0);
  }

  function renderDish(item, sides) {
    const ready = isDishReady(item);
    const late = Boolean(item.isLate) && !ready;
    const qty = Number(item.qty) || 1;
    const kids = (sides || []).map((side) => renderSide(side, ready)).join('');
    return `
      <article class="kt-dish-group ${ready ? 'is-ready' : 'is-waiting'}${late ? ' is-late' : ''}">
        <div class="kt-dish kt-dish--main ${ready ? 'is-ready' : 'is-waiting'}" data-item-id="${escapeHtml(item.itemId)}">
          <div class="kt-dish__top">
            <span class="kt-dish__name">${late ? `<span class="kt-new-tag">${escapeHtml(txt('dishNew'))}</span>` : ''}${escapeHtml(dishName(item))}${qty > 1 ? ` × ${escapeHtml(String(qty))}` : ''}</span>
            ${dishActions(item)}
          </div>
        </div>
        ${kids ? `<div class="kt-dish__kids">${kids}</div>` : ''}
        ${item.notes ? noteHtml(item.notes) : ''}
      </article>
    `;
  }

  function renderDishUnits(item, sides) {
    const units = Math.max(1, Number(item.qty) || 1);
    if (units <= 1) return renderDish(item, sides);
    return Array.from({ length: units }, (_, index) => (
      renderDish({ ...item, qty: 1 }, unitSides(sides, units, index))
    )).join('');
  }

  const CHIME_KEY = 'lechaim-kitchen-chime-sessions';

  function loadChimed() {
    try {
      const raw = JSON.parse(localStorage.getItem(CHIME_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveChimed(set) {
    try {
      localStorage.setItem(CHIME_KEY, JSON.stringify([...set].slice(-80)));
    } catch (_) { /* ignore */ }
  }

  function renderCard(entry) {
    const counts = readyCounts(entry.order?.items);
    const allDone = Boolean(entry.order?.kitchenAllReady) && counts.allReady;
    const fresh = isFresh(entry) && !allDone;
    const wave = !fresh && hasNewWave(entry) && !allDone;
    const statusText = fresh
      ? txt('tableFresh')
      : (wave ? txt('tableWave') : statusLabel(entry.uiStatus));
    return `
      <button type="button"
        class="kt-table-card is-${escapeHtml(cardTone(entry.uiStatus))}${fresh ? ' is-fresh' : ''}${wave ? ' is-wave' : ''}${allDone ? ' is-allready' : ''}"
        data-kt-table="${escapeHtml(String(entry.tableNumber))}"
      >
        <span class="kt-table-card__num">${escapeHtml(String(entry.tableNumber))}</span>
        <span class="kt-table-card__status">${escapeHtml(statusText)}</span>
        <span class="kt-table-card__items">${escapeHtml(String(counts.ready))} / ${escapeHtml(String(counts.total))} ${escapeHtml(txt('readyCount'))}</span>
        ${allDone ? `<span class="kt-table-card__done">${escapeHtml(txt('allReadyDone'))}</span>` : ''}
        <span class="kt-table-card__time">${escapeHtml(formatElapsed(entry.openedAt))}</span>
      </button>
    `;
  }

  function renderBoard() {
    if (gridEl) {
      gridEl.innerHTML = board.length
        ? board.map(renderCard).join('')
        : `<p class="kt-news__empty">${escapeHtml(txt('tablesEmpty'))}</p>`;
    }
    if (openTable != null) fillDrawer(openTable);
  }

  function fillDrawer(tableNumber) {
    const entry = board.find((row) => row.tableNumber === Number(tableNumber));
    if (!entry?.order) {
      closeDrawer();
      return;
    }
    openTable = entry.tableNumber;
    if (drawerTitle) drawerTitle.textContent = `${txt('tablePrefix')} ${entry.tableNumber}`;
    if (drawerMeta) {
      const counts = readyCounts(entry.order.items);
      const allDone = Boolean(entry.order.kitchenAllReady) && counts.allReady;
      const guest = String(entry.order.customerNotes || '').trim();
      drawerMeta.innerHTML = `
        <p class="kt-table-meta__row">${escapeHtml(statusLabel(entry.uiStatus))} · ${escapeHtml(String(counts.ready))} / ${escapeHtml(String(counts.total))} ${escapeHtml(txt('readyCount'))}</p>
        ${guest ? `<p class="kt-table-meta__note"><strong>${escapeHtml(txt('customerNote'))}:</strong> <span data-kt-note="${escapeHtml(guest)}">${escapeHtml(guest)}</span></p>` : ''}
        ${allDone ? `<p class="kt-table-meta__done">${escapeHtml(txt('allReadyDone'))}</p>` : statsHtml(entry.order.items)}
      `;
    }
    if (drawerItems) {
      const scrollTop = drawerItems.scrollTop;
      const groups = groupItems(entry.order.items);
      drawerItems.innerHTML = groups.length
        ? groups.map((row) => renderDishUnits(row.main, row.sides)).join('')
        : `<p class="kt-news__empty">${escapeHtml(txt('dishesEmpty'))}</p>`;
      drawerItems.scrollTop = scrollTop;
    }
    hydrateNotes(drawerEl);
    const allReadyBtn = document.getElementById('kt-all-ready');
    if (allReadyBtn) {
      const counts = readyCounts(entry.order.items);
      const show = counts.allReady && !entry.order.kitchenAllReady;
      allReadyBtn.hidden = !show;
      allReadyBtn.disabled = !show;
      allReadyBtn.dataset.sessionId = entry.order.sessionId || '';
      allReadyBtn.textContent = txt('allReady');
    }
    if (drawerEl) drawerEl.hidden = false;
  }

  function closeDrawer() {
    openTable = null;
    if (drawerEl) drawerEl.hidden = true;
    const allReadyBtn = document.getElementById('kt-all-ready');
    if (allReadyBtn) allReadyBtn.hidden = true;
  }

  if (drawerEl && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      if (drawerEl.hidden) openTable = null;
    }).observe(drawerEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  function setTab(tab) {
    currentTab = tab === 'alerts' ? 'alerts' : 'tables';
    document.querySelectorAll('[data-kt-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.ktTab === currentTab);
    });
    if (viewTables) viewTables.hidden = currentTab !== 'tables';
    if (viewAlerts) viewAlerts.hidden = currentTab !== 'alerts';
  }

  async function loadBoard() {
    if (!api?.getOpenSessionsWithOrders) {
      setError(txt('boardFail'));
      return;
    }
    try {
      const rows = await api.getOpenSessionsWithOrders();
      const next = buildBoard(rows);
      const chimed = loadChimed();
      if (!primed) {
        next.forEach((entry) => {
          const id = String(entry.order?.sessionId || '');
          if (id) chimed.add(id);
          const waveKey = waveChimeKey(entry);
          if (waveKey) chimed.add(waveKey);
        });
        saveChimed(chimed);
      } else {
        let ring = false;
        next.forEach((entry) => {
          const id = String(entry.order?.sessionId || '');
          if (id && isFresh(entry) && !chimed.has(id)) {
            ring = true;
            chimed.add(id);
          }
          const waveKey = waveChimeKey(entry);
          if (waveKey && !chimed.has(waveKey)) {
            ring = true;
            chimed.add(waveKey);
          }
        });
        if (ring) playNewTicketChime();
        saveChimed(chimed);
      }
      primed = true;
      board = next;
      setError('');
      renderBoard();
    } catch (err) {
      setError(err?.message || txt('boardFail'));
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      loadBoard();
    }, 250);
  }

  async function peelOneUnit(item, allItems, unitStatus) {
    const orderId = item.orderId;
    const qty = Math.max(1, Number(item.qty) || 1);
    if (qty <= 1 || !orderId || !api?.bumpOrderItemQuantity || !api?.createOrderItems) {
      await api.updateItemKitchenStatus(item.itemId, unitStatus);
      return;
    }

    const sides = (allItems || []).filter((row) => String(row.linkedToMainItemId || '') === String(item.itemId));
    let peeled = false;
    try {
      await api.bumpOrderItemQuantity(item.itemId, -1);
      peeled = true;
      const created = await api.createOrderItems(orderId, [{
        productId: item.productId,
        productName: item.name,
        printName: item.printName,
        quantity: 1,
        price: Number(item.price) || 0,
        notes: item.notes || null,
        kitchenStatus: unitStatus,
        createdAt: item.createdAt || null,
      }]);
      const newMainId = created?.[0]?.id;

      for (const side of sides) {
        const sideQty = Number(side.qty) || 0;
        const per = qty > 0 ? sideQty / qty : 0;
        if (!(Number.isInteger(per) && per >= 1 && side.itemId && newMainId)) continue;
        await api.bumpOrderItemQuantity(side.itemId, -per);
        await api.createOrderItems(orderId, [{
          productId: side.productId,
          productName: side.name,
          printName: side.printName,
          quantity: per,
          price: Number(side.price) || 0,
          notes: side.notes || null,
          parentItemId: newMainId,
          createdAt: side.createdAt || item.createdAt || null,
        }]);
      }
    } catch (err) {
      if (peeled) {
        try { await api.bumpOrderItemQuantity(item.itemId, 1); } catch (_) { /* ignore */ }
      }
      throw err;
    }
  }

  async function toggleItemReady(itemId) {
    if (sending) return;
    const entry = board.find((row) => (row.order?.items || []).some((item) => String(item.itemId) === String(itemId)));
    const item = (entry?.order?.items || []).find((row) => String(row.itemId) === String(itemId));
    if (!item || isAddon(item)) return;
    sending = true;
    try {
      const qty = Math.max(1, Number(item.qty) || 1);
      if (qty > 1) {
        await peelOneUnit(item, entry.order.items, isDishReady(item) ? 'waiting' : 'ready');
      } else {
        await api.updateItemKitchenStatus(itemId, isDishReady(item) ? 'waiting' : 'ready');
      }
      setError('');
      await loadBoard();
    } catch (err) {
      setError(err?.message || txt('statusFail'));
    } finally {
      sending = false;
    }
  }

  async function startKitchen(entry) {
    const sessionId = entry?.order?.sessionId;
    if (!sessionId || sending || entry.order.kitchenStarted) return;
    sending = true;
    entry.order.kitchenStarted = true;
    entry.order.kitchenStartedAt = entry.order.kitchenStartedAt || new Date().toISOString();
    entry.order.kitchenWaveAckAt = new Date().toISOString();
    renderBoard();
    try {
      await api.markSessionKitchenStarted(sessionId);
      setError('');
      await loadBoard();
    } catch (err) {
      entry.order.kitchenStarted = false;
      entry.order.kitchenWaveAckAt = null;
      renderBoard();
      setError(err?.message || txt('statusFail'));
    } finally {
      sending = false;
    }
  }

  async function ackKitchenWave(entry) {
    const sessionId = entry?.order?.sessionId;
    if (!sessionId || sending || !hasNewWave(entry)) return;
    sending = true;
    const prev = entry.order.kitchenWaveAckAt;
    entry.order.kitchenWaveAckAt = new Date().toISOString();
    renderBoard();
    try {
      await api.markSessionKitchenWaveAck(sessionId);
      setError('');
      await loadBoard();
    } catch (err) {
      entry.order.kitchenWaveAckAt = prev;
      renderBoard();
      setError(err?.message || txt('statusFail'));
    } finally {
      sending = false;
    }
  }

  async function markAllReady(sessionId) {
    if (sending) return;
    sending = true;
    try {
      await api.markSessionKitchenAllReady(sessionId);
      setError('');
      await loadBoard();
    } catch (err) {
      setError(err?.message || txt('statusFail'));
    } finally {
      sending = false;
    }
  }

  document.addEventListener('click', unlockAudio, { once: true });
  document.addEventListener('touchstart', unlockAudio, { once: true });

  gridEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-kt-table]');
    if (!btn || btn.disabled) return;
    const tableNumber = Number(btn.dataset.ktTable);
    const entry = board.find((row) => row.tableNumber === tableNumber);
    if (!entry?.order) return;
    if (isFresh(entry)) {
      startKitchen(entry);
      return;
    }
    if (hasNewWave(entry)) {
      ackKitchenWave(entry);
      return;
    }
    if (sending) return;
    fillDrawer(tableNumber);
  });

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-kt-dish-toggle]');
    if (toggle) {
      toggleItemReady(toggle.dataset.ktDishToggle);
      return;
    }
    const allReady = event.target.closest('#kt-all-ready');
    if (allReady && allReady.dataset.sessionId) {
      markAllReady(allReady.dataset.sessionId);
    }
  });

  document.querySelectorAll('[data-kt-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.ktTab));
  });

  window.setInterval(() => renderBoard(), 30000);
  window.setInterval(() => loadBoard(), 4000);

  if (api?.subscribeToOrders) {
    api.subscribeToOrders(() => scheduleRefresh());
  }

  global.LechaimKitchenBoard = {
    applyLang: renderBoard,
  };

  loadBoard();
})(window);
