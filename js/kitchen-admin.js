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
  let seenTableKeys = new Set();
  let seenItemIds = new Set();
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
      productId: String(row.product_id || ''),
      name: String(row.product_name || row.print_name || row.product_id || ''),
      printName: String(row.print_name || ''),
      qty: Number(row.quantity) || 0,
      notes: row.notes == null ? '' : String(row.notes),
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      createdAt: row.created_at || extras.createdAt || null,
      kitchenStatus: kitchenStatus(row.kitchen_status),
      wavePrinted: Boolean(extras.wavePrinted),
    };
  }

  function flattenDineIn(session, orders) {
    const items = [];
    [...(orders || [])].forEach((order) => {
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      const wavePrinted = isPrinted(order);
      if (!wavePrinted) return;
      lines.forEach((row) => {
        const mapped = mapItem(row, { wavePrinted, createdAt: row.created_at || order.created_at });
        if (mapped.qty > 0) items.push(mapped);
      });
    });
    return {
      sessionId: String(session.session_id),
      tableNumber: Number(session.table_number),
      createdAt: session.created_at || null,
      billRequested: Boolean(session.bill_requested || session.status === 'bill_requested'),
      kitchenAllReady: Boolean(session.kitchen_all_ready),
      items,
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

  function itemStats(items) {
    const stats = { waiting: 0, preparing: 0, ready: 0 };
    (items || []).forEach((item) => {
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
        itemCount: match.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
        openedAt: match.createdAt || null,
      });
    }
    return next;
  }

  function groupItems(items) {
    const list = (items || []).filter((item) => Number(item.qty) > 0);
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
      const sides = sidesByParent.get(String(item.itemId)) || [];
      sides.forEach((side) => used.add(String(side.itemId)));
      groups.push({ main: item, sides });
    });
    list.forEach((item) => {
      if (!item.linkedToMainItemId || used.has(String(item.itemId))) return;
      groups.push({ main: item, sides: [] });
    });
    return groups;
  }

  function isDishReady(item) {
    return (item?.kitchenStatus || 'waiting') === 'ready';
  }

  function activeItems(items) {
    return (items || []).filter((item) => Number(item.qty) > 0);
  }

  function readyCounts(items) {
    const list = activeItems(items);
    const ready = list.filter(isDishReady).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const total = list.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    return { ready, total, allReady: total > 0 && list.every(isDishReady) };
  }

  function dishActions(item) {
    if (!item?.itemId) return '';
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

  function renderSide(item) {
    const ready = isDishReady(item);
    return `
      <div class="kt-dish kt-dish--side ${ready ? 'is-ready' : 'is-waiting'}" data-item-id="${escapeHtml(item.itemId)}">
        <span class="kt-dish__name">+ ${escapeHtml(dishName(item))}${Number(item.qty) > 1 ? ` × ${escapeHtml(String(item.qty))}` : ''}</span>
        ${dishActions(item)}
        ${item.notes ? `<p class="kt-dish__notes">${escapeHtml(item.notes)}</p>` : ''}
      </div>
    `;
  }

  function renderDish(item, sides) {
    const ready = isDishReady(item);
    const kids = (sides || []).map(renderSide).join('');
    const groupReady = ready && (sides || []).every(isDishReady);
    return `
      <article class="kt-dish-group ${groupReady ? 'is-ready' : 'is-waiting'}">
        <div class="kt-dish kt-dish--main ${ready ? 'is-ready' : 'is-waiting'}" data-item-id="${escapeHtml(item.itemId)}">
          <div class="kt-dish__top">
            <span class="kt-dish__name">${escapeHtml(dishName(item))} × ${escapeHtml(String(item.qty))}</span>
            ${dishActions(item)}
          </div>
          ${item.notes ? `<p class="kt-dish__notes">${escapeHtml(item.notes)}</p>` : ''}
        </div>
        ${kids ? `<div class="kt-dish__kids">${kids}</div>` : ''}
      </article>
    `;
  }

  function renderCard(entry) {
    const counts = readyCounts(entry.order?.items);
    const allDone = Boolean(entry.order?.kitchenAllReady) && counts.allReady;
    return `
      <button type="button"
        class="kt-table-card is-${escapeHtml(cardTone(entry.uiStatus))}${allDone ? ' is-allready' : ''}"
        data-kt-table="${escapeHtml(String(entry.tableNumber))}"
      >
        <span class="kt-table-card__num">${escapeHtml(String(entry.tableNumber))}</span>
        <span class="kt-table-card__status">${escapeHtml(statusLabel(entry.uiStatus))}</span>
        <span class="kt-table-card__items">${escapeHtml(String(counts.ready))} / ${escapeHtml(String(counts.total))} ${escapeHtml(txt('readyCount'))}</span>
        ${(() => {
          const names = groupItems(entry.order?.items)
            .map((row) => dishName(row.main))
            .filter(Boolean)
            .slice(0, 4)
            .join(' · ');
          return names ? `<span class="kt-table-card__dishes">${escapeHtml(names)}</span>` : '';
        })()}
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
      drawerMeta.innerHTML = `
        <p class="kt-table-meta__row">${escapeHtml(statusLabel(entry.uiStatus))} · ${escapeHtml(String(counts.ready))} / ${escapeHtml(String(counts.total))} ${escapeHtml(txt('readyCount'))}</p>
        ${allDone ? `<p class="kt-table-meta__done">${escapeHtml(txt('allReadyDone'))}</p>` : statsHtml(entry.order.items)}
      `;
    }
    if (drawerItems) {
      const groups = groupItems(entry.order.items);
      drawerItems.innerHTML = groups.length
        ? groups.map((row) => renderDish(row.main, row.sides)).join('')
        : `<p class="kt-news__empty">${escapeHtml(txt('dishesEmpty'))}</p>`;
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
  }

  async function loadBoard() {
    if (!api?.getOpenSessionsWithOrders) {
      setError(txt('boardFail'));
      return;
    }
    try {
      const rows = await api.getOpenSessionsWithOrders();
      const next = buildBoard(rows);
      if (primed) {
        const newTable = next.some((entry) => !seenTableKeys.has(entry.tableNumber));
        const newTicket = next.some((entry) =>
          (entry.order?.items || []).some((item) => item.wavePrinted && !seenItemIds.has(String(item.itemId)))
        );
        if (newTable || newTicket) playNewTicketChime();
      }
      primed = true;
      seenTableKeys = new Set(next.map((entry) => entry.tableNumber));
      seenItemIds = new Set(
        next.flatMap((entry) => (entry.order?.items || []).map((item) => String(item.itemId)))
      );
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

  async function toggleItemReady(itemId) {
    if (sending) return;
    const item = board
      .flatMap((entry) => entry.order?.items || [])
      .find((row) => String(row.itemId) === String(itemId));
    if (!item) return;
    sending = true;
    try {
      await api.updateItemKitchenStatus(itemId, isDishReady(item) ? 'waiting' : 'ready');
      setError('');
      await loadBoard();
    } catch (err) {
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
    fillDrawer(Number(btn.dataset.ktTable));
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

  if (api?.subscribeToOrders) {
    api.subscribeToOrders(() => scheduleRefresh());
  }

  global.LechaimKitchenBoard = {
    applyLang: renderBoard,
  };

  loadBoard();
})(window);
