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
  let currentPane = 'alerts';
  let refreshTimer = null;
  let unsubscribe = null;
  let active = false;
  let boardPrimed = false;
  let seenSessions = new Set();
  let seenWaves = new Set();

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function isAddon(item) {
    return Boolean(item?.linkedToMainItemId);
  }

  function compareItems(a, b) {
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

  function notify(title, body) {
    global.LechaimAdminKitchen?.notify?.(title, body, false);
  }

  function mapItem(row, extras) {
    return {
      itemId: String(row.id),
      productId: String(row.product_id || ''),
      name: String(row.product_name || row.print_name || row.product_id || ''),
      printName: String(row.print_name || ''),
      qty: Number(row.quantity) || 0,
      notes: row.notes == null ? '' : String(row.notes),
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      createdAt: row.created_at || null,
      kitchenStatus: api?.normalizeKitchenStatus?.(row.kitchen_status) || 'waiting',
      wavePrintedAt: extras?.printedAt || null,
    };
  }

  function ts(value) {
    const n = Date.parse(value || '');
    return Number.isFinite(n) ? n : 0;
  }

  function flatten(session, orders) {
    const items = [];
    [...(orders || [])].forEach((order) => {
      if (!order?.printed_at) return;
      (order.order_items || []).forEach((row) => {
        const mapped = mapItem(row, { printedAt: order.printed_at });
        if (mapped.qty > 0) items.push(mapped);
      });
    });
    if (!items.length) return null;
    const startedAt = session.kitchen_started_at || null;
    items.forEach((item) => {
      item.isLate = Boolean(startedAt) && ts(item.wavePrintedAt) > ts(startedAt) + 800;
    });
    return {
      sessionId: String(session.session_id),
      tableNumber: Number(session.table_number),
      kitchenAllReady: Boolean(session.kitchen_all_ready),
      kitchenStarted: Boolean(session.kitchen_started_at),
      kitchenStartedAt: startedAt,
      kitchenWaveAckAt: session.kitchen_wave_ack_at || startedAt,
      remoteOrders: orders || [],
      items,
    };
  }

  function hasNewWave(entry) {
    if (!entry?.kitchenStarted) return false;
    const ack = ts(entry.kitchenWaveAckAt) || ts(entry.kitchenStartedAt);
    return (entry.remoteOrders || []).some((row) => ts(row.printed_at) > ack + 800);
  }

  function counts(items) {
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
      if (item.linkedToMainItemId) return;
      const sides = (sidesByParent.get(String(item.itemId)) || []).slice().sort(compareItems);
      sides.forEach((side) => used.add(String(side.itemId)));
      groups.push({ main: item, sides });
    });
    list.forEach((item) => {
      if (!item.linkedToMainItemId || used.has(String(item.itemId))) return;
      groups.push({ main: item, sides: [] });
    });
    groups.sort((a, b) => {
      const aLate = a.main.isLate && !isReady(a.main) ? 0 : 1;
      const bLate = b.main.isLate && !isReady(b.main) ? 0 : 1;
      if (aLate !== bLate) return aLate - bLate;
      return compareItems(a.main, b.main);
    });
    return groups;
  }

  function dishHtml(item, isSide, groupReady) {
    const ready = isSide ? Boolean(groupReady) : isReady(item);
    const late = !isSide && Boolean(item.isLate) && !ready;
    const qty = Number(item.qty) > 1 || !isSide ? ` × ${escapeHtml(String(item.qty))}` : '';
    const label = isSide ? `+ ${bonName(item)}${qty}` : `${bonName(item)}${qty}`;
    return `
      <article class="kitchen-ready-dish${ready ? ' is-ready' : ''}${isSide ? ' is-side' : ''}${late ? ' is-late' : ''}">
        <span>${isSide ? '' : `${ready ? '✅' : '⬜'} `}${late ? '<em class="kitchen-ready-new">חדש</em> ' : ''}${escapeHtml(label)}</span>
        ${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}
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
    if (detailMeta) {
      detailMeta.textContent = allDone
        ? '✅ הכל מוכן במטבח'
        : (!entry.kitchenStarted
          ? 'חדש — ממתין למטבח'
          : (hasNewWave(entry)
            ? 'גל חדש — ממתין לאישור במטבח'
            : `בהכנה · ${tally.ready} מתוך ${tally.total} מוכנים`));
    }
    if (detailItems) {
      const groups = groupItems(entry.items);
      detailItems.innerHTML = groups.map((row) => `
        <div class="kitchen-ready-group">
          ${dishHtml(row.main, false)}
          ${row.sides.map((side) => dishHtml(side, true, isReady(row.main))).join('')}
        </div>
      `).join('');
    }
    detailEl.hidden = false;
  }

  function renderBoard() {
    const html = board.map((entry) => {
      const tally = counts(entry.items);
      const allDone = entry.kitchenAllReady && tally.allReady;
      const fresh = !entry.kitchenStarted && !allDone;
      const wave = !fresh && hasNewWave(entry) && !allDone;
      const stateClass = allDone ? ' is-done' : (fresh ? ' is-fresh' : (wave ? ' is-wave' : ' is-cooking'));
      const label = allDone
        ? '✅ הכל מוכן'
        : (fresh
          ? 'חדש במטבח'
          : (wave
            ? 'גל חדש'
            : `בהכנה · ${escapeHtml(String(tally.ready))} מתוך ${escapeHtml(String(tally.total))}`));
      return `
        <button type="button" class="kitchen-ready-card${stateClass}" data-kitchen-table="${escapeHtml(String(entry.tableNumber))}">
          <strong>שולחן ${escapeHtml(String(entry.tableNumber))}</strong>
          <span>${label}</span>
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
          if (hasNewWave(entry)) {
            let latest = 0;
            (entry.remoteOrders || []).forEach((row) => {
              latest = Math.max(latest, ts(row.printed_at));
            });
            const waveKey = `${entry.sessionId}:${latest}`;
            if (!seenWaves.has(waveKey)) {
              notify('מטבח', `שולחן ${entry.tableNumber} — גל חדש`);
            }
          }
        });
      }
      seenSessions = new Set(next.map((entry) => entry.sessionId));
      seenWaves = new Set(next.filter(hasNewWave).map((entry) => {
        let latest = 0;
        (entry.remoteOrders || []).forEach((row) => {
          latest = Math.max(latest, ts(row.printed_at));
        });
        return `${entry.sessionId}:${latest}`;
      }));
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
      if (prev !== next && (next === 'ready' || prev === 'ready') && !payload?.new?.parent_item_id) {
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

    if (table === 'order_sessions' && event === 'UPDATE') {
      const now = Boolean(payload?.new?.kitchen_all_ready);
      const hadOld = payload?.old && Object.prototype.hasOwnProperty.call(payload.old, 'kitchen_all_ready');
      const was = hadOld ? Boolean(payload.old.kitchen_all_ready) : now;
      if (hadOld && !was && now) {
        const n = Number(payload?.new?.table_number);
        notify('מטבח', Number.isInteger(n) ? `כל ההזמנה של שולחן ${n} מוכנה` : 'כל ההזמנה מוכנה');
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
  }

  function stop() {
    active = false;
    window.clearTimeout(refreshTimer);
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

  global.LechaimAdminKitchenBoard = { start, stop, refresh: loadBoard };
})(window);
