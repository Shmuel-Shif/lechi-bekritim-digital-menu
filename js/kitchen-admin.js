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
  const dishGroups = global.LechaimKitchenDishGroups;

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
  let tableBoard = [];
  let pickupBoard = [];
  let deliveryBoard = [];
  let openEntryId = null;
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
  let dismissedLateKeys = new Set();
  let seenWaveItemIds = new Map();
  let wavePulseUntil = new Map();
  let seenNeoItemIds = new Set();
  let neoPulseUntil = new Map();
  let dismissedNeoIds = new Set();
  let pulseExpireTimer = null;
  const NEW_PULSE_MS = 10000;
  const LATE_MS = 20 * 60 * 1000;
  let lateChimed = new Set();
  let lastDishGroups = [];

  function lang() {
    return i18n?.getLang?.() || 'el';
  }

  function txt(key) {
    return i18n?.t?.(lang(), key) || key;
  }

  function allBoardEntries() {
    return [...tableBoard, ...pickupBoard, ...deliveryBoard];
  }

  function boardForTab(tab) {
    if (tab === 'pickup') return pickupBoard;
    if (tab === 'delivery') return deliveryBoard;
    return tableBoard;
  }

  function syncVisibleBoard() {
    board = boardForTab(currentTab);
  }

  function findEntry(sessionId) {
    const id = String(sessionId || '');
    if (!id) return null;
    return allBoardEntries().find((row) => String(row.order?.sessionId || '') === id) || null;
  }

  function findEntryByItemId(itemId) {
    const id = String(itemId || '');
    if (!id) return null;
    return allBoardEntries().find((row) => (row.order?.items || []).some((item) => String(item.itemId) === id)) || null;
  }

  function isDeliverySession(session) {
    if (String(session?.fulfillment_type || '') === 'delivery') return true;
    return Boolean(String(session?.customer_address || '').trim());
  }

  function emptyMessage() {
    if (currentTab === 'pickup') return txt('pickupEmpty');
    if (currentTab === 'delivery') return txt('deliveryEmpty');
    return txt('tablesEmpty');
  }

  function entryCardNum(entry) {
    if (entry?.kind === 'tables') return String(entry.tableNumber);
    const no = entry?.order?.publicOrderNo;
    if (no != null) return `#${no}`;
    const name = String(entry?.order?.customerName || '').trim();
    if (name) return name;
    return entry?.kind === 'delivery' ? txt('deliveryPrefix') : txt('pickupPrefix');
  }

  function entryTitle(entry) {
    if (!entry) return '';
    if (entry.kind === 'delivery') {
      const no = entry.order?.publicOrderNo;
      const name = String(entry.order?.customerName || '').trim();
      if (no != null && name) return `${txt('deliveryPrefix')} #${no} · ${name}`;
      if (no != null) return `${txt('deliveryPrefix')} #${no}`;
      return name || txt('deliveryPrefix');
    }
    if (entry.kind === 'pickup') {
      const no = entry.order?.publicOrderNo;
      const name = String(entry.order?.customerName || '').trim();
      if (no != null && name) return `${txt('pickupPrefix')} #${no} · ${name}`;
      if (no != null) return `${txt('pickupPrefix')} #${no}`;
      return name || txt('pickupPrefix');
    }
    return `${txt('tablePrefix')} ${entry.tableNumber}`;
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

  function lateItemIds(rows) {
    const ids = [];
    (rows || []).forEach((entry) => {
      (entry.order?.items || []).forEach((item) => {
        if (item?.isLate && item.itemId) ids.push(String(item.itemId));
      });
    });
    return ids;
  }

  function seedNeoPulses(rows) {
    lateItemIds(rows).forEach((id) => seenNeoItemIds.add(id));
  }

  function touchNeoPulses(rows) {
    const now = Date.now();
    lateItemIds(rows).forEach((id) => {
      if (seenNeoItemIds.has(id)) return;
      seenNeoItemIds.add(id);
      neoPulseUntil.set(id, now + NEW_PULSE_MS);
    });
  }

  function showNeo(item) {
    if (!item?.isLate || isDishReady(item)) return false;
    const id = String(item.itemId || '');
    if (!id || dismissedNeoIds.has(id)) return false;
    return Date.now() < (neoPulseUntil.get(id) || 0);
  }

  function dismissNeo(itemId, opts) {
    const id = String(itemId || '');
    if (!id) return false;
    const showing = !dismissedNeoIds.has(id) && Date.now() < (neoPulseUntil.get(id) || 0);
    dismissedNeoIds.add(id);
    neoPulseUntil.delete(id);
    if (!showing) return false;
    if (!opts?.silent && openEntryId) fillDrawer(openEntryId);
    return true;
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
    allBoardEntries().forEach((entry) => {
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
    allBoardEntries().forEach((entry) => {
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
    neoPulseUntil.forEach((stamp) => {
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
    const sid = String(alert.sessionId || '');
    const entry = findEntry(sid);
    const label = entry
      ? entryTitle(entry)
      : (alert.kind === 'pickup'
        ? txt('pickupPrefix')
        : (alert.kind === 'delivery'
          ? txt('deliveryPrefix')
          : `${txt('tablePrefix')} ${Number(alert.tableNumber) || 0}`));
    el.innerHTML = `
      <p class="kt-note-toast__table">${escapeHtml(label)}</p>
      <p class="kt-note-toast__dish">${escapeHtml(dishName(alert.item))}</p>
      <p class="kt-note-toast__text">${escapeHtml(kitchenNoteText(alert.item))}</p>
      <button type="button" class="kt-note-toast__open" data-kt-note-open-sid="${escapeHtml(sid)}">${escapeHtml(txt('noteOpenTable'))}</button>
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
            sessionId: entry.order?.sessionId || '',
            kind: entry.kind || 'tables',
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
    const items = [];
    list.forEach((order) => {
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      const wavePrinted = isPrinted(order);
      /* Kitchen sees a wave only after Admin confirm+print */
      if (!wavePrinted) return;
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
      customerName: String(session.customer_name || '').trim(),
      publicOrderNo: session.public_order_no == null ? null : Number(session.public_order_no),
      fulfillmentType: String(session.fulfillment_type || '') === 'delivery' ? 'delivery' : 'pickup',
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

  function makeBoardEntry(session, orders, kind, tableNumber) {
    const match = flattenDineIn(session, orders);
    if (!match || !match.items.length) return null;
    if (kind !== 'tables') match.tableNumber = null;
    return {
      kind,
      tableNumber: kind === 'tables' ? tableNumber : null,
      uiStatus: resolveUiStatus(match),
      order: match,
      itemCount: countableItems(match.items).reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
      openedAt: match.createdAt || null,
    };
  }

  function buildBoards(rows) {
    const byTable = new Map();
    const pickup = [];
    const delivery = [];
    (rows || []).forEach(({ session, orders }) => {
      const classified = typesApi?.classifyOrderType?.(session?.order_type, 'kitchen-board') || session?.order_type;
      if (classified === 'dine_in' || classified === 'dinein') {
        const n = Number(session?.table_number);
        if (!Number.isInteger(n) || n < TABLE_MIN || n > TABLE_MAX) return;
        byTable.set(n, { session, orders });
        return;
      }
      if (classified !== 'takeaway') return;
      const kind = isDeliverySession(session) ? 'delivery' : 'pickup';
      const entry = makeBoardEntry(session, orders, kind, null);
      if (entry) (kind === 'delivery' ? delivery : pickup).push(entry);
    });

    const tables = [];
    for (let n = TABLE_MIN; n <= TABLE_MAX; n += 1) {
      const hit = byTable.get(n);
      if (!hit) continue;
      const entry = makeBoardEntry(hit.session, hit.orders, 'tables', n);
      if (entry) tables.push(entry);
    }
    const byOpened = (a, b) => (Date.parse(a.openedAt || 0) || 0) - (Date.parse(b.openedAt || 0) || 0);
    pickup.sort(byOpened);
    delivery.sort(byOpened);
    return { tables, pickup, delivery };
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

  function dishReadyBtn(group, index) {
    const ready = Boolean(group.allReady);
    return `
      <button type="button"
        class="kt-ready${ready ? ' is-on' : ''}"
        data-kt-dish-toggle="${escapeHtml(String(index))}"
        aria-pressed="${ready ? 'true' : 'false'}"
        aria-label="${escapeHtml(ready ? txt('dishReady') : txt('dishWait'))}"
      ></button>
    `;
  }

  function unitStepperHtml(group, index) {
    const remaining = Number(group.remainingQty) || 0;
    const total = Number(group.totalQty) || 0;
    const minusOff = remaining <= 0;
    const plusOff = remaining >= total;
    return `
      <div class="kt-unit" dir="ltr">
        <button type="button" class="kt-unit__btn" data-kt-unit-delta="-1" data-kt-unit-group="${escapeHtml(String(index))}" ${minusOff ? 'disabled' : ''} aria-label="−">−</button>
        <span class="kt-unit__n">${escapeHtml(String(remaining))}</span>
        <button type="button" class="kt-unit__btn" data-kt-unit-delta="1" data-kt-unit-group="${escapeHtml(String(index))}" ${plusOff ? 'disabled' : ''} aria-label="+">+</button>
      </div>
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
      ? `+ ${qty} × ${dishName(item)}`
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

  function overdueItemIds(entry) {
    return unreadyMains(entry?.order?.items)
      .filter((item) => {
        const start = ts(item.createdAt);
        return start > 0 && Date.now() - start >= LATE_MS;
      })
      .map((item) => String(item.itemId))
      .sort();
  }

  function overdueVisualKey(entry) {
    const ids = overdueItemIds(entry).join(',');
    return `${entry?.order?.sessionId || entry?.tableNumber || ''}:${ids}`;
  }

  function showOverdueVisual(entry) {
    if (!isOverdue(entry)) return false;
    const key = overdueVisualKey(entry);
    return Boolean(key) && !dismissedLateKeys.has(key);
  }

  function dismissOverdueVisual(entry) {
    const key = overdueVisualKey(entry);
    if (key) dismissedLateKeys.add(key);
  }

  function renderGroupedDish(group, index) {
    const ready = Boolean(group.allReady);
    const neoItem = (group.mains || []).find((item) => showNeo(item));
    const neo = Boolean(neoItem);
    const urgent = Boolean(group.anyUrgent) && !ready;
    const qty = Number(group.totalQty) || 1;
    const item = group.main;
    const kids = (group.sides || []).map((side) => renderSide(side, ready)).join('');
    return `
      <article class="kt-dish-group ${ready ? 'is-ready' : 'is-waiting'}${neo ? ' is-late' : ''}${urgent ? ' is-urgent' : ''}"${neo ? ` data-kt-neo="${escapeHtml(neoItem.itemId)}"` : ''}>
        <div class="kt-dish kt-dish--main ${ready ? 'is-ready' : 'is-waiting'}" data-item-id="${escapeHtml(item.itemId)}">
          <div class="kt-dish__top">
            <span class="kt-dish__name">${urgent ? `<span class="kt-urgent-tag">${escapeHtml(txt('dishUrgent'))}</span>` : ''}${neo ? `<span class="kt-new-tag">${escapeHtml(txt('dishNew'))}</span>` : ''}${escapeHtml(String(qty))} × ${escapeHtml(dishName(item))}</span>
            ${ready || qty <= 1 ? dishReadyBtn(group, index) : unitStepperHtml(group, index)}
          </div>
        </div>
        ${kids ? `<div class="kt-dish__kids">${kids}</div>` : ''}
        ${noteHtml(group.noteItem || item)}
      </article>
    `;
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

  function updateBoardBadges() {
    const setBadge = (id, n) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = String(n);
      el.hidden = n <= 0;
    };
    setBadge('kt-tables-badge', tableBoard.length);
    setBadge('kt-pickup-badge', pickupBoard.length);
    setBadge('kt-delivery-badge', deliveryBoard.length);
  }

  function renderCard(entry) {
    const counts = readyCounts(entry.order?.items);
    const allDone = Boolean(entry.order?.kitchenAllReady) && counts.allReady;
    const urgentList = urgentMains(entry.order?.items);
    const urgent = !allDone && urgentList.length > 0;
    const urgentPulse = urgent && showUrgentVisual(entry);
    const wave = !urgentPulse && hasWavePulse(entry);
    const overdue = !allDone && !urgentPulse && !wave && showOverdueVisual(entry);
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
    const named = entry.kind === 'pickup' || entry.kind === 'delivery';
    return `
      <button type="button"
        class="kt-table-card${named ? ' is-named' : ''} is-${escapeHtml(cardTone(entry.uiStatus))}${fresh ? ' is-fresh' : ''}${wave ? ' is-wave' : ''}${urgentPulse ? ' is-urgent' : ''}${urgent && !urgentPulse ? ' is-urgent-seen' : ''}${overdue ? ' is-late' : ''}${allDone && !wave ? ' is-allready' : ''}${noteTone ? ' is-note' : ''}${hasNotes ? ' has-notes' : ''}"
        data-kt-entry="${escapeHtml(String(entry.order?.sessionId || ''))}"
      >
        ${face ? `<span class="kt-table-card__face" aria-hidden="true">${face}</span>` : ''}
        <span class="kt-table-card__num">${escapeHtml(entryCardNum(entry))}</span>
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
        : `<p class="kt-news__empty">${escapeHtml(emptyMessage())}</p>`;
    }
    renderPrepBoard();
    schedulePulseExpiry();
    updateBoardBadges();
    chimeIfNewlyOverdue();
    if (openEntryId) fillDrawer(openEntryId);
  }

  function fillDrawer(sessionId) {
    const entry = findEntry(sessionId) || board.find((row) => String(row.order?.sessionId || '') === String(sessionId));
    if (!entry?.order) {
      closeDrawer();
      return;
    }
    openEntryId = String(entry.order.sessionId || '');
    if (drawerTitle) drawerTitle.textContent = entryTitle(entry);
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
      const groups = dishGroups?.buildDisplayGroups?.(entry.order.items) || [];
      lastDishGroups = groups;
      drawerItems.innerHTML = groups.length
        ? groups.map((row, index) => renderGroupedDish(row, index)).join('')
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
    openEntryId = null;
    if (drawerEl) drawerEl.hidden = true;
    const allReadyBtn = document.getElementById('kt-all-ready');
    if (allReadyBtn) allReadyBtn.hidden = true;
  }

  if (drawerEl && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      if (drawerEl.hidden) openEntryId = null;
    }).observe(drawerEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  function setTab(tab) {
    let next = currentTab;
    if (tab === 'alerts') next = 'alerts';
    else if (tab === 'pickup' || tab === 'delivery' || tab === 'tables') next = tab;
    else return;
    const changed = next !== currentTab;
    currentTab = next;
    document.querySelectorAll('[data-kt-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.ktTab === currentTab);
    });
    if (viewTables) viewTables.hidden = currentTab === 'alerts';
    if (viewAlerts) viewAlerts.hidden = currentTab !== 'alerts';
    if (currentTab === 'alerts' || changed) closeDrawer();
    if (currentTab !== 'alerts') {
      syncVisibleBoard();
      if (changed) renderBoard();
    }
  }

  async function loadBoard() {
    if (!api?.getOpenSessionsWithOrders) {
      setError(txt('boardFail'));
      return;
    }
    try {
      const rows = await api.getOpenSessionsWithOrders();
      const next = buildBoards(rows);
      const flat = [...next.tables, ...next.pickup, ...next.delivery];
      if (!primed) {
        seedNoteAlertVersions(flat);
        seedWavePulses(flat);
        seedNeoPulses(flat);
        seedLateChimed(flat);
        ringIfNewContent(flat);
      } else {
        ringIfNewContent(flat);
        queueNoteAlerts(collectNewNoteAlerts(flat));
        touchWavePulses(flat);
        touchNeoPulses(flat);
      }
      primed = true;
      tableBoard = next.tables;
      pickupBoard = next.pickup;
      deliveryBoard = next.delivery;
      syncVisibleBoard();
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
    await dishGroups.peelOneUnit(api, item, allItems, unitStatus);
  }

  async function adjustDishGroup(index, delta) {
    if (sending) return;
    const group = lastDishGroups[Number(index)];
    if (!group || !dishGroups?.bumpGroup) return;
    const entry = findEntryByItemId(group.main?.itemId);
    const allItems = entry?.order?.items || [];
    hushRing();
    sending = true;
    try {
      const result = await dishGroups.bumpGroup(api, group, allItems, delta);
      if (!result?.ok) return;
      setError('');
      await loadBoard();
    } catch (err) {
      setError(err?.message || txt('statusFail'));
    } finally {
      sending = false;
    }
  }

  async function ackItemNote(itemId) {
    if (sending) return;
    hushRing();
    const id = String(itemId || '');
    const entry = findEntryByItemId(id);
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

  async function toggleItemReady(index) {
    const group = lastDishGroups[Number(index)];
    if (!group) return;
    await adjustDishGroup(index, group.allReady ? 1 : -1);
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
    const btn = event.target.closest('[data-kt-entry]');
    if (!btn || btn.disabled) return;
    const sessionId = String(btn.dataset.ktEntry || '');
    const entry = findEntry(sessionId);
    if (!entry?.order) return;
    if (isFresh(entry)) {
      startKitchen(entry);
      if (hasUrgent(entry)) {
        dismissUrgentVisual(entry);
        renderBoard();
        fillDrawer(sessionId);
        return;
      }
      if (unreadNoteCount(entry.order?.items)) fillDrawer(sessionId);
      return;
    }
    if (hasUrgent(entry)) {
      dismissUrgentVisual(entry);
      renderBoard();
      fillDrawer(sessionId);
      return;
    }
    if (showOverdueVisual(entry)) {
      dismissOverdueVisual(entry);
      renderBoard();
      fillDrawer(sessionId);
      return;
    }
    if (hasNewWave(entry)) {
      ackKitchenWave(entry);
      return;
    }
    if (sending) return;
    fillDrawer(sessionId);
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
    const noteOpen = event.target.closest('[data-kt-note-open-sid], [data-kt-note-open]');
    if (noteOpen) {
      hideNoteToast();
      const sid = noteOpen.dataset.ktNoteOpenSid || '';
      const tableNumber = Number(noteOpen.dataset.ktNoteOpen);
      const entry = sid
        ? findEntry(sid)
        : (Number.isFinite(tableNumber)
          ? allBoardEntries().find((row) => row.tableNumber === tableNumber)
          : null);
      if (entry?.order?.sessionId) {
        const tab = entry.kind === 'pickup' || entry.kind === 'delivery' ? entry.kind : 'tables';
        setTab(tab);
        fillDrawer(entry.order.sessionId);
      }
      return;
    }
    const noteAck = event.target.closest('[data-kt-note-ack]');
    if (noteAck) {
      ackItemNote(noteAck.dataset.ktNoteAck);
      return;
    }
    const unitBtn = event.target.closest('[data-kt-unit-group]');
    if (unitBtn) {
      if (unitBtn.disabled) return;
      const neoId = unitBtn.closest('[data-kt-neo]')?.dataset.ktNeo;
      if (neoId) dismissNeo(neoId, { silent: true });
      adjustDishGroup(unitBtn.dataset.ktUnitGroup, Number(unitBtn.dataset.ktUnitDelta));
      return;
    }
    const toggle = event.target.closest('[data-kt-dish-toggle]');
    if (toggle) {
      const neoId = toggle.closest('[data-kt-neo]')?.dataset.ktNeo;
      if (neoId) dismissNeo(neoId, { silent: true });
      toggleItemReady(toggle.dataset.ktDishToggle);
      return;
    }
    const neoRow = event.target.closest('[data-kt-neo]');
    if (neoRow) {
      dismissNeo(neoRow.dataset.ktNeo);
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
