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
  const prepEl = document.getElementById('kt-prep-board');
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
  let suppressRingUntil = 0;
  let prevContentKeys = new Set();
  let rangThisRefresh = false;
  let prevNoteAlertVer = new Map();
  let pendingNoteAlerts = [];
  let noteToastTimer = null;
  let noteToastHideTimer = null;
  let prevPrepQty = new Map();
  let prepPulseUntil = new Map();
  let prepQtyPrimed = false;
  let openPrepSides = new Set();
  let openPrepMains = new Set();
  let dismissedUrgentKeys = new Set();
  let seenWaveItemIds = new Map();
  let wavePulseUntil = new Map();
  let pulseExpireTimer = null;
  const NEW_PULSE_MS = 10000;
  const LATE_MS = 20 * 60 * 1000;
  let lateChimed = new Set();

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

  function isUnackedWaveItem(item, entry) {
    const order = entry?.order;
    if (!item || !order?.kitchenStarted) return false;
    const ack = ts(order.kitchenWaveAckAt) || ts(order.kitchenStartedAt);
    return ts(item.createdAt) > ack + 800;
  }

  function unackedWaveIds(entry) {
    return (entry?.order?.items || [])
      .filter((item) => isUnackedWaveItem(item, entry))
      .map((item) => String(item.itemId));
  }

  function seedWavePulses(rows) {
    (rows || []).forEach((entry) => {
      const sid = String(entry.order?.sessionId || '');
      if (!sid) return;
      seenWaveItemIds.set(sid, new Set(unackedWaveIds(entry)));
    });
  }

  function touchWavePulses(rows) {
    const now = Date.now();
    (rows || []).forEach((entry) => {
      const sid = String(entry.order?.sessionId || '');
      if (!sid) return;
      const current = unackedWaveIds(entry);
      const prev = seenWaveItemIds.get(sid) || new Set();
      const added = current.filter((id) => !prev.has(id));
      if (added.length) {
        wavePulseUntil.set(sid, now + NEW_PULSE_MS);
        added.forEach((id) => prev.add(id));
        seenWaveItemIds.set(sid, prev);
      }
    });
  }

  function hasWavePulse(entry) {
    const sid = String(entry?.order?.sessionId || '');
    return Date.now() < (wavePulseUntil.get(sid) || 0);
  }

  function unreadyMains(items) {
    return countableItems(items).filter((item) => !isDishReady(item));
  }

  function isOverdue(entry) {
    const counts = readyCounts(entry?.order?.items);
    if (entry?.order?.kitchenAllReady && counts.allReady) return false;
    const waiting = unreadyMains(entry?.order?.items);
    if (!waiting.length) return false;
    const now = Date.now();
    return waiting.some((item) => {
      const start = ts(item.createdAt);
      return start > 0 && now - start >= LATE_MS;
    });
  }

  function soonestOverdueAt() {
    const now = Date.now();
    let soonest = Infinity;
    board.forEach((entry) => {
      if (isOverdue(entry)) return;
      unreadyMains(entry?.order?.items).forEach((item) => {
        const start = ts(item.createdAt);
        if (!start) return;
        const due = start + LATE_MS;
        if (due > now && due < soonest) soonest = due;
      });
    });
    return soonest;
  }

  function seedLateChimed(rows) {
    (rows || []).forEach((entry) => {
      const sid = String(entry.order?.sessionId || '');
      if (sid && isOverdue(entry)) lateChimed.add(sid);
    });
  }

  function chimeIfNewlyOverdue() {
    if (!primed) return;
    let ring = false;
    const live = new Set();
    board.forEach((entry) => {
      const sid = String(entry.order?.sessionId || '');
      if (!sid) return;
      if (!isOverdue(entry)) return;
      live.add(sid);
      if (!lateChimed.has(sid)) {
        lateChimed.add(sid);
        ring = true;
      }
    });
    lateChimed.forEach((sid) => {
      if (!live.has(sid)) lateChimed.delete(sid);
    });
    if (ring && Date.now() >= suppressRingUntil) playNewTicketChime();
  }

  function schedulePulseExpiry() {
    window.clearTimeout(pulseExpireTimer);
    const now = Date.now();
    let soonest = Infinity;
    wavePulseUntil.forEach((stamp) => {
      if (stamp > now && stamp < soonest) soonest = stamp;
    });
    prepPulseUntil.forEach((stamp) => {
      if (stamp > now && stamp < soonest) soonest = stamp;
    });
    const overdueAt = soonestOverdueAt();
    if (overdueAt < soonest) soonest = overdueAt;
    if (soonest < Infinity) {
      pulseExpireTimer = window.setTimeout(() => renderBoard(), Math.max(40, soonest - now + 40));
    }
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

  function playNoteChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      [
        { freq: 392, at: 0, dur: 0.16 },
        { freq: 494, at: 0.18, dur: 0.16 },
        { freq: 587, at: 0.36, dur: 0.28 },
      ].forEach((tone) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.28, now + tone.at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (_) { /* ignore */ }
  }

  function hideNoteToast() {
    const el = document.getElementById('kt-note-toast');
    if (el) el.hidden = true;
  }

  function showNoteToast(alert) {
    const el = document.getElementById('kt-note-toast');
    if (!el || !alert?.item) return;
    const table = Number(alert.tableNumber) || 0;
    el.innerHTML = `
      <p class="kt-note-toast__table">${escapeHtml(txt('tablePrefix'))} ${escapeHtml(String(table))}</p>
      <p class="kt-note-toast__dish">${escapeHtml(dishName(alert.item))}</p>
      <p class="kt-note-toast__text">${escapeHtml(kitchenNoteText(alert.item))}</p>
      <button type="button" class="kt-note-toast__open" data-kt-note-open="${escapeHtml(String(table))}">${escapeHtml(txt('noteOpenTable'))}</button>
    `;
    el.hidden = false;
    window.clearTimeout(noteToastHideTimer);
    noteToastHideTimer = window.setTimeout(hideNoteToast, 8000);
  }

  function flushNoteAlerts() {
    const batch = pendingNoteAlerts;
    pendingNoteAlerts = [];
    noteToastTimer = null;
    if (!batch.length) return;
    if (!rangThisRefresh) playNoteChime();
    rangThisRefresh = false;
    showNoteToast(batch[0]);
  }

  function queueNoteAlerts(alerts) {
    if (!alerts?.length) return;
    pendingNoteAlerts.push(...alerts);
    window.clearTimeout(noteToastTimer);
    noteToastTimer = window.setTimeout(flushNoteAlerts, 500);
  }

  function seedNoteAlertVersions(rows) {
    const next = new Map();
    (rows || []).forEach((entry) => {
      (entry.order?.items || []).forEach((item) => {
        const ver = Number(item.notesVersion) || 0;
        if (item.itemId && ver > 0) next.set(String(item.itemId), ver);
      });
    });
    prevNoteAlertVer = next;
  }

  function collectNewNoteAlerts(rows) {
    const fresh = [];
    const next = new Map();
    (rows || []).forEach((entry) => {
      (entry.order?.items || []).forEach((item) => {
        const id = String(item.itemId || '');
        const ver = Number(item.notesVersion) || 0;
        if (!id) return;
        if (ver > 0) next.set(id, ver);
        const prev = prevNoteAlertVer.get(id) || 0;
        if (isUnreadNote(item) && ver > prev) {
          fresh.push({
            tableNumber: entry.tableNumber,
            item,
          });
        }
      });
    });
    prevNoteAlertVer = next;
    return fresh;
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
      notesEl: row.notes_el == null ? '' : String(row.notes_el),
      notesVersion: Number(row.notes_version) || 0,
      notesSeenVersion: Number(row.notes_seen_version) || 0,
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      createdAt: row.created_at || extras.createdAt || null,
      kitchenStatus: kitchenStatus(row.kitchen_status),
      kitchenUrgent: Boolean(row.kitchen_urgent),
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
    const order = prepMenuOrder();
    const ia = prepSortIndex(String(a?.productId || ''), order);
    const ib = prepSortIndex(String(b?.productId || ''), order);
    if (ia !== ib) return ia - ib;
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

  function isDishReady(item) {
    return (item?.kitchenStatus || 'waiting') === 'ready';
  }

  function isPrepModifier(item) {
    const id = String(item?.productId || '');
    return Boolean(
      global.DONENESS_IDS?.has?.(id)
      || global.SHAKE_BASE_IDS?.has?.(id)
      || global.LIMONANA_ALCOHOL_IDS?.has?.(id)
      || id.startsWith('doneness-')
      || id.startsWith('shake-base-')
      || id.startsWith('limonana-alcohol')
    );
  }

  function prepProductKey(item) {
    return String(item?.productId || '') || dishName(item);
  }

  const FIXED_SIDE_DEFS = [
    { key: 'chips', ids: ['fries-side'], labelId: 'fries-side' },
    { key: 'puree', ids: ['puree'], labelId: 'puree' },
    { key: 'beans', ids: ['green-beans'], labelId: 'green-beans' },
    { key: 'rice', ids: ['rice'], labelId: 'rice' },
  ];

  function hamburgerMealId() {
    return String(global.HAMBURGER_MEAL_ID || 'hamburger-fries');
  }

  function fixedSideKey(productId) {
    const id = String(productId || '');
    if (id === hamburgerMealId()) return 'chips';
    const hit = FIXED_SIDE_DEFS.find((row) => row.ids.includes(id));
    return hit ? hit.key : '';
  }

  function isFixedSideProduct(productId) {
    const id = String(productId || '');
    return FIXED_SIDE_DEFS.some((row) => row.ids.includes(id));
  }

  function isPrepSideItem(item) {
    if (!item || isStandaloneStarter(item) || isPrepModifier(item)) return false;
    return Boolean(item.linkedToMainItemId);
  }

  function prepMenuOrder() {
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

  function prepSortIndex(key, order) {
    if (order.has(key)) return order.get(key);
    return 10000;
  }

  function prepDishLabel(item) {
    const catalog = catalogPrintName(String(item?.productId || ''));
    if (catalog && !hasHeOrEl(catalog)) return catalog;
    return dishName(item);
  }

  function shouldCountPrepItem(item, byId) {
    const api = global.LechaimKitchenProgress;
    if (api?.isRemainingUnit) return api.isRemainingUnit(item, byId);
    if (!item || Number(item.qty) <= 0) return false;
    if (!item.wavePrinted) return false;
    if (isPrepModifier(item)) return false;
    if (isPrepSideItem(item)) {
      const parent = byId.get(String(item.linkedToMainItemId));
      if (parent) return !isDishReady(parent);
      return !isDishReady(item);
    }
    if (isAddon(item)) return false;
    return !isDishReady(item);
  }

  function sortPrepRows(rows, menuOrder) {
    return rows
      .filter((row) => row.qty > 0)
      .sort((a, b) => prepSortIndex(a.key, menuOrder) - prepSortIndex(b.key, menuOrder)
        || String(a.key).localeCompare(String(b.key)));
  }

  function emptyFixedSide(def) {
    return {
      key: def.key,
      qty: 0,
      sample: { productId: def.labelId },
      byParent: new Map(),
    };
  }

  function buildPrepTotals(entries) {
    const byId = new Map();
    (entries || []).forEach((entry) => {
      (entry.order?.items || []).forEach((item) => {
        if (item?.itemId) byId.set(String(item.itemId), item);
      });
    });
    const mains = new Map();
    const sides = new Map(FIXED_SIDE_DEFS.map((def) => [def.key, emptyFixedSide(def)]));
    (entries || []).forEach((entry) => {
      (entry.order?.items || []).forEach((item) => {
        if (!shouldCountPrepItem(item, byId)) return;
        const productId = prepProductKey(item);
        const qty = Number(item.qty) || 0;
        const isHamburger = productId === hamburgerMealId();
        const attachedSide = Boolean(item.linkedToMainItemId)
          && !isPrepModifier(item)
          && !isStandaloneStarter(item)
          && Boolean(fixedSideKey(productId));
        if (attachedSide || isHamburger) {
          const bucketKey = isHamburger ? 'chips' : fixedSideKey(productId);
          const prev = sides.get(bucketKey);
          prev.qty += qty;
          const parent = isHamburger
            ? item
            : (byId.get(String(item.linkedToMainItemId)) || item);
          const parentKey = parent ? prepProductKey(parent) : productId;
          const parentRow = prev.byParent.get(parentKey) || { key: parentKey, qty: 0, sample: parent || item };
          parentRow.qty += qty;
          prev.byParent.set(parentKey, parentRow);
          if (attachedSide) return;
        }
        if (isPrepSideItem(item) || isFixedSideProduct(productId)) return;
        const key = productId;
        const prev = mains.get(key) || { key, qty: 0, sample: item, byParent: new Map(), byTable: new Map(), wave: false };
        prev.qty += qty;
        if (isUnackedWaveItem(item, entry)) prev.wave = true;
        const tableNo = Number(entry.tableNumber);
        if (Number.isInteger(tableNo)) {
          const tableRow = prev.byTable.get(tableNo) || { tableNumber: tableNo, qty: 0 };
          tableRow.qty += qty;
          prev.byTable.set(tableNo, tableRow);
        }
        mains.set(key, prev);
      });
    });
    const menuOrder = prepMenuOrder();
    return {
      mains: sortPrepRows([...mains.values()], menuOrder),
      sides: FIXED_SIDE_DEFS.map((def) => sides.get(def.key)),
    };
  }

  function prepPulseKey(role, key) {
    return `${role}:${key}`;
  }

  function prepRowHtml(row, role, now) {
    const pulseKey = prepPulseKey(role, row.key);
    const isNew = now < (prepPulseUntil.get(pulseKey) || 0);
    const open = role === 'side'
      ? openPrepSides.has(row.key)
      : openPrepMains.has(row.key);
    const parents = role === 'side'
      ? sortPrepRows([...row.byParent.values()], prepMenuOrder())
      : [];
    const tables = role === 'main'
      ? [...(row.byTable?.values?.() || [])].sort((a, b) => a.tableNumber - b.tableNumber)
      : [];
    const breakHtml = role === 'side' && open && parents.length
      ? `<ul class="kt-prep__break">
          ${parents.map((parent) => `
            <li class="kt-prep__break-row">
              <span>${escapeHtml(txt('prepFor').replace('{name}', prepDishLabel(parent.sample)))}</span>
              <span>${escapeHtml(String(parent.qty))}</span>
            </li>
          `).join('')}
        </ul>`
      : (role === 'main' && open && tables.length
        ? `<ul class="kt-prep__break">
            ${tables.map((table) => `
              <li class="kt-prep__break-row">
                <span>${escapeHtml(txt('prepTable').replace('{n}', String(table.tableNumber)))}</span>
                <span>${escapeHtml(String(table.qty))}</span>
              </li>
            `).join('')}
          </ul>`
        : '');
    if (role === 'side') {
      if (row.qty <= 0) {
        return `
          <li class="kt-prep__row is-side is-zero">
            <span class="kt-prep__name">${escapeHtml(prepDishLabel(row.sample))}</span>
            <span class="kt-prep__qty">0</span>
          </li>
        `;
      }
      return `
        <li>
          <button type="button"
            class="kt-prep__row is-side${isNew ? ' is-new' : ''}${open && !isNew ? ' is-open' : ''}"
            data-kt-prep-side="${escapeHtml(row.key)}"
            aria-expanded="${open ? 'true' : 'false'}"
          >
            <span class="kt-prep__name">${escapeHtml(prepDishLabel(row.sample))}</span>
            <span class="kt-prep__qty">${escapeHtml(String(row.qty))}</span>
          </button>
          ${breakHtml}
        </li>
      `;
    }
    return `
      <li>
        <button type="button"
          class="kt-prep__row${isNew ? ' is-new' : ''}${open && !isNew ? ' is-open' : ''}"
          data-kt-prep-main="${escapeHtml(row.key)}"
          aria-expanded="${open ? 'true' : 'false'}"
        >
          <span class="kt-prep__name">${escapeHtml(prepDishLabel(row.sample))}</span>
          <span class="kt-prep__qty">${escapeHtml(String(row.qty))}</span>
        </button>
        ${breakHtml}
      </li>
    `;
  }

  function prepSectionHtml(title, rows, role, now) {
    const klass = role === 'side' ? ' is-fixed' : ' is-mains';
    const body = rows.length
      ? rows.map((row) => prepRowHtml(row, role, now)).join('')
      : `<li class="kt-prep__empty-row">${escapeHtml(txt('prepEmpty'))}</li>`;
    return `
      <section class="kt-prep__section${klass}">
        <h3 class="kt-prep__heading">${escapeHtml(title)}</h3>
        <ul class="kt-prep__list">
          ${body}
        </ul>
      </section>
    `;
  }

  function renderPrepBoard() {
    if (!prepEl) return;
    const { mains, sides } = buildPrepTotals(board);
    const now = Date.now();
    const nextQty = new Map();
    const markPulse = (role, rows) => {
      rows.forEach((row) => {
        const pulseKey = prepPulseKey(role, row.key);
        nextQty.set(pulseKey, row.qty);
        const prev = prevPrepQty.get(pulseKey) || 0;
        if (prepQtyPrimed && row.qty > prev) {
          prepPulseUntil.set(pulseKey, now + NEW_PULSE_MS);
        }
      });
    };
    markPulse('main', mains);
    markPulse('side', sides);
    prevPrepQty = nextQty;
    prepQtyPrimed = true;
    [...prepPulseUntil.keys()].forEach((key) => {
      if (!nextQty.has(key) || now >= (prepPulseUntil.get(key) || 0)) {
        prepPulseUntil.delete(key);
      }
    });
    prepEl.innerHTML = `
      <h2 class="kt-prep__title">${escapeHtml(txt('prepTitle'))}</h2>
      <div class="kt-prep__cols">
        ${prepSectionHtml(txt('prepSides'), sides, 'side', now)}
        ${prepSectionHtml(txt('prepMains'), mains, 'main', now)}
      </div>
    `;
  }

  function readyCounts(items) {
    const progress = global.LechaimKitchenProgress?.fromItems?.(items);
    if (progress) {
      return {
        ready: progress.readyKitchenUnits,
        total: progress.totalKitchenUnits,
        allReady: progress.allReady,
      };
    }
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

  function kitchenNoteText(item) {
    const savedEl = String(item?.notesEl || item?.notes_el || '').trim();
    if (savedEl) return savedEl;
    return String(item?.notes || '').trim();
  }

  function isUnreadNote(item) {
    if (!kitchenNoteText(item)) return false;
    const version = Number(item?.notesVersion ?? item?.notes_version) || 0;
    const seen = Number(item?.notesSeenVersion ?? item?.notes_seen_version) || 0;
    return version > seen;
  }

  function unreadNoteItems(items) {
    return (items || []).filter(isUnreadNote);
  }

  function unreadNoteCount(items) {
    return unreadNoteItems(items).length;
  }

  function hasAnyKitchenNote(items) {
    return (items || []).some((item) => Boolean(kitchenNoteText(item)));
  }

  function noteBadgeLabel(count) {
    if (count <= 0) return '';
    if (count === 1) return txt('noteNew');
    return txt('noteNewMany').replace('{n}', String(count));
  }

  function noteHtml(item) {
    const raw = kitchenNoteText(item);
    if (!raw) return '';
    const unread = isUnreadNote(item);
    return `
      <div class="kt-dish-note${unread ? ' is-unread' : ''}">
        <p class="kt-dish-note__text">${escapeHtml(raw)}</p>
        ${unread
          ? `<button type="button" class="kt-dish-note__ack" data-kt-note-ack="${escapeHtml(item.itemId)}">${escapeHtml(txt('noteAck'))}</button>`
          : ''}
      </div>
    `;
  }

  function renderSide(item, groupReady) {
    const qty = Number(item.qty) || 1;
    const line = qty > 1
      ? `+ ${qty} x ${dishName(item)}`
      : `+ ${dishName(item)}`;
    return `
      <div class="kt-dish kt-dish--side ${groupReady ? 'is-ready' : 'is-waiting'}">
        <span class="kt-dish__name">${escapeHtml(line)}</span>
        ${noteHtml(item)}
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

  function urgentMains(items) {
    return countableItems(items).filter((item) => item.kitchenUrgent && !isDishReady(item));
  }

  function hasUrgent(entry) {
    return urgentMains(entry?.order?.items).length > 0;
  }

  function urgentVisualKey(entry) {
    const ids = urgentMains(entry?.order?.items).map((item) => String(item.itemId)).sort().join(',');
    return `${entry?.order?.sessionId || entry?.tableNumber || ''}:${ids}`;
  }

  function showUrgentVisual(entry) {
    if (!hasUrgent(entry)) return false;
    const key = urgentVisualKey(entry);
    return Boolean(key) && !dismissedUrgentKeys.has(key);
  }

  function dismissUrgentVisual(entry) {
    const key = urgentVisualKey(entry);
    if (key) dismissedUrgentKeys.add(key);
  }

  function renderDish(item, sides) {
    const ready = isDishReady(item);
    const late = Boolean(item.isLate) && !ready;
    const urgent = Boolean(item.kitchenUrgent) && !ready;
    const qty = Number(item.qty) || 1;
    const kids = (sides || []).map((side) => renderSide(side, ready)).join('');
    return `
      <article class="kt-dish-group ${ready ? 'is-ready' : 'is-waiting'}${late ? ' is-late' : ''}${urgent ? ' is-urgent' : ''}">
        <div class="kt-dish kt-dish--main ${ready ? 'is-ready' : 'is-waiting'}" data-item-id="${escapeHtml(item.itemId)}">
          <div class="kt-dish__top">
            <span class="kt-dish__name">${urgent ? `<span class="kt-urgent-tag">${escapeHtml(txt('dishUrgent'))}</span>` : ''}${late ? `<span class="kt-new-tag">${escapeHtml(txt('dishNew'))}</span>` : ''}${escapeHtml(String(qty))} x ${escapeHtml(dishName(item))}</span>
            ${dishActions(item)}
          </div>
        </div>
        ${kids ? `<div class="kt-dish__kids">${kids}</div>` : ''}
        ${noteHtml(item)}
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

  function hushRing(ms) {
    suppressRingUntil = Date.now() + (ms || 2800);
  }

  function boardContentKeys(rows) {
    const keys = [];
    (rows || []).forEach((entry) => {
      const sid = String(entry.order?.sessionId || '');
      if (sid) keys.push(`s:${sid}`);
      (entry.order?.items || []).forEach((item) => {
        const id = String(item.itemId || '');
        if (!id) return;
        keys.push(`i:${id}:q${Number(item.qty) || 0}`);
        const ver = Number(item.notesVersion) || 0;
        if (ver > 0) keys.push(`n:${id}:v${ver}`);
      });
    });
    return keys;
  }

  function ringIfNewContent(rows) {
    const keys = boardContentKeys(rows);
    const next = new Set(keys);
    if (!primed) {
      prevContentKeys = next;
      rangThisRefresh = false;
      return;
    }
    const added = keys.some((key) => !prevContentKeys.has(key));
    prevContentKeys = next;
    if (!added || Date.now() < suppressRingUntil) {
      rangThisRefresh = false;
      return;
    }
    rangThisRefresh = true;
    playNewTicketChime();
  }

  function updateTablesBadge() {
    const el = document.getElementById('kt-tables-badge');
    if (!el) return;
    const n = board.length;
    el.textContent = String(n);
    el.hidden = n <= 0;
  }

  function renderCard(entry) {
    const counts = readyCounts(entry.order?.items);
    const allDone = Boolean(entry.order?.kitchenAllReady) && counts.allReady;
    const urgentList = urgentMains(entry.order?.items);
    const urgent = !allDone && urgentList.length > 0;
    const urgentPulse = urgent && showUrgentVisual(entry);
    const wave = !urgentPulse && hasWavePulse(entry);
    const overdue = !allDone && !urgentPulse && !wave && isOverdue(entry);
    const fresh = isFresh(entry) && !allDone && !urgentPulse && !wave && !overdue;
    const noteTone = !allDone && !urgentPulse && !wave && !overdue && unreadNoteCount(entry.order?.items) > 0;
    const statusText = urgentPulse
      ? txt('tableUrgent')
      : (wave
        ? txt('tableWave')
        : (overdue
          ? txt('tableLate')
          : (fresh ? txt('tableFresh') : statusLabel(entry.uiStatus))));
    const urgentLabel = urgentList.map((item) => dishName(item)).filter(Boolean).slice(0, 2).join(' · ');
    const noteBadge = noteBadgeLabel(unreadNoteCount(entry.order?.items));
    const hasNotes = hasAnyKitchenNote(entry.order?.items);
    const noteMark = hasNotes
      ? `<span class="kt-table-card__note-mark" aria-hidden="true">!</span>`
      : '';
    const face = urgentPulse ? '🫨' : (fresh ? '🥳' : (wave ? '😇' : (overdue ? '⏰' : (noteTone ? '🤓' : ''))));
    return `
      <button type="button"
        class="kt-table-card is-${escapeHtml(cardTone(entry.uiStatus))}${fresh ? ' is-fresh' : ''}${wave ? ' is-wave' : ''}${urgentPulse ? ' is-urgent' : ''}${urgent && !urgentPulse ? ' is-urgent-seen' : ''}${overdue ? ' is-late' : ''}${allDone && !wave ? ' is-allready' : ''}${noteTone ? ' is-note' : ''}${hasNotes ? ' has-notes' : ''}"
        data-kt-table="${escapeHtml(String(entry.tableNumber))}"
      >
        ${face ? `<span class="kt-table-card__face" aria-hidden="true">${face}</span>` : ''}
        <span class="kt-table-card__num">${escapeHtml(String(entry.tableNumber))}</span>
        <span class="kt-table-card__status">${escapeHtml(statusText)}</span>
        ${urgentLabel ? `<span class="kt-table-card__urgent">${escapeHtml(urgentLabel)}</span>` : ''}
        ${noteBadge ? `<span class="kt-table-card__note">${escapeHtml(noteBadge)}</span>` : ''}
        ${global.LechaimKitchenProgress?.barHtml?.(
          global.LechaimKitchenProgress.fromItems(entry.order?.items),
          { readyWord: txt('progressReady') }
        ) || `<span class="kt-table-card__items">${escapeHtml(String(counts.ready))} / ${escapeHtml(String(counts.total))} ${escapeHtml(txt('readyCount'))}${noteMark}</span>`}
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
    renderPrepBoard();
    schedulePulseExpiry();
    updateTablesBadge();
    chimeIfNewlyOverdue();
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
      drawerMeta.innerHTML = `
        <p class="kt-table-meta__row">${escapeHtml(statusLabel(entry.uiStatus))} · ${escapeHtml(String(counts.ready))} / ${escapeHtml(String(counts.total))} ${escapeHtml(txt('readyCount'))}</p>
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
    if (currentTab !== 'tables') closeDrawer();
  }

  async function loadBoard() {
    if (!api?.getOpenSessionsWithOrders) {
      setError(txt('boardFail'));
      return;
    }
    try {
      const rows = await api.getOpenSessionsWithOrders();
      const next = buildBoard(rows);
      if (!primed) {
        seedNoteAlertVersions(next);
        seedWavePulses(next);
        seedLateChimed(next);
        ringIfNewContent(next);
      } else {
        ringIfNewContent(next);
        queueNoteAlerts(collectNewNoteAlerts(next));
        touchWavePulses(next);
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
    hushRing();
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

  async function ackItemNote(itemId) {
    if (sending) return;
    hushRing();
    const id = String(itemId || '');
    const entry = board.find((row) => (row.order?.items || []).some((item) => String(item.itemId) === id));
    const item = (entry?.order?.items || []).find((row) => String(row.itemId) === id);
    if (!item || !isUnreadNote(item) || !api?.markItemNotesSeen) return;
    sending = true;
    const prevSeen = item.notesSeenVersion;
    item.notesSeenVersion = Number(item.notesVersion) || 0;
    renderBoard();
    try {
      await api.markItemNotesSeen(id);
      setError('');
      await loadBoard();
    } catch (err) {
      item.notesSeenVersion = prevSeen;
      renderBoard();
      setError(err?.message || txt('noteAckFail'));
    } finally {
      sending = false;
    }
  }

  async function toggleItemReady(itemId) {
    if (sending) return;
    hushRing();
    const entry = board.find((row) => (row.order?.items || []).some((item) => String(item.itemId) === String(itemId)));
    const item = (entry?.order?.items || []).find((row) => String(row.itemId) === String(itemId));
    if (!item || isAddon(item)) return;
    sending = true;
    try {
      const makingReady = !isDishReady(item);
      const qty = Math.max(1, Number(item.qty) || 1);
      if (qty > 1) {
        await peelOneUnit(item, entry.order.items, makingReady ? 'ready' : 'waiting');
      } else {
        await api.updateItemKitchenStatus(itemId, makingReady ? 'ready' : 'waiting');
        if (makingReady && item.kitchenUrgent && api.updateItemKitchenUrgent) {
          await api.updateItemKitchenUrgent(itemId, false);
        }
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
    hushRing();
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
    hushRing();
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
    hushRing();
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
      if (hasUrgent(entry)) {
        dismissUrgentVisual(entry);
        renderBoard();
        fillDrawer(tableNumber);
        return;
      }
      if (unreadNoteCount(entry.order?.items)) fillDrawer(tableNumber);
      return;
    }
    if (hasUrgent(entry)) {
      dismissUrgentVisual(entry);
      renderBoard();
      fillDrawer(tableNumber);
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
    const prepSide = event.target.closest('[data-kt-prep-side]');
    if (prepSide) {
      const key = String(prepSide.dataset.ktPrepSide || '');
      if (!key) return;
      if (openPrepSides.has(key)) openPrepSides.delete(key);
      else openPrepSides.add(key);
      renderPrepBoard();
      return;
    }
    const prepMain = event.target.closest('[data-kt-prep-main]');
    if (prepMain) {
      const key = String(prepMain.dataset.ktPrepMain || '');
      if (!key) return;
      if (openPrepMains.has(key)) openPrepMains.delete(key);
      else openPrepMains.add(key);
      renderPrepBoard();
      return;
    }
    const noteOpen = event.target.closest('[data-kt-note-open]');
    if (noteOpen) {
      hideNoteToast();
      const tableNumber = Number(noteOpen.dataset.ktNoteOpen);
      if (Number.isFinite(tableNumber)) {
        setTab('tables');
        fillDrawer(tableNumber);
      }
      return;
    }
    const noteAck = event.target.closest('[data-kt-note-ack]');
    if (noteAck) {
      ackItemNote(noteAck.dataset.ktNoteAck);
      return;
    }
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
