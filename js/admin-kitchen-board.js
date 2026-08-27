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
  let pollTimer = null;

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
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      createdAt: row.created_at || null,
      kitchenStatus: api?.normalizeKitchenStatus?.(row.kitchen_status) || 'waiting',
      kitchenUrgent: Boolean(row.kitchen_urgent),
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
    groups.sort((a, b) => {
      const aUrgent = a.main.kitchenUrgent && !isReady(a.main) ? 0 : 1;
      const bUrgent = b.main.kitchenUrgent && !isReady(b.main) ? 0 : 1;
      if (aUrgent !== bUrgent) return aUrgent - bUrgent;
      const aLate = a.main.isLate && !isReady(a.main) ? 0 : 1;
      const bLate = b.main.isLate && !isReady(b.main) ? 0 : 1;
      if (aLate !== bLate) return aLate - bLate;
      return compareItems(a.main, b.main);
    });
    return groups;
  }

  function dishHtml(item, isSide, groupReady) {
    const ready = isSide || isAddon(item) ? Boolean(groupReady) : isReady(item);
    const late = !isSide && !isAddon(item) && Boolean(item.isLate) && !ready;
    const qty = Number(item.qty) > 1 || !isSide ? ` × ${escapeHtml(String(item.qty))}` : '';
    const label = isSide || isAddon(item) ? `+ ${bonName(item)}${qty}` : `${bonName(item)}${qty}`;
    const showCheck = !isSide && !isAddon(item);
    const urgent = !isSide && !isAddon(item) && Boolean(item.kitchenUrgent) && !ready;
    const noteField = (isSide || isAddon(item))
      ? (item.notes ? `<small>${escapeHtml(item.notes)}</small>` : '')
      : `<textarea class="kitchen-ready-note" data-kitchen-note="${escapeHtml(item.itemId)}" rows="2" maxlength="180" placeholder="הערה למטבח — כפי בקשת הלקוח">${escapeHtml(item.notes || '')}</textarea>`;
    const urgentBtn = (isSide || isAddon(item))
      ? ''
      : `<button type="button" class="kitchen-ready-urgent${item.kitchenUrgent && !ready ? ' is-on' : ''}" data-kitchen-urgent="${escapeHtml(item.itemId)}">${item.kitchenUrgent && !ready ? 'דחוף ✓' : 'דחוף'}</button>`;
    return `
      <article class="kitchen-ready-dish${ready ? ' is-ready' : ''}${isSide || isAddon(item) ? ' is-side' : ''}${late ? ' is-late' : ''}${urgent ? ' is-urgent' : ''}">
        <span>${showCheck ? `${ready ? '✅' : '⬜'} ` : ''}${late ? '<em class="kitchen-ready-new">חדש</em> ' : ''}${escapeHtml(label)}</span>
        ${urgentBtn}
        ${noteField}
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
    const editing = Boolean(
      detailItems
      && detailItems.contains(document.activeElement)
      && document.activeElement.hasAttribute('data-kitchen-note')
    );
    if (detailItems && !editing) {
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

  function hasUrgent(entry) {
    return (entry?.items || []).some((item) => item.kitchenUrgent && !isAddon(item) && !isReady(item));
  }

  function renderBoard() {
    const html = board.map((entry) => {
      const tally = counts(entry.items);
      const allDone = entry.kitchenAllReady && tally.allReady;
      const urgent = !allDone && hasUrgent(entry);
      const fresh = !entry.kitchenStarted && !allDone && !urgent;
      const wave = !fresh && !urgent && hasNewWave(entry) && !allDone;
      const stateClass = allDone ? ' is-done' : (urgent ? ' is-urgent' : (fresh ? ' is-fresh' : (wave ? ' is-wave' : ' is-cooking')));
      const label = allDone
        ? '✅ הכל מוכן'
        : (urgent
          ? 'דחוף'
          : (fresh
            ? 'חדש במטבח'
            : (wave
              ? 'גל חדש'
              : `בהכנה · ${escapeHtml(String(tally.ready))} מתוך ${escapeHtml(String(tally.total))}`)));
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

  async function saveDishNote(input) {
    const id = String(input?.dataset?.kitchenNote || '');
    if (!id || !api?.updateItemNotes) return;
    const next = String(input.value || '').trim();
    const entry = board.find((row) => row.tableNumber === Number(openTable));
    const item = (entry?.items || []).find((row) => String(row.itemId) === id);
    if (!item || String(item.notes || '') === next) return;
    try {
      await api.updateItemNotes(id, next);
      item.notes = next;
    } catch (err) {
      console.warn('[admin-kitchen-board] note save failed', err);
    }
  }

  detailItems?.addEventListener('focusout', (event) => {
    const input = event.target.closest('[data-kitchen-note]');
    if (input) saveDishNote(input);
  });

  detailItems?.addEventListener('click', async (event) => {
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
