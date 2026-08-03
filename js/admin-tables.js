/**
 * LECHAIM — Admin Tables board (Stage 5 + Stage 4 Supabase read)
 * Prefers live data from LechaimSupabaseOrders; falls back to localStorage Order Engine.
 * In-admin menu picker to add dishes by category.
 */
(function () {
  'use strict';

  const Engine = () => window.LechaimOrderEngine;
  const OrdersApi = () => window.LechaimSupabaseOrders;
  const gridEl = document.getElementById('tables-grid');
  const takeawaySection = document.getElementById('tables-takeaway');
  const takeawayGrid = document.getElementById('tables-takeaway-grid');
  const takeawayEmpty = document.getElementById('tables-takeaway-empty');
  const closeDeliveriesBtn = document.getElementById('takeaway-close-deliveries-btn');
  const butcherSection = document.getElementById('tables-butcher');
  const butcherGrid = document.getElementById('tables-butcher-grid');
  const butcherEmpty = document.getElementById('tables-butcher-empty');
  const dineInSection = document.getElementById('tables-dinein');
  const tabBadgeTables = document.getElementById('tab-badge-tables');
  const tabBadgeTakeaway = document.getElementById('tab-badge-takeaway');
  const tabBadgeButcher = document.getElementById('tab-badge-butcher');
  const drawer = document.getElementById('table-drawer');
  const drawerBackdrop = document.getElementById('table-drawer-backdrop');
  const drawerClose = document.getElementById('table-drawer-close');
  const drawerTitle = document.getElementById('table-drawer-title');
  const drawerType = document.getElementById('table-drawer-type');
  const drawerMeta = document.getElementById('table-drawer-meta');
  const drawerItems = document.getElementById('table-drawer-items');
  const drawerTotal = document.getElementById('table-drawer-total');
  const drawerDetail = document.getElementById('table-drawer-detail');
  const drawerMenu = document.getElementById('table-drawer-menu');
  const menuBack = document.getElementById('table-menu-back');
  const menuSearch = document.getElementById('table-menu-search');
  const menuCats = document.getElementById('table-menu-cats');
  const menuList = document.getElementById('table-menu-list');
  const successModal = document.getElementById('admin-success-modal');
  const successText = document.getElementById('admin-success-text');
  const successOk = document.getElementById('admin-success-ok');
  const successBackdrop = document.getElementById('admin-success-backdrop');
  const confirmModal = document.getElementById('admin-confirm-modal');
  const confirmText = document.getElementById('admin-confirm-text');
  const confirmYes = document.getElementById('admin-confirm-yes');
  const confirmCancel = document.getElementById('admin-confirm-cancel');
  const confirmBackdrop = document.getElementById('admin-confirm-backdrop');
  const couponModal = document.getElementById('admin-coupon-modal');
  const couponBackdrop = document.getElementById('admin-coupon-backdrop');
  const couponInput = document.getElementById('admin-coupon-input');
  const couponApply = document.getElementById('admin-coupon-apply');
  const couponStatus = document.getElementById('admin-coupon-status');
  const couponTotals = document.getElementById('admin-coupon-totals');
  const couponPrint = document.getElementById('admin-coupon-print');
  const couponCancel = document.getElementById('admin-coupon-cancel');

  let pollTimer = null;
  let selectedKey = null;
  let menuMode = false;
  let menuCategoryId = 'all';
  let menuQuery = '';
  let catalogCache = [];
  let boardCache = [];
  let takeawayCache = [];
  let butcherCache = [];
  let dataSource = 'local'; /* 'supabase' | 'local' */
  let hasSupabaseSnapshot = false;
  let unsubscribeRealtime = null;
  let refreshTimer = null;
  let loadPromise = null;
  const knownOrderIds = new Set();
  let orderIdsSeeded = false;
  const knownEntryStatuses = new Map();
  let entryStatusesSeeded = false;
  let pendingReminderTimer = null;
  let suppressNotifyUntil = 0;
  let approvePrintBusy = false;
  let addProductBusy = false;
  let removeItemBusy = false;
  let confirmResolver = null;
  let pendingBillEntry = null;
  let pendingBillCoupon = null;
  let boardFilter = 'tables'; /* 'tables' | 'takeaway' | 'butcher' */

  function pickupCaches() {
    return [...(takeawayCache || []), ...(butcherCache || [])];
  }
  let watchRunning = false;
  /** Session ids with order_type=shabbat — excluded from dine-in/takeaway boards */
  const shabbatSessionIds = new Set();
  const focusTrapReleases = {
    drawer: null,
    success: null,
    confirm: null,
    coupon: null,
  };

  function setFocusTrap(key, root) {
    if (typeof focusTrapReleases[key] === 'function') {
      focusTrapReleases[key]();
      focusTrapReleases[key] = null;
    }
    if (!root) return;
    const release = window.LechaimFocusTrap?.activate?.(root);
    focusTrapReleases[key] = typeof release === 'function' ? release : null;
  }

  let successAutoCloseTimer = null;

  function clearFocusTrap(key) {
    if (typeof focusTrapReleases[key] === 'function') {
      focusTrapReleases[key]();
    }
    focusTrapReleases[key] = null;
  }

  function showToast(message, options) {
    showSuccessModal(message, options);
  }

  /**
   * Success feedback: animated checkmark, auto-closes (no OK click).
   * @param {string} message
   * @param {{ checkOnly?: boolean, autoCloseMs?: number }} [options]
   */
  function showSuccessModal(message, options = {}) {
    if (!successModal) return;
    window.clearTimeout(successAutoCloseTimer);
    successAutoCloseTimer = null;

    const checkOnly = Boolean(options.checkOnly);
    const autoCloseMs = Number.isFinite(options.autoCloseMs)
      ? Math.max(200, Number(options.autoCloseMs))
      : 500;

    const panel = successModal.querySelector('.admin-modal__panel');
    panel?.classList.toggle('is-check-only', checkOnly);

    if (successText) successText.textContent = message || '';
    if (successOk) successOk.hidden = true;

    /* Restart SVG draw animation */
    const svg = successModal.querySelector('.admin-success-check__svg');
    if (svg) {
      const clone = svg.cloneNode(true);
      svg.replaceWith(clone);
    }

    successModal.hidden = false;
    successModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setFocusTrap('success', successModal);

    successAutoCloseTimer = window.setTimeout(() => {
      successAutoCloseTimer = null;
      closeSuccessModal();
    }, autoCloseMs);
  }

  function closeSuccessModal() {
    if (!successModal) return;
    window.clearTimeout(successAutoCloseTimer);
    successAutoCloseTimer = null;
    clearFocusTrap('success');
    successModal.hidden = true;
    successModal.setAttribute('aria-hidden', 'true');
    successModal.querySelector('.admin-modal__panel')?.classList.remove('is-check-only');
    if (!confirmModal || confirmModal.hidden) {
      document.body.classList.remove('admin-modal-open');
    }
  }

  function closeConfirmModal(result) {
    if (!confirmModal) return;
    clearFocusTrap('confirm');
    confirmModal.hidden = true;
    confirmModal.setAttribute('aria-hidden', 'true');
    if (!successModal || successModal.hidden) {
      document.body.classList.remove('admin-modal-open');
    }
    const resolve = confirmResolver;
    confirmResolver = null;
    if (typeof resolve === 'function') resolve(Boolean(result));
  }

  function showConfirmModal(message, options = {}) {
    if (!confirmModal) {
      return Promise.resolve(window.confirm(String(message || '')));
    }
    if (typeof confirmResolver === 'function') {
      confirmResolver(false);
      confirmResolver = null;
    }
    if (confirmText) confirmText.textContent = message;
    if (confirmYes) {
      confirmYes.textContent = options.yesLabel || 'כן';
    }
    confirmModal.hidden = false;
    confirmModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setFocusTrap('confirm', confirmModal);
    confirmYes?.focus();
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatClock(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function formatElapsed(iso) {
    if (!iso) return '—';
    const start = new Date(iso).getTime();
    if (Number.isNaN(start)) return '—';
    const diff = Math.max(0, Date.now() - start);
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hours > 0) return `${hours}ש׳ ${rem}דק׳`;
    return `${mins} דק׳`;
  }

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  }

  function statusLabel(uiStatus) {
    if (uiStatus === 'pending_print') return 'ממתין לאישור';
    if (uiStatus === 'preparing') return 'בהכנה';
    if (uiStatus === 'active') return 'פעיל';
    if (uiStatus === 'bill_requested') return 'ביקש חשבון';
    return 'פנוי';
  }

  function orderNeedsApprove(order) {
    if (!order?.id || order.printed_at) return false;
    const status = String(order.status || 'submitted').toLowerCase();
    return status === 'submitted' || status === '';
  }

  function orderNeedsPrint(order) {
    if (!order?.id || order.printed_at) return false;
    return String(order.status || '').toLowerCase() === 'preparing';
  }

  function hasUnprintedRemoteOrders(orders) {
    return (orders || []).some((order) => order && order.id && !order.printed_at);
  }

  function hasOrdersNeedingApprove(orders) {
    return (orders || []).some(orderNeedsApprove);
  }

  function hasOrdersNeedingPrint(orders) {
    return (orders || []).some(orderNeedsPrint);
  }

  function resolveEntryUiStatus(synthetic) {
    if (!synthetic) return 'free';
    const remote = synthetic._remoteOrders || [];
    if (hasOrdersNeedingApprove(remote)) return 'pending_print';
    if (hasOrdersNeedingPrint(remote)) return 'preparing';
    if (hasUnprintedRemoteOrders(remote)) return 'pending_print';
    if (synthetic.status === 'bill_requested') return 'bill_requested';
    return 'active';
  }

  function isDeliveryOrder(order) {
    if (!order) return false;
    if (String(order.fulfillmentType || '') === 'delivery') return true;
    return Boolean(String(order.customerAddress || '').trim());
  }

  function orderTypeLabel(orderType, order) {
    if (orderType === 'butcher') return 'חנות בשר';
    if (orderType === 'takeaway') {
      return isDeliveryOrder(order) ? 'משלוח' : 'איסוף עצמי';
    }
    if (orderType === 'dinein') return 'ישיבה במקום';
    return '—';
  }

  function formatPickupLabel(order) {
    if (!order) return 'בהקדם';
    if (order.pickupType === 'TIME' && order.pickupTime) return String(order.pickupTime);
    return 'בהקדם';
  }

  function formatMoneyEuro(amount) {
    const n = Number(amount) || 0;
    return `€${n.toFixed(2)}`;
  }

  function calcOrderSubtotal(order) {
    if (!order) return 0;
    if (order.subtotal != null && Number.isFinite(Number(order.subtotal))) {
      return Number(order.subtotal);
    }
    if (order._sessionTotal != null) return Number(order._sessionTotal) || 0;
    return (order.items || []).reduce((sum, item) => (
      sum + (Number(item.price) || 0) * (Number(item.qty) || 0)
    ), 0);
  }

  function entryKey(entry) {
    if (entry.orderType === 'takeaway' || entry.orderType === 'butcher') {
      const prefix = entry.orderType === 'butcher' ? 'butcher' : 'takeaway';
      return entry.order?.orderId
        ? `${prefix}:${entry.order.orderId}`
        : prefix;
    }
    return `table:${entry.tableNumber}`;
  }

  function findSelectedEntry(board, takeaway, butcher) {
    if (!selectedKey) return null;
    if (String(selectedKey).startsWith('takeaway')) {
      return (takeaway || []).find((row) => entryKey(row) === selectedKey) || null;
    }
    if (String(selectedKey).startsWith('butcher')) {
      return (butcher || []).find((row) => entryKey(row) === selectedKey) || null;
    }
    const num = Number(String(selectedKey).replace('table:', ''));
    return board.find((row) => row.tableNumber === num) || null;
  }

  function getSelectedEntry() {
    if (!selectedKey) return null;
    return findSelectedEntry(boardCache, takeawayCache, butcherCache);
  }

  function stripWeightFromProductName(name) {
    return String(name || '')
      .replace(/\s*[–-]\s*\d+(?:[.,]\d+)?\s*ק["״]?ג\.?/gi, '')
      .replace(/\s*[–-]\s*\d+(?:[.,]\d+)?\s*kg\b/gi, '')
      .trim();
  }

  function mapRemoteItem(row, extras = {}) {
    const weight = Number(row.selected_weight);
    const name = stripWeightFromProductName(
      row.product_name || row.print_name || row.product_id || ''
    );
    return {
      itemId: String(row.id),
      productId: String(row.product_id || ''),
      name,
      printName: row.print_name || '',
      price: Number(row.price) || 0,
      qty: Number(row.quantity) || 0,
      notes: row.notes == null ? '' : String(row.notes),
      printed: true,
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      createdAt: row.created_at || null,
      isLateAdd: Boolean(extras.isLateAdd),
      selectedWeight: Number.isFinite(weight) && weight > 0 ? weight : null,
      pricePerKg: row.price_per_kg == null ? null : Number(row.price_per_kg),
      unitType: row.unit_type || null,
    };
  }

  function flattenSessionOrders(session, orders) {
    const items = [];
    let total = 0;
    const sortedOrders = [...(orders || [])].sort((a, b) => {
      const ta = Date.parse(a?.created_at || '') || 0;
      const tb = Date.parse(b?.created_at || '') || 0;
      if (ta !== tb) return ta - tb;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });

    sortedOrders.forEach((order) => {
      /* Blue = not printed yet. After Approve & Print → normal color again. */
      const isLateAdd = !order?.printed_at;
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      lines.forEach((row) => {
        const mapped = mapRemoteItem(row, { isLateAdd });
        if (mapped.qty > 0) {
          items.push(mapped);
          total += mapped.price * mapped.qty;
        }
      });
      if (!lines.length && Number(order.total) > 0) {
        total += Number(order.total) || 0;
      }
    });

    const classified = window.LechaimOrderTypes?.classifyOrderType?.(session.order_type, 'admin-tables.flatten')
      ?? (() => {
        const raw = String(session.order_type || '');
        if (raw === 'takeaway') return 'takeaway';
        if (raw === 'butcher') return 'butcher';
        if (raw === 'dine_in' || raw === 'dinein') return 'dine_in';
        if (raw === 'shabbat') return 'shabbat';
        if (raw) console.warn(`[admin-tables] Unknown order type: ${raw}`);
        return null;
      })();
    const uiOrderType = classified === 'butcher'
      ? 'butcher'
      : (classified === 'takeaway'
        ? 'takeaway'
        : (classified === 'dine_in' ? 'dinein' : null));
    let status = 'active';
    if (session.status === 'bill_requested' || session.bill_requested) {
      status = 'bill_requested';
    }

    return {
      orderId: String(session.session_id),
      sessionId: String(session.session_id),
      tableNumber: session.table_number == null ? null : Number(session.table_number),
      orderType: uiOrderType,
      status,
      createdAt: session.created_at || null,
      updatedAt: session.updated_at || null,
      closedAt: session.closed_at || null,
      items,
      couponCode: session.coupon_code || null,
      discountPercent: session.discount_percent == null ? null : Number(session.discount_percent),
      discountAmount: session.discount_amount == null ? null : Number(session.discount_amount),
      subtotal: session.subtotal == null ? null : Number(session.subtotal),
      billTotal: (session.subtotal != null && session.discount_amount != null)
        ? Math.max(0, Number(session.subtotal) - Number(session.discount_amount))
        : null,
      customerName: session.customer_name || null,
      customerPhone: session.customer_phone || null,
      customerNotes: session.notes || null,
      customerAddress: session.customer_address || null,
      fulfillmentType: session.fulfillment_type === 'delivery' ? 'delivery' : (session.fulfillment_type === 'pickup' ? 'pickup' : null),
      pickupType: session.pickup_type || null,
      pickupTime: session.pickup_time || null,
      publicOrderNo: session.public_order_no == null
        ? null
        : Number(session.public_order_no),
      _source: 'supabase',
      _supabaseSessionId: String(session.session_id),
      _remoteOrders: orders || [],
      _sessionTotal: total,
    };
  }

  function buildBoardsFromSupabase(rows) {
    const sessionApi = window.LechaimOrderSession;
    const min = sessionApi?.TABLE_MIN || 60;
    const max = sessionApi?.TABLE_MAX || 73;

    const dineInByTable = new Map();
    const takeaway = [];
    const butcher = [];
    const shabbatOrderIds = [];
    shabbatSessionIds.clear();

    (rows || []).forEach(({ session, orders }) => {
      const classified = window.LechaimOrderTypes?.classifyOrderType?.(session?.order_type, 'admin-tables.board')
        ?? null;

      switch (classified) {
        case 'shabbat':
          if (session?.session_id) shabbatSessionIds.add(String(session.session_id));
          (orders || []).forEach((order) => {
            if (order?.id) shabbatOrderIds.push(String(order.id));
          });
          return; /* Shabbat has its own Admin tab */
        case 'dine_in':
        case 'takeaway':
        case 'butcher':
          break;
        case 'unknown':
          return;
        default:
          if (session?.order_type) {
            window.LechaimOrderTypes?.warnUnknownOrderType?.(session.order_type, 'admin-tables.board');
          }
          return;
      }

      const synthetic = flattenSessionOrders(session, orders);
      if (!synthetic?.orderType) return;
      const isPickupBoard = synthetic.orderType === 'takeaway' || synthetic.orderType === 'butcher';
      /* Keep takeaway/butcher visible even if admin removed all line items */
      if (!isPickupBoard && !synthetic.items.length && !(Number(synthetic._sessionTotal) > 0)) return;

      if (isPickupBoard) {
        const payable = synthetic.billTotal != null ? synthetic.billTotal : synthetic._sessionTotal;
        const entry = {
          tableNumber: null,
          uiStatus: resolveEntryUiStatus(synthetic),
          orderType: synthetic.orderType,
          order: synthetic,
          total: payable,
          itemCount: synthetic.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
          openedAt: synthetic.createdAt,
          updatedAt: synthetic.updatedAt,
        };
        if (synthetic.orderType === 'butcher') butcher.push(entry);
        else takeaway.push(entry);
        return;
      }

      if (synthetic.tableNumber != null) {
        dineInByTable.set(Number(synthetic.tableNumber), synthetic);
      }
    });

    const board = [];
    for (let n = min; n <= max; n += 1) {
      const match = dineInByTable.get(n) || null;
      let uiStatus = 'free';
      if (match) uiStatus = resolveEntryUiStatus(match);
      const payable = match
        ? (match.billTotal != null ? match.billTotal : match._sessionTotal)
        : 0;

      board.push({
        tableNumber: n,
        uiStatus,
        orderType: match?.orderType || 'dinein',
        order: match,
        total: payable,
        itemCount: match
          ? match.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
          : 0,
        openedAt: match?.createdAt || null,
        updatedAt: match?.updatedAt || null,
      });
    }

    return { board, takeaway, butcher, shabbatOrderIds };
  }

  function loadLocalBoards() {
    const engine = Engine();
    return {
      board: engine?.getTablesBoard?.() || [],
      takeaway: engine?.getTakeawayBoard?.() || [],
      butcher: engine?.getButcherBoard?.() || [],
      shabbatOrderIds: [],
      source: 'local',
    };
  }

  async function loadBoardData() {
    const api = OrdersApi();
    if (api?.isConfigured?.()) {
      try {
        const rows = await api.getOpenSessionsWithOrders();
        const built = buildBoardsFromSupabase(rows);
        hasSupabaseSnapshot = true;
        return { ...built, source: 'supabase' };
      } catch (err) {
        console.warn('[admin-tables] Supabase board failed', err);
        /* Keep last successful Supabase board — do not wipe with empty Admin localStorage. */
        if (hasSupabaseSnapshot) {
          console.warn('[admin-tables] keeping last Supabase snapshot (stale-while-revalidate)');
          return {
            board: boardCache,
            takeaway: takeawayCache,
            butcher: butcherCache,
            shabbatOrderIds: [],
            source: 'supabase',
            stale: true,
          };
        }
        console.warn('[admin-tables] no Supabase snapshot yet — falling back to localStorage');
      }
    }
    return loadLocalBoards();
  }

  function setCategoryBadge(el, count) {
    if (!el) return;
    const n = Math.max(0, Number(count) || 0);
    el.textContent = String(n);
    el.setAttribute('data-count', String(n));
    el.hidden = n <= 0;
  }

  function setBoardFilter(filter) {
    if (filter === 'takeaway') boardFilter = 'takeaway';
    else if (filter === 'butcher') boardFilter = 'butcher';
    else boardFilter = 'tables';
    paintBoard(boardCache, takeawayCache, butcherCache);
  }

  function paintPickupGrid(grid, emptyEl, rows) {
    if (!grid) return;
    const list = Array.isArray(rows) ? rows : [];
    if (list.length) {
      grid.innerHTML = list.map(renderCard).join('');
      if (emptyEl) emptyEl.hidden = true;
    } else {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
    }
  }

  function paintBoard(board, takeaway, butcher) {
    if (!gridEl) return;

    const occupiedTables = (board || []).filter((row) => row && row.uiStatus && row.uiStatus !== 'free').length;
    const takeawayCount = (takeaway || []).length;
    const butcherCount = (butcher || []).length;
    setCategoryBadge(tabBadgeTables, occupiedTables);
    setCategoryBadge(tabBadgeTakeaway, takeawayCount);
    setCategoryBadge(tabBadgeButcher, butcherCount);

    const showTakeaway = boardFilter === 'takeaway';
    const showButcher = boardFilter === 'butcher';
    if (dineInSection) dineInSection.hidden = showTakeaway || showButcher;
    if (takeawaySection) takeawaySection.hidden = !showTakeaway;
    if (butcherSection) butcherSection.hidden = !showButcher;

    if (!showTakeaway && !showButcher) {
      gridEl.innerHTML = board.map(renderCard).join('');
    }

    paintPickupGrid(takeawayGrid, takeawayEmpty, takeaway);
    paintPickupGrid(butcherGrid, butcherEmpty, butcher);

    const selected = findSelectedEntry(board, takeaway, butcher);
    if (selectedKey && selected?.order) {
      fillDrawer(selected);
    } else if (selectedKey && (!selected || !selected.order)) {
      closeDrawer();
    }
  }

  async function refreshBoardData() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const data = await loadBoardData();
      boardCache = data.board;
      takeawayCache = data.takeaway;
      butcherCache = data.butcher || [];
      dataSource = data.source;
      if (!data.stale) {
        syncKnownOrderIdsAfterBoardLoad(boardCache, pickupCaches(), data.shabbatOrderIds);
      }
      paintBoard(boardCache, takeawayCache, butcherCache);
    })().finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  }

  function scheduleBoardRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshBoardData().catch((err) => {
        console.warn('[admin-tables] refresh failed', err);
      });
    }, 250);
  }

  function loadCatalog() {
    catalogCache = window.LechaimInventory?.getCatalog?.() || [];
    return catalogCache;
  }

  function getCategories(catalog) {
    const map = new Map();
    catalog.forEach((item) => {
      const id = item.categoryId || 'other';
      if (!map.has(id)) {
        map.set(id, {
          id,
          title: item.categoryTitle || id,
        });
      }
    });
    return [...map.values()];
  }

  function renderCard(entry) {
    const free = entry.uiStatus === 'free';
    const coupon = entry.order?.couponCode;
    const discountPct = entry.order?.discountPercent;
    const isPickup = entry.orderType === 'takeaway' || entry.orderType === 'butcher';
    const isDelivery = entry.orderType === 'takeaway' && isDeliveryOrder(entry.order);
    const badgeText = entry.orderType === 'butcher'
      ? 'חנות בשר'
      : (isDelivery ? 'משלוח' : 'איסוף עצמי');
    const pickupBlock = isPickup
      ? `
        <span class="table-card__badge${entry.orderType === 'butcher' ? ' table-card__badge--butcher' : ''}${isDelivery ? ' table-card__badge--delivery' : ''}">${escapeHtml(badgeText)}</span>
        <span class="table-card__customer">${escapeHtml(entry.order?.customerName || '—')}</span>
        <span class="table-card__phone" dir="ltr">${escapeHtml(entry.order?.customerPhone || '—')}</span>
        ${entry.orderType === 'takeaway' && entry.order?.customerAddress
          ? `<span class="table-card__pickup">כתובת: ${escapeHtml(entry.order.customerAddress)}</span>`
          : ''}
        ${entry.orderType === 'butcher'
          ? ''
          : `<span class="table-card__pickup">${isDelivery ? 'משלוח' : 'איסוף'}: ${escapeHtml(formatPickupLabel(entry.order))}</span>`}
      `
      : '';
    return `
      <button
        type="button"
        class="table-card table-card--${escapeHtml(entry.uiStatus)}${isPickup ? ' table-card--pickup' : ''}"
        data-entry-key="${escapeHtml(entryKey(entry))}"
      >
        <span class="table-card__num">${
          isPickup
            ? escapeHtml(
              entry.order?.publicOrderNo != null
                ? `#${entry.order.publicOrderNo}`
                : 'TA'
            )
            : escapeHtml(String(entry.tableNumber))
        }</span>
        <span class="table-card__status">${escapeHtml(statusLabel(entry.uiStatus))}</span>
        <span class="table-card__type">${escapeHtml(orderTypeLabel(entry.orderType, entry.order))}</span>
        ${pickupBlock}
        <span class="table-card__total">${free ? '€0' : escapeHtml(formatMoney(entry.total))}</span>
        <span class="table-card__items">${free ? '0 פריטים' : `${entry.itemCount} פריטים`}</span>
        ${
          coupon
            ? `<span class="table-card__coupon">קופון −${escapeHtml(String(discountPct != null ? discountPct : ''))}%</span>`
            : ''
        }
        <span class="table-card__time">${
          free
            ? '—'
            : `נפתח ${escapeHtml(formatClock(entry.openedAt))} · ${escapeHtml(formatElapsed(entry.openedAt))}`
        }</span>
      </button>
    `;
  }

  function setDrawerView(view) {
    menuMode = view === 'menu';
    if (drawerDetail) drawerDetail.hidden = menuMode;
    if (drawerMenu) drawerMenu.hidden = !menuMode;
  }

  function buildDrawerItemGroups(items) {
    const list = (Array.isArray(items) ? items : []).filter((item) => item && Number(item.qty) > 0);
    const sidesByParent = new Map();
    list.forEach((item) => {
      const parentId = item.linkedToMainItemId ? String(item.linkedToMainItemId) : '';
      if (!parentId) return;
      if (!sidesByParent.has(parentId)) sidesByParent.set(parentId, []);
      sidesByParent.get(parentId).push(item);
    });

    const usedSideIds = new Set();
    const groups = [];

    list.forEach((item) => {
      if (item.linkedToMainItemId) return;
      const id = String(item.itemId || '');
      const sides = (sidesByParent.get(id) || []).slice();
      sides.forEach((side) => usedSideIds.add(String(side.itemId)));
      groups.push({
        kind: sides.length ? 'main-group' : 'single',
        main: item,
        sides,
      });
    });

    list.forEach((item) => {
      if (!item.linkedToMainItemId) return;
      if (usedSideIds.has(String(item.itemId))) return;
      groups.push({ kind: 'single', main: item, sides: [] });
    });

    return groups;
  }

  function isShakeBaseProduct(productId) {
    return Boolean(window.SHAKE_BASE_IDS?.has?.(String(productId || '')));
  }

  function isFruitShakeProduct(productId) {
    return String(productId || '') === String(window.FRUIT_SHAKE_ID || 'fruit-shake');
  }

  function renderDrawerItemLine(item, options = {}) {
    const isSide = Boolean(options.isSide);
    const lateClass = item.isLateAdd ? ' table-drawer__item--late' : '';
    const sideClass = isSide ? ' table-drawer__item--side' : '';
    const nameLate = item.isLateAdd ? ' table-drawer__name--late' : '';
    const sideBadge = isShakeBaseProduct(item.productId) ? 'בסיס' : 'תוספת';
    return `
      <div class="table-drawer__line${sideClass}${lateClass}">
        ${isSide ? `<span class="table-drawer__side-badge">${sideBadge}</span>` : ''}
        <span class="table-drawer__qty">${escapeHtml(String(item.qty))}×</span>
        <span class="table-drawer__name${nameLate}">${escapeHtml(item.name || item.productId || '')}</span>
        <span class="table-drawer__price">${
          isSide && !(Number(item.price) > 0)
            ? ''
            : escapeHtml(formatMoney((Number(item.price) || 0) * (Number(item.qty) || 0)))
        }</span>
        ${item.itemId
          ? `<button
              type="button"
              class="table-drawer__remove"
              data-remove-item-id="${escapeHtml(String(item.itemId))}"
              aria-label="הסר"
              title="הסר"
            >×</button>`
          : ''}
      </div>
      ${item.notes ? `<p class="table-drawer__notes" dir="auto">${escapeHtml(item.notes)}</p>` : ''}
    `;
  }

  function renderDrawerItemsHtml(items) {
    const groups = buildDrawerItemGroups(items);
    if (!groups.length) {
      return `<p class="table-drawer__empty">אין פריטים בהזמנה</p>`;
    }

    return `
      <ul class="table-drawer__list">
        ${groups.map((group) => {
          const lateClass = group.main.isLateAdd ? ' table-drawer__item--late' : '';
          if (group.kind === 'main-group') {
            const sideNames = group.sides
              .map((side) => side.name || side.productId || '')
              .filter(Boolean)
              .join(', ');
            return `
              <li class="table-drawer__group${lateClass}">
                ${renderDrawerItemLine(group.main)}
                ${sideNames
                  ? `<p class="table-drawer__served">מוגש עם: ${escapeHtml(sideNames)}</p>`
                  : ''}
                <div class="table-drawer__sides">
                  ${group.sides.map((side) => renderDrawerItemLine(side, { isSide: true })).join('')}
                </div>
              </li>
            `;
          }
          return `
            <li class="${lateClass}">
              ${renderDrawerItemLine(group.main)}
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }

  function fillDrawer(entry) {
    const order = entry.order;
    if (!order || !drawer) return;

    if (drawerTitle) {
      if (entry.orderType === 'butcher') {
        drawerTitle.textContent = 'חנות בשר';
      } else if (entry.orderType === 'takeaway') {
        const no = order.publicOrderNo != null ? ` #${order.publicOrderNo}` : '';
        drawerTitle.textContent = `${isDeliveryOrder(order) ? 'משלוח' : 'איסוף עצמי'}${no}`;
      } else {
        drawerTitle.textContent = `שולחן ${entry.tableNumber}`;
      }
    }

    const closeTableBtn = drawer?.querySelector('[data-table-action="close-table"]');
    if (closeTableBtn) {
      if (entry.orderType === 'takeaway' && isDeliveryOrder(order)) {
        closeTableBtn.textContent = 'סגור משלוח';
      } else if (entry.orderType === 'takeaway' || entry.orderType === 'butcher') {
        closeTableBtn.textContent = 'סגור הזמנה';
      } else {
        closeTableBtn.textContent = 'סגור שולחן';
      }
    }
    if (drawerType) {
      drawerType.textContent = menuMode
        ? `${orderTypeLabel(entry.orderType, order)} · הוספת מנות`
        : `${orderTypeLabel(entry.orderType, order)} · ${statusLabel(entry.uiStatus)}`;
    }

    if (drawerMeta) {
      if (entry.orderType === 'butcher') {
        drawerMeta.innerHTML = `
          <div class="table-drawer__pickup">
            <div class="table-drawer__pickup-badge table-drawer__pickup-badge--butcher">חנות בשר</div>
            <div class="table-drawer__pickup-grid">
              <div class="table-drawer__pickup-row">
                <span>שם</span>
                <strong>${escapeHtml(order.customerName || '—')}</strong>
              </div>
              <div class="table-drawer__pickup-row">
                <span>טלפון</span>
                <strong dir="ltr">${escapeHtml(order.customerPhone || '—')}</strong>
              </div>
            </div>
          </div>
        `;
      } else if (entry.orderType === 'takeaway') {
        const delivery = isDeliveryOrder(order);
        drawerMeta.innerHTML = `
          <div class="table-drawer__pickup">
            <div class="table-drawer__pickup-badge">${delivery ? 'משלוח' : 'איסוף עצמי'}${
              order.publicOrderNo != null
                ? ` · #${escapeHtml(String(order.publicOrderNo))}`
                : ''
            }</div>
            <div class="table-drawer__pickup-grid">
              ${order.publicOrderNo != null
                ? `<div class="table-drawer__pickup-row">
                    <span>מס׳ הזמנה</span>
                    <strong>#${escapeHtml(String(order.publicOrderNo))}</strong>
                  </div>`
                : ''}
              <div class="table-drawer__pickup-row">
                <span>שם הלקוח</span>
                <strong>${escapeHtml(order.customerName || '—')}</strong>
              </div>
              ${delivery || order.customerAddress
                ? `<div class="table-drawer__pickup-row">
                    <span>כתובת</span>
                    <strong dir="auto">${escapeHtml(order.customerAddress || '—')}</strong>
                  </div>`
                : ''}
              <div class="table-drawer__pickup-row">
                <span>טלפון</span>
                <strong dir="ltr">${escapeHtml(order.customerPhone || '—')}</strong>
              </div>
              <div class="table-drawer__pickup-row">
                <span>${delivery ? 'משלוח' : 'איסוף'}</span>
                <strong>${escapeHtml(formatPickupLabel(order))}</strong>
              </div>
              ${order.customerNotes
                ? `<div class="table-drawer__pickup-row">
                    <span>הערות</span>
                    <strong class="table-drawer__customer-notes" dir="auto">${escapeHtml(order.customerNotes)}</strong>
                  </div>`
                : ''}
            </div>
          </div>
          <div class="table-drawer__meta-row">
            <div class="table-drawer__meta-item"><span>שעת פתיחה</span><strong>${escapeHtml(formatClock(entry.openedAt))}</strong></div>
            <div class="table-drawer__meta-item"><span>משך</span><strong>${escapeHtml(formatElapsed(entry.openedAt))}</strong></div>
            <div class="table-drawer__meta-item"><span>פריטים</span><strong>${escapeHtml(String(entry.itemCount))}</strong></div>
          </div>
        `;
      } else {
        drawerMeta.innerHTML = `
          <div class="table-drawer__meta-row">
            <div class="table-drawer__meta-item"><span>שעת פתיחה</span><strong>${escapeHtml(formatClock(entry.openedAt))}</strong></div>
            <div class="table-drawer__meta-item"><span>משך</span><strong>${escapeHtml(formatElapsed(entry.openedAt))}</strong></div>
            <div class="table-drawer__meta-item"><span>פריטים</span><strong>${escapeHtml(String(entry.itemCount))}</strong></div>
          </div>
        `;
      }
    }

    if (drawerItems) {
      drawerItems.innerHTML = renderDrawerItemsHtml(order.items);
    }

    if (drawerTotal) {
      const order = entry.order;
      if (order?.couponCode && order.subtotal != null && order.discountAmount != null) {
        const payable = order.billTotal != null
          ? order.billTotal
          : Math.max(0, Number(order.subtotal) - Number(order.discountAmount));
        drawerTotal.innerHTML = `
          <div class="table-drawer__coupon">
            <span>קופון</span>
            <strong dir="ltr">${escapeHtml(order.couponCode)}</strong>
          </div>
          <div class="table-drawer__total-line"><span>לפני הנחה</span><strong>${escapeHtml(formatMoney(order.subtotal))}</strong></div>
          <div class="table-drawer__total-line"><span>הנחה (${escapeHtml(String(order.discountPercent))}%)</span><strong>−${escapeHtml(formatMoney(order.discountAmount))}</strong></div>
          <div class="table-drawer__total-line table-drawer__total-line--pay"><span>סה״כ לתשלום</span><strong>${escapeHtml(formatMoney(payable))}</strong></div>
        `;
      } else {
        drawerTotal.innerHTML = `<span>סה״כ לתשלום</span><strong>${escapeHtml(formatMoney(entry.total))}</strong>`;
      }
    }

    updateApprovePrintButton(entry);
  }

  function updateApprovePrintButton(entry) {
    const approveBtn = document.getElementById('table-approve-order');
    const printBtn = document.getElementById('table-print-order');
    const remote = entry?.order?._remoteOrders || [];
    const needsApprove = hasOrdersNeedingApprove(remote);

    if (approveBtn) {
      approveBtn.hidden = !needsApprove;
      approveBtn.disabled = approvePrintBusy;
    }
    if (printBtn) {
      printBtn.hidden = false;
      printBtn.disabled = approvePrintBusy;
    }
  }

  function suppressCustomerNotify(ms = 4500) {
    suppressNotifyUntil = Date.now() + Math.max(0, Number(ms) || 0);
  }

  function playOrderNotifyChime() {
    try {
      if (Date.now() < suppressNotifyUntil) return;

      const stamp = Date.now();
      if (playOrderNotifyChime._last && stamp - playOrderNotifyChime._last < 1400) return;
      playOrderNotifyChime._last = stamp;

      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = playOrderNotifyChime._ctx || new Ctx();
      playOrderNotifyChime._ctx = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const now = ctx.currentTime;
      /* Loud admin alert — customer events only (new order / bill request) */
      const tones = [
        { freq: 740, at: 0, dur: 0.22 },
        { freq: 988, at: 0.16, dur: 0.24 },
        { freq: 1174, at: 0.34, dur: 0.32 },
        { freq: 988, at: 0.58, dur: 0.28 },
      ];
      tones.forEach((tone) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.42, now + tone.at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (err) {
      console.warn('[admin-tables] notify chime failed', err);
    }
  }

  function collectBoardOrderIds(board, takeaway) {
    const ids = new Set();
    [...(board || []), ...(takeaway || [])].forEach((entry) => {
      (entry?.order?._remoteOrders || []).forEach((order) => {
        if (order?.id) ids.add(String(order.id));
      });
    });
    return ids;
  }

  function boardNeedsAdminAttention(board, takeaway) {
    const dineInNeeds = (board || []).some((entry) => (
      entry?.uiStatus === 'pending_print'
      || entry?.uiStatus === 'preparing'
    ));
    /* Takeaway / delivery / butcher: chime only until Approve — not while waiting for print */
    const pickupNeeds = (takeaway || []).some((entry) => (
      entry?.uiStatus === 'pending_print'
    ));
    return dineInNeeds || pickupNeeds;
  }

  function stopPendingReminder() {
    if (pendingReminderTimer) {
      window.clearInterval(pendingReminderTimer);
      pendingReminderTimer = null;
    }
  }

  /** Re-beep every 15s while cards still need Approve / print action (not bill). */
  function updatePendingReminder(board, takeaway) {
    const needsAttention = boardNeedsAdminAttention(board, takeaway);
    if (!needsAttention) {
      stopPendingReminder();
      return;
    }
    if (pendingReminderTimer) return;
    pendingReminderTimer = window.setInterval(() => {
      if (boardNeedsAdminAttention(boardCache, pickupCaches())) {
        playOrderNotifyChime();
      } else {
        stopPendingReminder();
      }
    }, 15000);
  }

  function syncKnownOrderIdsAfterBoardLoad(board, takeaway, shabbatOrderIds) {
    const current = collectBoardOrderIds(board, takeaway);
    (shabbatOrderIds || []).forEach((id) => {
      if (id) current.add(String(id));
    });
    if (!orderIdsSeeded) {
      current.forEach((id) => knownOrderIds.add(id));
      orderIdsSeeded = true;
      syncCustomerAttentionStatuses(board, takeaway);
      updatePendingReminder(board, takeaway);
      return;
    }

    let shouldChime = false;
    current.forEach((id) => {
      if (!knownOrderIds.has(id)) {
        knownOrderIds.add(id);
        shouldChime = true; /* customer sent a new order wave */
      }
    });
    if (syncCustomerAttentionStatuses(board, takeaway)) shouldChime = true;
    if (shouldChime) playOrderNotifyChime();
    updatePendingReminder(board, takeaway);
  }

  /**
   * Chime only on customer-driven attention: new pending print / bill request.
   * Admin actions (approve print, close table, remove dish) do NOT chime.
   * @returns {boolean}
   */
  function syncCustomerAttentionStatuses(board, takeaway) {
    const entries = [...(board || []), ...(takeaway || [])];
    const nextMap = new Map();
    let customerEvent = false;

    entries.forEach((entry) => {
      if (!entry) return;
      const key = entryKey(entry);
      const status = entry.uiStatus || 'free';
      nextMap.set(key, status);
      if (!entryStatusesSeeded) return;

      const prev = knownEntryStatuses.get(key);
      if (status === 'pending_print' && prev !== 'pending_print') {
        customerEvent = true;
      }
      /* bill_requested: visual only — no chime */
    });

    knownEntryStatuses.clear();
    nextMap.forEach((status, key) => knownEntryStatuses.set(key, status));
    entryStatusesSeeded = true;
    return customerEvent;
  }

  /**
   * Map one Supabase order wave to print-engine shape.
   */
  function mapRemoteWaveToPrintOrder(sessionMeta, order, items) {
    const session = sessionMeta || {};
    const list = Array.isArray(items) ? items : [];
    const mappedItems = list
      .map((row) => {
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) return null;
        return {
          itemId: String(row.id),
          productId: String(row.product_id || ''),
          name: row.print_name || row.product_name || row.product_id || '',
          printName: row.print_name || '',
          price: Number(row.price) || 0,
          qty,
          notes: row.notes == null ? '' : String(row.notes),
          printed: false,
          linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
          createdAt: row.created_at || null,
        };
      })
      .filter(Boolean);

    const rawSessionType = session.orderType || session.order_type || '';
    const isButcher = rawSessionType === 'butcher'
      || String(rawSessionType).toLowerCase().includes('butcher');
    const isTakeaway = rawSessionType === 'takeaway'
      || session.order_type === 'takeaway'
      || String(rawSessionType).toLowerCase().includes('take');
    const resolvedType = isButcher ? 'butcher' : (isTakeaway ? 'takeaway' : 'dinein');

    return {
      orderId: String(order.id),
      sessionId: String(order.session_id || session.sessionId || ''),
      tableNumber: (isTakeaway || isButcher)
        ? null
        : (session.tableNumber != null
          ? Number(session.tableNumber)
          : (session.table_number == null ? null : Number(session.table_number))),
      orderType: resolvedType,
      status: 'active',
      createdAt: order.created_at || null,
      updatedAt: order.updated_at || null,
      items: mappedItems,
      ticketSeq: Number(order.order_number) || 1,
      customerName: session.customerName || session.customer_name || null,
      customerAddress: session.customerAddress || session.customer_address || null,
      fulfillmentType: session.fulfillmentType
        || (session.fulfillment_type === 'delivery' ? 'delivery' : (session.fulfillment_type === 'pickup' ? 'pickup' : null)),
      customerPhone: session.customerPhone || session.customer_phone || null,
      customerNotes: session.customerNotes || session.notes || null,
      pickupType: session.pickupType || session.pickup_type || null,
      pickupTime: session.pickupTime || session.pickup_time || null,
      publicOrderNo: session.publicOrderNo != null
        ? Number(session.publicOrderNo)
        : (session.public_order_no != null ? Number(session.public_order_no) : null),
      _skipLocalMarkPrinted: true,
      _supabaseOrderId: String(order.id),
    };
  }

  async function handleRemoveOrderItem(itemId) {
    const id = String(itemId || '');
    if (!id || removeItemBusy) return;

    const entry = getSelectedEntry();
    if (!entry?.order) return;

    const item = (entry.order.items || []).find((row) => String(row.itemId) === id);
    const label = item?.name || item?.productId || 'מנה';
    const isShakeBase = isShakeBaseProduct(item?.productId);
    const isShakeParent = isFruitShakeProduct(item?.productId)
      && !(item?.linkedToMainItemId);
    const linkedKids = isShakeParent
      ? (entry.order.items || []).filter((row) => String(row.linkedToMainItemId || '') === id)
      : [];

    let ask = `האם אתה בטוח שברצונך להסיר את "${label}" מההזמנה?`;
    if (isShakeBase) {
      ask = `להסיר את בסיס השייק "${label}" מההזמנה?`;
    } else if (isShakeParent) {
      ask = linkedKids.length
        ? `להסיר את שייק הפירות ואת הבסיס שנבחר (${linkedKids.map((k) => k.name).filter(Boolean).join(', ') || 'בסיס'})?`
        : `להסיר את שייק הפירות מההזמנה?`;
    }

    const ok = await showConfirmModal(ask, {
      yesLabel: 'כן, הסר',
    });
    if (!ok) return;

    const api = OrdersApi();
    if (!api?.deleteOrderItem) {
      showToast('מחיקה לא זמינה');
      return;
    }

    removeItemBusy = true;
    suppressCustomerNotify();
    try {
      await api.deleteOrderItem(id);
      showToast(isShakeBase ? 'בסיס השייק הוסר' : 'המנה הוסרה');
      await refreshBoardData();
      const next = getSelectedEntry();
      if (next?.order) {
        fillDrawer(next);
      } else {
        closeDrawer();
      }
    } catch (err) {
      console.error('[admin-tables] deleteOrderItem failed', err);
      showToast('לא ניתן להסיר את המנה');
    } finally {
      removeItemBusy = false;
    }
  }

  async function handleApproveOrder(entry) {
    if (approvePrintBusy || !entry?.order) return;

    const api = OrdersApi();
    if (!api?.markOrderApproved) {
      showToast('אישור לא זמין');
      return;
    }

    const remoteOrders = (entry.order._remoteOrders || [])
      .filter(orderNeedsApprove)
      .sort((a, b) => (Number(a.order_number) || 0) - (Number(b.order_number) || 0));

    if (!remoteOrders.length) {
      showToast('אין הזמנות ממתינות לאישור');
      await refreshBoardData().catch(() => {});
      return;
    }

    approvePrintBusy = true;
    suppressCustomerNotify(8000);
    /* Takeaway / butcher: stop reminder on Approve (tables keep beeping until print) */
    if (entry.orderType === 'takeaway' || entry.orderType === 'butcher') {
      stopPendingReminder();
    }
    updateApprovePrintButton(entry);

    try {
      for (const order of remoteOrders) {
        await api.markOrderApproved(order.id);
      }
      showToast('ההזמנה אושרה · בהכנה');
      await refreshBoardData();
      const next = getSelectedEntry();
      if (next?.order) fillDrawer(next);
    } catch (err) {
      console.error('[admin-tables] approve-order failed', err);
      showToast('האישור נכשל');
    } finally {
      approvePrintBusy = false;
      const next = getSelectedEntry();
      updateApprovePrintButton(next);
      if (entry.orderType === 'takeaway' || entry.orderType === 'butcher') {
        updatePendingReminder(boardCache, pickupCaches());
      }
    }
  }

  /**
   * Kitchen/bar ticket: only blue (late-add / unprinted wave) items when present.
   * If nothing is pending (reprint), fall back to the full order.
   */
  function mapEntryToPrintOrder(entry) {
    const order = entry?.order;
    if (!order) return null;

    const liveItems = (order.items || []).filter((row) => Number(row.qty) > 0);
    const lateItems = liveItems.filter((row) => row && row.isLateAdd);
    /* Blue = new since last print → print only those. Else full reprint. */
    const sourceItems = lateItems.length ? lateItems : liveItems;

    const items = sourceItems
      .map((row) => ({
        itemId: String(row.itemId),
        productId: String(row.productId || ''),
        name: row.printName || row.name || row.productId || '',
        printName: row.printName || '',
        price: Number(row.price) || 0,
        qty: Number(row.qty) || 0,
        notes: row.notes == null ? '' : String(row.notes),
        printed: false,
        linkedToMainItemId: row.linkedToMainItemId || null,
      }))
      .filter((row) => row.qty > 0);

    const remoteOrders = order._remoteOrders || [];
    const unprintedWaves = remoteOrders.filter(orderNeedsPrint);
    const waveForSeq = (unprintedWaves.length ? unprintedWaves : remoteOrders).reduce(
      (max, row) => Math.max(max, Number(row.order_number) || 0),
      0
    );
    const isButcher = entry.orderType === 'butcher';
    const isTakeaway = entry.orderType === 'takeaway';
    const resolvedType = isButcher ? 'butcher' : (isTakeaway ? 'takeaway' : 'dinein');

    return {
      orderId: `print-${order._supabaseSessionId || order.sessionId || entry.tableNumber || 'order'}`,
      sessionId: String(order._supabaseSessionId || order.sessionId || ''),
      tableNumber: (isTakeaway || isButcher)
        ? null
        : (entry.tableNumber != null ? Number(entry.tableNumber) : null),
      orderType: resolvedType,
      status: 'active',
      createdAt: order.createdAt || null,
      updatedAt: order.updatedAt || null,
      items,
      ticketSeq: waveForSeq || 1,
      customerName: order.customerName || null,
      customerPhone: order.customerPhone || null,
      customerNotes: order.customerNotes || null,
      customerAddress: order.customerAddress || null,
      fulfillmentType: order.fulfillmentType || null,
      pickupType: order.pickupType || null,
      pickupTime: order.pickupTime || null,
      publicOrderNo: order.publicOrderNo != null ? Number(order.publicOrderNo) : null,
      _skipLocalMarkPrinted: true,
      _deltaOnly: lateItems.length > 0,
    };
  }

  async function handlePrintOrder(entry) {
    if (approvePrintBusy || !entry?.order) return;

    const api = OrdersApi();
    const print = window.LechaimPrintEngine;
    if (typeof print?.printOrder !== 'function') {
      showToast('הדפסה לא זמינה');
      return;
    }

    const synthetic = mapEntryToPrintOrder(entry);
    if (!synthetic?.items?.length) {
      showToast('אין פריטים להדפסה');
      return;
    }

    approvePrintBusy = true;
    suppressCustomerNotify();
    updateApprovePrintButton(entry);

    let printedOk = false;
    try {
      const ok = await print.printOrder(synthetic);
      if (ok !== true) {
        console.error('[admin-tables] printOrder returned', ok);
        showToast('ההדפסה נכשלה — נסה שוב');
        return;
      }

      /* Sync printed_at on waves that were still pending (reprint stays available). */
      if (api?.markOrderPrinted) {
        const unprinted = (entry.order._remoteOrders || []).filter(orderNeedsPrint);
        for (const order of unprinted) {
          try {
            await api.markOrderPrinted(order.id);
          } catch (markErr) {
            console.error('[admin-tables] markOrderPrinted failed after successful print', markErr);
            showToast('הודפס בהצלחה, אך עדכון הסטטוס נכשל\n(בדוק עמודת printed_at ב־Supabase)');
            return;
          }
        }
      }

      printedOk = true;
    } catch (err) {
      console.error('[admin-tables] print-order failed', err);
      showToast('ההדפסה נכשלה');
      return;
    } finally {
      approvePrintBusy = false;
    }

    if (!printedOk) return;

    showToast('ההזמנה הודפסה', { checkOnly: true });
    closeDrawer();
    try {
      await refreshBoardData();
    } catch (err) {
      console.warn('[admin-tables] refresh after print-order failed', err);
    }
  }

  function renderMenuPicker() {
    const catalog = catalogCache.length ? catalogCache : loadCatalog();
    const categories = getCategories(catalog);
    const query = menuQuery.trim().toLowerCase();

    if (menuCats) {
      const chips = [
        { id: 'all', title: 'הכל' },
        ...categories,
      ];
      menuCats.innerHTML = chips.map((cat) => `
        <button
          type="button"
          class="table-menu__cat${menuCategoryId === cat.id ? ' is-active' : ''}"
          data-menu-cat="${escapeAttr(cat.id)}"
          role="tab"
          aria-selected="${menuCategoryId === cat.id ? 'true' : 'false'}"
        >${escapeHtml(cat.title)}</button>
      `).join('');
    }

    if (!menuList) return;

    const visible = catalog.filter((item) => {
      if (menuCategoryId !== 'all' && item.categoryId !== menuCategoryId) return false;
      if (!query) return true;
      const hay = `${item.name || ''} ${item.categoryTitle || ''}`.toLowerCase();
      return hay.includes(query);
    });

    if (!visible.length) {
      menuList.innerHTML = `<p class="table-drawer__empty">לא נמצאו מנות</p>`;
      return;
    }

    let lastCat = null;
    const parts = [];
    visible.forEach((item) => {
      const catId = item.categoryId || 'other';
      if (menuCategoryId === 'all' && catId !== lastCat) {
        lastCat = catId;
        parts.push(`<h3 class="table-menu__section">${escapeHtml(item.categoryTitle || catId)}</h3>`);
      }

      const available = item.available !== false;
      const priceLabel = item.price == null || Number(item.price) === 0
        ? 'כלול'
        : formatMoney(item.price);

      parts.push(`
        <div class="table-menu__item${!available ? ' is-unavailable' : ''}${item.adminOnly ? ' is-admin-only' : ''}">
          <div class="table-menu__item-text">
            <strong>${escapeHtml(item.name || item.id)}</strong>
            <span>${escapeHtml(priceLabel)}</span>
            ${item.adminOnly ? '<em class="table-menu__admin-only">אדמין בלבד</em>' : ''}
            ${!available ? '<em>אין במלאי</em>' : ''}
          </div>
          <button
            type="button"
            class="admin-btn admin-btn--soft table-menu__add"
            data-add-product="${escapeAttr(item.id)}"
            ${available ? '' : 'disabled'}
          >הוסף</button>
        </div>
      `);
    });

    menuList.innerHTML = parts.join('');
  }

  function openMenuPicker() {
    loadCatalog();
    menuCategoryId = 'all';
    menuQuery = '';
    if (menuSearch) menuSearch.value = '';
    setDrawerView('menu');
    const entry = getSelectedEntry();
    if (entry?.order) fillDrawer(entry);
    renderMenuPicker();
    menuSearch?.focus();
  }

  function closeMenuPicker() {
    setDrawerView('detail');
    const entry = getSelectedEntry();
    if (entry?.order) fillDrawer(entry);
  }

  function openDrawer(entry) {
    if (!entry?.order) {
      return;
    }
    selectedKey = entryKey(entry);
    setDrawerView('detail');
    fillDrawer(entry);
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('table-drawer-open');
    setFocusTrap('drawer', drawer);
    requestAnimationFrame(() => drawerClose?.focus());
  }

  function closeDrawer() {
    selectedKey = null;
    menuMode = false;
    setDrawerView('detail');
    if (!drawer) return;
    clearFocusTrap('drawer');
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('table-drawer-open');
  }

  /**
   * Late-add stacking: after the first wave, keep appending into the latest
   * unprinted order (order_number > 1) so "2× cola" / several mains share one bon.
   */
  function findStackableLateAddOrder(remoteOrders) {
    const list = Array.isArray(remoteOrders) ? remoteOrders : [];
    const unprinted = list
      .filter((order) => order && order.id && !order.printed_at)
      .sort((a, b) => (Number(b.order_number) || 0) - (Number(a.order_number) || 0));
    const candidate = unprinted[0] || null;
    if (!candidate) return null;
    if ((Number(candidate.order_number) || 0) <= 1) return null;
    return candidate;
  }

  async function handleAddProduct(productId) {
    const entry = getSelectedEntry();
    if (!entry?.order || !productId || addProductBusy) return;

    const product = (catalogCache.length ? catalogCache : loadCatalog())
      .find((item) => item.id === productId);
    if (!product) {
      showToast('המנה לא נמצאה');
      return;
    }
    if (product.available === false) {
      showToast('אין במלאי');
      return;
    }

    const price = Number(product.price) || 0;
    const printName = window.LechaimPrintEngine?.resolvePrintName?.({
      productId: product.id,
      name: product.name,
      printName: product.printName,
    }) || product.printName || product.name || '';

    addProductBusy = true;
    try {
      if (dataSource === 'supabase' && entry.order._supabaseSessionId && OrdersApi()?.isConfigured?.()) {
        suppressCustomerNotify();
        const api = OrdersApi();
        const sessionId = entry.order._supabaseSessionId;
        /* Re-fetch so rapid adds see the latest stackable wave */
        let remoteOrders = entry.order._remoteOrders || [];
        try {
          const fresh = await api.getSessionOrders?.(sessionId);
          if (Array.isArray(fresh)) remoteOrders = fresh;
        } catch (_) { /* use cached */ }
        const stackInto = findStackableLateAddOrder(remoteOrders);

        if (stackInto?.id) {
          const lines = Array.isArray(stackInto.order_items) ? stackInto.order_items : [];
          const same = lines.find((row) => (
            String(row.product_id || '') === String(product.id)
            && !row.parent_item_id
          ));
          if (same?.id && typeof api.bumpOrderItemQuantity === 'function') {
            await api.bumpOrderItemQuantity(same.id, 1);
          } else {
            await api.createOrderItems(stackInto.id, [{
              productId: product.id,
              productName: product.name || '',
              printName,
              quantity: 1,
              price,
              category: product.categoryId || null,
              notes: null,
            }]);
            if (typeof api.refreshOrderTotal === 'function') {
              await api.refreshOrderTotal(stackInto.id);
            }
          }
        } else {
          const remoteOrder = await api.createOrder({
            sessionId,
            total: price,
            status: 'submitted',
          });
          if (!remoteOrder?.id) throw new Error('createOrder failed');
          await api.createOrderItems(remoteOrder.id, [{
            productId: product.id,
            productName: product.name || '',
            printName,
            quantity: 1,
            price,
            category: product.categoryId || null,
            notes: null,
          }]);
        }
      } else {
        const engine = Engine();
        const updated = engine?.addProductToOrder?.(entry.order.orderId, product, 1);
        if (!updated) {
          showToast('לא ניתן להוסיף');
          return;
        }
      }

      showSuccessModal(`המוצר נוסף בהצלחה\n${product.name}`);
      await refreshBoardData();
      if (menuMode) renderMenuPicker();
    } catch (err) {
      console.error('[admin-tables] add product failed', err);
      showToast('לא ניתן להוסיף');
    } finally {
      addProductBusy = false;
    }
  }

  async function handlePrintCustomerBill(entry, coupon = null) {
    if (!entry?.order?.orderId) {
      showToast('אין הזמנה פעילה');
      return;
    }
    if (!window.LechaimPrintEngine?.printCustomerBill) {
      showToast('מנוע ההדפסה לא זמין');
      return;
    }

    try {
      suppressCustomerNotify();
      const printOrder = { ...entry.order };
      if (coupon?.code) {
        printOrder.couponCode = coupon.code;
        printOrder.discountPercent = coupon.discountPercent;
        printOrder.discountAmount = coupon.discountAmount;
        printOrder.subtotal = coupon.subtotal;
        printOrder.billTotal = coupon.total;
      }

      const printed = await LechaimPrintEngine.printCustomerBill(printOrder);
      if (!printed) {
        showToast('הדפסת החשבון נכשלה');
        return;
      }

      if (dataSource === 'supabase' && entry.order._supabaseSessionId && OrdersApi()?.updateSessionStatus) {
        try {
          const patch = { status: 'bill_requested' };
          if (coupon?.code) {
            patch.couponCode = coupon.code;
            patch.discountPercent = coupon.discountPercent;
            patch.discountAmount = coupon.discountAmount;
            patch.subtotal = coupon.subtotal;
          }
          await OrdersApi().updateSessionStatus(entry.order._supabaseSessionId, patch);
          if (coupon?.code && typeof OrdersApi().incrementCouponUse === 'function') {
            try {
              await OrdersApi().incrementCouponUse(coupon.code);
            } catch (incErr) {
              console.warn('[admin-tables] coupon use increment failed', incErr);
            }
          }
        } catch (err) {
          console.warn('[admin-tables] Supabase bill_requested update failed', err);
        }
      } else {
        Engine()?.requestBill?.(entry.order.orderId);
      }

      showToast('החשבון הודפס בבר · השולחן מסומן: ביקש חשבון');
      setDrawerView('detail');
      await refreshBoardData();
    } catch (err) {
      console.error('[admin-tables] print customer bill failed', err);
      showToast('הדפסת החשבון נכשלה');
    }
  }

  function resetCouponModalUi() {
    pendingBillCoupon = null;
    if (couponInput) couponInput.value = '';
    if (couponStatus) {
      couponStatus.hidden = true;
      couponStatus.textContent = '';
      couponStatus.classList.remove('is-error');
    }
    if (couponTotals) {
      couponTotals.hidden = true;
      couponTotals.innerHTML = '';
    }
  }

  function openCouponModal(entry) {
    pendingBillEntry = entry;
    resetCouponModalUi();
    if (!couponModal) {
      handlePrintCustomerBill(entry, null);
      return;
    }
    couponModal.hidden = false;
    couponModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setFocusTrap('coupon', couponModal);
    couponInput?.focus();
  }

  function closeCouponModal() {
    if (!couponModal) return;
    clearFocusTrap('coupon');
    couponModal.hidden = true;
    couponModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    pendingBillEntry = null;
    resetCouponModalUi();
  }

  async function applyAdminCoupon() {
    const code = String(couponInput?.value || '').trim();
    if (!code || !pendingBillEntry?.order) {
      if (couponStatus) {
        couponStatus.hidden = false;
        couponStatus.classList.add('is-error');
        couponStatus.textContent = 'קוד קופון לא תקין';
      }
      return;
    }

    const api = OrdersApi();
    if (!api?.validateCoupon) {
      if (couponStatus) {
        couponStatus.hidden = false;
        couponStatus.classList.add('is-error');
        couponStatus.textContent = 'אימות קופון לא זמין';
      }
      return;
    }

    try {
      const result = await api.validateCoupon(code);
      const percent = Number(result?.discount_percent ?? result?.discountPercent);
      if (!result || !Number.isFinite(percent) || percent <= 0) {
        pendingBillCoupon = null;
        if (couponStatus) {
          couponStatus.hidden = false;
          couponStatus.classList.add('is-error');
          couponStatus.textContent = 'קוד קופון לא תקין';
        }
        if (couponTotals) couponTotals.hidden = true;
        return;
      }

      const subtotal = calcOrderSubtotal(pendingBillEntry.order);
      const discountAmount = Math.round(subtotal * (percent / 100) * 100) / 100;
      const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
      pendingBillCoupon = {
        code: String(result?.code || code).trim(),
        discountPercent: percent,
        discountAmount,
        subtotal,
        total,
      };

      if (couponStatus) {
        couponStatus.hidden = false;
        couponStatus.classList.remove('is-error');
        couponStatus.textContent = `קופון אומת בהצלחה — ${percent}% הנחה`;
      }
      if (couponTotals) {
        couponTotals.hidden = false;
        couponTotals.innerHTML = `
          <div>לפני הנחה: ${escapeHtml(formatMoneyEuro(subtotal))}</div>
          <div>הנחה (${escapeHtml(String(percent))}%): −${escapeHtml(formatMoneyEuro(discountAmount))}</div>
          <div><strong>לתשלום: ${escapeHtml(formatMoneyEuro(total))}</strong></div>
        `;
      }
    } catch (err) {
      console.warn('[admin-tables] validate coupon failed', err);
      pendingBillCoupon = null;
      if (couponStatus) {
        couponStatus.hidden = false;
        couponStatus.classList.add('is-error');
        couponStatus.textContent = 'קוד קופון לא תקין';
      }
    }
  }

  async function confirmAdminCouponPrint() {
    const entry = pendingBillEntry;
    const coupon = pendingBillCoupon;
    if (!entry) return;
    closeCouponModal();
    await handlePrintCustomerBill(entry, coupon);
  }

  async function handleAction(action) {
    if (!selectedKey) return;

    const entry = getSelectedEntry();
    if (!entry?.order) return;

    if (action === 'approve-order') {
      await handleApproveOrder(entry);
      return;
    }

    if (action === 'print-order') {
      await handlePrintOrder(entry);
      return;
    }

    if (action === 'add-items') {
      openMenuPicker();
      return;
    }

    if (action === 'print-bill') {
      openCouponModal(entry);
      return;
    }

    if (action === 'close-table') {
      const isPickupClose = entry.orderType === 'takeaway' || entry.orderType === 'butcher';
      const deliveryClose = entry.orderType === 'takeaway' && isDeliveryOrder(entry.order);
      const closeLabel = deliveryClose
        ? 'סגור משלוח'
        : (isPickupClose ? 'סגור הזמנה' : 'סגור שולחן');
      const confirmMsg = entry.orderType === 'butcher'
        ? 'האם אתה בטוח שברצונך לסגור את הזמנת חנות הבשר?'
        : (entry.orderType === 'takeaway'
          ? (deliveryClose
            ? 'האם אתה בטוח שברצונך לסגור את המשלוח?'
            : 'האם אתה בטוח שברצונך לסגור את הזמנת האיסוף העצמי?')
          : `האם אתה בטוח שברצונך לסגור את שולחן ${entry.tableNumber}?`);
      const ok = await showConfirmModal(confirmMsg, { yesLabel: `כן, ${closeLabel}` });
      if (!ok) return;

      try {
        let closed = false;
        suppressCustomerNotify();

        if (dataSource === 'supabase' && entry.order._supabaseSessionId && OrdersApi()?.updateSessionStatus) {
          await OrdersApi().updateSessionStatus(entry.order._supabaseSessionId, {
            status: 'closed',
          });
          closed = true;
        } else {
          const engine = Engine();
          closed = isPickupClose
            ? Boolean(engine?.closeOrder?.({ orderId: entry.order.orderId }))
            : Boolean(engine?.closeTable?.(entry.tableNumber));
        }

        if (!closed) {
          showToast('לא ניתן לסגור');
          return;
        }

        showToast(
          entry.orderType === 'butcher'
            ? 'הזמנת חנות בשר נסגרה'
            : (entry.orderType === 'takeaway'
              ? (deliveryClose ? 'המשלוח נסגר' : 'איסוף עצמי נסגר')
              : `שולחן ${entry.tableNumber} נסגר`)
        );
        closeDrawer();
        await refreshBoardData();
      } catch (err) {
        console.error('[admin-tables] close table failed', err);
        showToast('לא ניתן לסגור');
      }
    }
  }

  let deliveriesClosed = false;
  let deliveriesFlagUnsub = null;

  function updateDeliveriesToggleButton() {
    if (!closeDeliveriesBtn) return;
    if (deliveriesClosed) {
      closeDeliveriesBtn.textContent = 'פתח משלוחים';
      closeDeliveriesBtn.classList.remove('admin-btn--ghost');
      closeDeliveriesBtn.classList.add('admin-btn--primary');
    } else {
      closeDeliveriesBtn.textContent = 'סגור משלוחים';
      closeDeliveriesBtn.classList.add('admin-btn--ghost');
      closeDeliveriesBtn.classList.remove('admin-btn--primary');
    }
  }

  async function refreshDeliveriesClosedFlag() {
    const api = OrdersApi();
    if (!api?.isConfigured?.() || typeof api.getDeliveriesClosed !== 'function') {
      updateDeliveriesToggleButton();
      return;
    }
    try {
      deliveriesClosed = Boolean(await api.getDeliveriesClosed());
      updateDeliveriesToggleButton();
    } catch (err) {
      console.warn('[admin-tables] deliveries flag load failed', err);
    }
  }

  /**
   * Toggle customer-facing delivery wording/options only (does not close orders).
   */
  async function toggleDeliveriesClosed() {
    const api = OrdersApi();
    if (!api?.setDeliveriesClosed) {
      showToast('מתג משלוחים לא זמין — הריצו supabase-takeaway-delivery.sql');
      return;
    }
    const nextClosed = !deliveriesClosed;
    const ok = await showConfirmModal(
      nextClosed
        ? 'לסגור משלוחים בצד הלקוח?\nבכרטיס ובטופס יופיע רק "איסוף עצמי" — בלי משלוח.'
        : 'לפתוח משלוחים בצד הלקוח?\nיופיע שוב "איסוף עצמי / משלוחים" ואפשרות משלוח בטופס.',
      { yesLabel: nextClosed ? 'סגור משלוחים' : 'פתח משלוחים' }
    );
    if (!ok) return;
    try {
      await api.setDeliveriesClosed(nextClosed);
      deliveriesClosed = nextClosed;
      updateDeliveriesToggleButton();
      showToast(nextClosed ? 'משלוחים סגורים ללקוחות' : 'משלוחים פתוחים ללקוחות');
    } catch (err) {
      console.error('[admin-tables] toggle deliveries failed', err);
      showToast(err?.message || 'עדכון משלוחים נכשל');
    }
  }

  function renderBoard() {
    refreshBoardData().catch((err) => {
      console.warn('[admin-tables] renderBoard failed', err);
    });
  }

  function onGridClick(event) {
    const card = event.target.closest('[data-entry-key]');
    if (!card) return;
    const key = card.dataset.entryKey;
    let entry = null;
    if (String(key).startsWith('butcher')) {
      entry = butcherCache.find((row) => entryKey(row) === key) || null;
    } else if (String(key).startsWith('takeaway')) {
      entry = takeawayCache.find((row) => entryKey(row) === key) || null;
    } else {
      entry = boardCache.find((row) => entryKey(row) === key) || null;
    }
    if (entry) openDrawer(entry);
  }

  async function isShabbatSessionId(sessionId) {
    if (!sessionId) return false;
    const key = String(sessionId);
    if (shabbatSessionIds.has(key)) return true;
    try {
      const session = await OrdersApi()?.getSession?.(key);
      if (window.LechaimOrderTypes?.isShabbatOrderType?.(session?.order_type)
        || session?.order_type === 'shabbat') {
        shabbatSessionIds.add(key);
        return true;
      }
    } catch {
      /* ignore lookup failures — fall through to normal board handling */
    }
    return false;
  }

  function startRealtime() {
    stopRealtime();
    const api = OrdersApi();
    if (!api?.isConfigured?.() || typeof api.subscribeToOrders !== 'function') return;
    try {
      unsubscribeRealtime = api.subscribeToOrders((payload) => {
        const table = payload?.table;
        const eventType = String(payload?.eventType || payload?.event || '').toUpperCase();
        const row = payload?.new || payload?.payload?.new;

        /* Customer sent a new order wave — chime on every Admin tab (incl. Shabbat) */
        if (table === 'orders' && eventType === 'INSERT') {
          const id = row?.id;
          const sessionId = row?.session_id;
          void (async () => {
            const isShabbat = await isShabbatSessionId(sessionId);
            if (id && orderIdsSeeded && !knownOrderIds.has(String(id))) {
              knownOrderIds.add(String(id));
              playOrderNotifyChime();
            } else if (id) {
              knownOrderIds.add(String(id));
            }
            /* Shabbat has its own board — still refresh tables/takeaway for other types */
            if (!isShabbat) scheduleBoardRefresh();
          })();
          return;
        }

        /* Customer requested the bill — visual only, no chime */
        if (table === 'order_sessions' && eventType === 'UPDATE') {
          if (String(row?.order_type || '') === 'shabbat' || shabbatSessionIds.has(String(row?.session_id || ''))) {
            return;
          }
        }

        scheduleBoardRefresh();
      });
    } catch (err) {
      console.warn('[admin-tables] Realtime subscribe failed', err);
    }
  }

  function stopRealtime() {
    if (typeof unsubscribeRealtime === 'function') {
      try {
        unsubscribeRealtime();
      } catch (err) {
        console.warn('[admin-tables] Realtime unsubscribe failed', err);
      }
    }
    unsubscribeRealtime = null;
  }

  function startPolling() {
    if (watchRunning) {
      renderBoard();
      return;
    }
    watchRunning = true;
    startRealtime();
    renderBoard();
    pollTimer = window.setInterval(renderBoard, 1000);
  }

  function stopPolling() {
    watchRunning = false;
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    window.clearTimeout(refreshTimer);
    stopRealtime();
    stopPendingReminder();
  }

  function init() {
    gridEl?.addEventListener('click', onGridClick);
    takeawayGrid?.addEventListener('click', onGridClick);
    butcherGrid?.addEventListener('click', onGridClick);
    closeDeliveriesBtn?.addEventListener('click', () => {
      toggleDeliveriesClosed().catch((err) => {
        console.error('[admin-tables] deliveries toggle failed', err);
      });
    });
    refreshDeliveriesClosedFlag().catch(() => {});
    if (!deliveriesFlagUnsub && OrdersApi()?.subscribeRestaurantFlags) {
      deliveriesFlagUnsub = OrdersApi().subscribeRestaurantFlags((evt) => {
        if (evt?.flagKey !== 'deliveries_closed') return;
        deliveriesClosed = Boolean(evt.flagValue);
        updateDeliveriesToggleButton();
      });
    }
    drawerBackdrop?.addEventListener('click', closeDrawer);
    drawerClose?.addEventListener('click', closeDrawer);
    menuBack?.addEventListener('click', closeMenuPicker);
    successOk?.addEventListener('click', closeSuccessModal);
    successBackdrop?.addEventListener('click', closeSuccessModal);
    confirmYes?.addEventListener('click', () => closeConfirmModal(true));
    confirmCancel?.addEventListener('click', () => closeConfirmModal(false));
    confirmBackdrop?.addEventListener('click', () => closeConfirmModal(false));
    couponApply?.addEventListener('click', () => { applyAdminCoupon(); });
    couponPrint?.addEventListener('click', () => { confirmAdminCouponPrint(); });
    couponCancel?.addEventListener('click', closeCouponModal);
    couponBackdrop?.addEventListener('click', closeCouponModal);
    couponInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyAdminCoupon();
      }
    });

    drawerItems?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove-item-id]');
      if (!btn || !drawerItems.contains(btn)) return;
      event.preventDefault();
      handleRemoveOrderItem(btn.getAttribute('data-remove-item-id'));
    });

    drawer?.querySelectorAll('[data-table-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.tableAction));
    });

    menuCats?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-menu-cat]');
      if (!btn) return;
      menuCategoryId = btn.dataset.menuCat || 'all';
      renderMenuPicker();
    });

    menuList?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-add-product]');
      if (!btn || btn.disabled) return;
      handleAddProduct(btn.dataset.addProduct);
    });

    menuSearch?.addEventListener('input', () => {
      menuQuery = menuSearch.value || '';
      renderMenuPicker();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (confirmModal && !confirmModal.hidden) {
        closeConfirmModal(false);
        return;
      }
      if (couponModal && !couponModal.hidden) {
        closeCouponModal();
        return;
      }
      if (successModal && !successModal.hidden) {
        closeSuccessModal();
        return;
      }
      if (!drawer || drawer.hidden) return;
      if (menuMode) {
        closeMenuPicker();
        return;
      }
      closeDrawer();
    });
  }

  window.LechaimAdminTables = {
    init,
    start: startPolling,
    stop: stopPolling,
    refresh: renderBoard,
    closeDrawer,
    setBoardFilter,
    playNotifyChime: playOrderNotifyChime,
    silenceNotifyChime() {
      suppressCustomerNotify(8000);
      stopPendingReminder();
      updatePendingReminder(boardCache, pickupCaches());
    },
    showConfirmModal,
    showSuccessModal,
    renderDrawerItemsHtml,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
