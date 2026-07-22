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
  const dineInSection = document.getElementById('tables-dinein');
  const tabBadgeTables = document.getElementById('tab-badge-tables');
  const tabBadgeTakeaway = document.getElementById('tab-badge-takeaway');
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
  let removeItemBusy = false;
  let confirmResolver = null;
  let pendingBillEntry = null;
  let pendingBillCoupon = null;
  let boardFilter = 'tables'; /* 'tables' | 'takeaway' */

  function showToast(message) {
    showSuccessModal(message);
  }

  function showSuccessModal(message) {
    if (!successModal) return;
    if (successText) successText.textContent = message;
    successModal.hidden = false;
    successModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    successOk?.focus();
  }

  function closeSuccessModal() {
    if (!successModal) return;
    successModal.hidden = true;
    successModal.setAttribute('aria-hidden', 'true');
    if (!confirmModal || confirmModal.hidden) {
      document.body.classList.remove('admin-modal-open');
    }
  }

  function closeConfirmModal(result) {
    if (!confirmModal) return;
    confirmModal.hidden = true;
    confirmModal.setAttribute('aria-hidden', 'true');
    if (!successModal || successModal.hidden) {
      document.body.classList.remove('admin-modal-open');
    }
    const resolve = confirmResolver;
    confirmResolver = null;
    if (typeof resolve === 'function') resolve(Boolean(result));
  }

  function showConfirmModal(message) {
    if (!confirmModal) {
      return Promise.resolve(window.confirm(String(message || '')));
    }
    if (typeof confirmResolver === 'function') {
      confirmResolver(false);
      confirmResolver = null;
    }
    if (confirmText) confirmText.textContent = message;
    confirmModal.hidden = false;
    confirmModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
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
    if (uiStatus === 'active') return 'פעיל';
    if (uiStatus === 'bill_requested') return 'ביקש חשבון';
    return 'פנוי';
  }

  function hasUnprintedRemoteOrders(orders) {
    return (orders || []).some((order) => order && order.id && !order.printed_at);
  }

  function resolveEntryUiStatus(synthetic) {
    if (!synthetic) return 'free';
    if (hasUnprintedRemoteOrders(synthetic._remoteOrders)) return 'pending_print';
    if (synthetic.status === 'bill_requested') return 'bill_requested';
    return 'active';
  }

  function orderTypeLabel(orderType) {
    if (orderType === 'takeaway') return 'איסוף עצמי';
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
    if (entry.orderType === 'takeaway') {
      return entry.order?.orderId
        ? `takeaway:${entry.order.orderId}`
        : 'takeaway';
    }
    return `table:${entry.tableNumber}`;
  }

  function findSelectedEntry(board, takeaway) {
    if (!selectedKey) return null;
    if (String(selectedKey).startsWith('takeaway')) {
      return takeaway.find((row) => entryKey(row) === selectedKey) || takeaway[0] || null;
    }
    const num = Number(String(selectedKey).replace('table:', ''));
    return board.find((row) => row.tableNumber === num) || null;
  }

  function getSelectedEntry() {
    if (!selectedKey) return null;
    return findSelectedEntry(boardCache, takeawayCache);
  }

  function mapRemoteItem(row) {
    return {
      itemId: String(row.id),
      productId: String(row.product_id || ''),
      name: row.product_name || row.print_name || row.product_id || '',
      printName: row.print_name || '',
      price: Number(row.price) || 0,
      qty: Number(row.quantity) || 0,
      notes: row.notes == null ? '' : String(row.notes),
      printed: true,
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      createdAt: row.created_at || null,
    };
  }

  function flattenSessionOrders(session, orders) {
    const items = [];
    let total = 0;
    (orders || []).forEach((order) => {
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      lines.forEach((row) => {
        const mapped = mapRemoteItem(row);
        if (mapped.qty > 0) {
          items.push(mapped);
          total += mapped.price * mapped.qty;
        }
      });
      if (!lines.length && Number(order.total) > 0) {
        total += Number(order.total) || 0;
      }
    });

    const uiOrderType = session.order_type === 'takeaway' ? 'takeaway' : 'dinein';
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

    (rows || []).forEach(({ session, orders }) => {
      const synthetic = flattenSessionOrders(session, orders);
      const isTakeaway = synthetic.orderType === 'takeaway';
      /* Keep takeaway visible even if admin removed all line items */
      if (!isTakeaway && !synthetic.items.length && !(Number(synthetic._sessionTotal) > 0)) return;

      if (isTakeaway) {
        const payable = synthetic.billTotal != null ? synthetic.billTotal : synthetic._sessionTotal;
        takeaway.push({
          tableNumber: null,
          uiStatus: resolveEntryUiStatus(synthetic),
          orderType: 'takeaway',
          order: synthetic,
          total: payable,
          itemCount: synthetic.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
          openedAt: synthetic.createdAt,
          updatedAt: synthetic.updatedAt,
        });
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

    return { board, takeaway };
  }

  function loadLocalBoards() {
    const engine = Engine();
    return {
      board: engine?.getTablesBoard?.() || [],
      takeaway: engine?.getTakeawayBoard?.() || [],
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
    boardFilter = filter === 'takeaway' ? 'takeaway' : 'tables';
    paintBoard(boardCache, takeawayCache);
  }

  function paintBoard(board, takeaway) {
    if (!gridEl) return;

    const occupiedTables = (board || []).filter((row) => row && row.uiStatus && row.uiStatus !== 'free').length;
    const pickupCount = (takeaway || []).length;
    setCategoryBadge(tabBadgeTables, occupiedTables);
    setCategoryBadge(tabBadgeTakeaway, pickupCount);

    const showTakeaway = boardFilter === 'takeaway';
    if (dineInSection) dineInSection.hidden = showTakeaway;
    if (takeawaySection) takeawaySection.hidden = !showTakeaway;

    if (!showTakeaway) {
      gridEl.innerHTML = board.map(renderCard).join('');
    }

    if (takeawayGrid) {
      if (pickupCount) {
        takeawayGrid.innerHTML = takeaway.map(renderCard).join('');
        if (takeawayEmpty) takeawayEmpty.hidden = true;
      } else {
        takeawayGrid.innerHTML = '';
        if (takeawayEmpty) takeawayEmpty.hidden = false;
      }
    }

    const selected = findSelectedEntry(board, takeaway);
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
      dataSource = data.source;
      if (!data.stale) {
        syncKnownOrderIdsAfterBoardLoad(boardCache, takeawayCache);
      }
      paintBoard(boardCache, takeawayCache);
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
    const isPickup = entry.orderType === 'takeaway';
    const pickupBlock = isPickup
      ? `
        <span class="table-card__badge">איסוף עצמי</span>
        <span class="table-card__customer">${escapeHtml(entry.order?.customerName || '—')}</span>
        <span class="table-card__phone" dir="ltr">${escapeHtml(entry.order?.customerPhone || '—')}</span>
        <span class="table-card__pickup">איסוף: ${escapeHtml(formatPickupLabel(entry.order))}</span>
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
        <span class="table-card__type">${escapeHtml(orderTypeLabel(entry.orderType))}</span>
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

  function fillDrawer(entry) {
    const order = entry.order;
    if (!order || !drawer) return;

    if (drawerTitle) {
      if (entry.orderType === 'takeaway') {
        const no = order.publicOrderNo != null ? ` #${order.publicOrderNo}` : '';
        drawerTitle.textContent = `איסוף עצמי${no}`;
      } else {
        drawerTitle.textContent = `שולחן ${entry.tableNumber}`;
      }
    }
    if (drawerType) {
      drawerType.textContent = menuMode
        ? `${orderTypeLabel(entry.orderType)} · הוספת מנות`
        : `${orderTypeLabel(entry.orderType)} · ${statusLabel(entry.uiStatus)}`;
    }

    if (drawerMeta) {
      if (entry.orderType === 'takeaway') {
        drawerMeta.innerHTML = `
          <div class="table-drawer__pickup">
            <div class="table-drawer__pickup-badge">איסוף עצמי${
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
                <span>לקוח</span>
                <strong>${escapeHtml(order.customerName || '—')}</strong>
              </div>
              <div class="table-drawer__pickup-row">
                <span>טלפון</span>
                <strong dir="ltr">${escapeHtml(order.customerPhone || '—')}</strong>
              </div>
              <div class="table-drawer__pickup-row">
                <span>איסוף</span>
                <strong>${escapeHtml(formatPickupLabel(order))}</strong>
              </div>
              ${order.customerNotes
                ? `<div class="table-drawer__pickup-row">
                    <span>הערות</span>
                    <strong dir="ltr">${escapeHtml(order.customerNotes)}</strong>
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
      if (!order.items?.length) {
        drawerItems.innerHTML = `<p class="table-drawer__empty">אין פריטים בהזמנה</p>`;
      } else {
        drawerItems.innerHTML = `
          <ul class="table-drawer__list">
            ${order.items.map((item) => `
              <li>
                <div class="table-drawer__line">
                  <span class="table-drawer__qty">${escapeHtml(String(item.qty))}×</span>
                  <span class="table-drawer__name">${escapeHtml(item.name || item.productId)}</span>
                  <span class="table-drawer__price">${escapeHtml(formatMoney((Number(item.price) || 0) * (Number(item.qty) || 0)))}</span>
                  ${item.itemId
                    ? `<button
                        type="button"
                        class="table-drawer__remove"
                        data-remove-item-id="${escapeHtml(String(item.itemId))}"
                        aria-label="הסר מנה"
                        title="הסר מנה"
                      >×</button>`
                    : ''}
                </div>
                ${item.notes ? `<p class="table-drawer__notes">${escapeHtml(item.notes)}</p>` : ''}
              </li>
            `).join('')}
          </ul>
        `;
      }
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
    const btn = document.getElementById('table-approve-print');
    if (!btn) return;
    const pending = entry?.uiStatus === 'pending_print'
      || hasUnprintedRemoteOrders(entry?.order?._remoteOrders);
    btn.hidden = !pending;
    btn.disabled = approvePrintBusy;
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
    return [...(board || []), ...(takeaway || [])].some((entry) => (
      entry?.uiStatus === 'pending_print' || entry?.uiStatus === 'bill_requested'
    ));
  }

  function stopPendingReminder() {
    if (pendingReminderTimer) {
      window.clearInterval(pendingReminderTimer);
      pendingReminderTimer = null;
    }
  }

  /** Re-beep every 15s while cards still need Approve / bill action. */
  function updatePendingReminder(board, takeaway) {
    const needsAttention = boardNeedsAdminAttention(board, takeaway);
    if (!needsAttention) {
      stopPendingReminder();
      return;
    }
    if (pendingReminderTimer) return;
    pendingReminderTimer = window.setInterval(() => {
      if (boardNeedsAdminAttention(boardCache, takeawayCache)) {
        playOrderNotifyChime();
      } else {
        stopPendingReminder();
      }
    }, 15000);
  }

  function syncKnownOrderIdsAfterBoardLoad(board, takeaway) {
    const current = collectBoardOrderIds(board, takeaway);
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
      if (status === 'bill_requested' && prev !== 'bill_requested') {
        customerEvent = true;
      }
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

    const isTakeaway = session.orderType === 'takeaway' || session.order_type === 'takeaway';

    return {
      orderId: String(order.id),
      sessionId: String(order.session_id || session.sessionId || ''),
      tableNumber: isTakeaway
        ? null
        : (session.tableNumber != null
          ? Number(session.tableNumber)
          : (session.table_number == null ? null : Number(session.table_number))),
      orderType: isTakeaway ? 'takeaway' : 'dinein',
      status: 'active',
      createdAt: order.created_at || null,
      updatedAt: order.updated_at || null,
      items: mappedItems,
      ticketSeq: Number(order.order_number) || 1,
      customerName: session.customerName || session.customer_name || null,
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
    const ok = await showConfirmModal(`להסיר את "${label}" מההזמנה?`);
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
      showToast('המנה הוסרה');
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

  async function handleApprovePrint(entry) {
    if (approvePrintBusy || !entry?.order) return;

    const api = OrdersApi();
    const print = window.LechaimPrintEngine;
    if (!api?.markOrderPrinted || typeof print?.printOrder !== 'function') {
      showToast('הדפסה לא זמינה');
      return;
    }

    const remoteOrders = (entry.order._remoteOrders || [])
      .filter((order) => order && order.id && !order.printed_at)
      .sort((a, b) => (Number(a.order_number) || 0) - (Number(b.order_number) || 0));

    if (!remoteOrders.length) {
      showToast('אין הזמנות ממתינות להדפסה');
      closeDrawer();
      await refreshBoardData().catch((err) => {
        console.warn('[admin-tables] refresh after empty approve failed', err);
      });
      return;
    }

    approvePrintBusy = true;
    suppressCustomerNotify();
    updateApprovePrintButton(entry);

    let printedOk = false;
    try {
      const sessionMeta = {
        sessionId: entry.order._supabaseSessionId || entry.order.sessionId,
        tableNumber: entry.tableNumber,
        orderType: entry.orderType,
        customerName: entry.order.customerName,
        customerPhone: entry.order.customerPhone,
        customerNotes: entry.order.customerNotes,
        pickupType: entry.order.pickupType,
        pickupTime: entry.order.pickupTime,
        publicOrderNo: entry.order.publicOrderNo,
      };

      for (const order of remoteOrders) {
        const items = Array.isArray(order.order_items) ? order.order_items : [];
        const synthetic = mapRemoteWaveToPrintOrder(sessionMeta, order, items);

        if (!synthetic.items.length) {
          await api.markOrderPrinted(order.id);
          continue;
        }

        const ok = await print.printOrder(synthetic);
        if (ok !== true) {
          console.error('[admin-tables] printOrder returned', ok, { orderId: order.id });
          showToast('ההדפסה נכשלה — נסה שוב');
          return;
        }

        try {
          await api.markOrderPrinted(order.id);
        } catch (markErr) {
          console.error('[admin-tables] markOrderPrinted failed after successful print', markErr);
          showToast('הודפס בהצלחה, אך עדכון הסטטוס נכשל\n(בדוק עמודת printed_at ב־Supabase)');
          return;
        }
      }

      printedOk = true;
    } catch (err) {
      console.error('[admin-tables] approve-print failed', err);
      showToast('ההדפסה נכשלה');
      return;
    } finally {
      approvePrintBusy = false;
    }

    if (!printedOk) return;

    showToast('ההזמנה אושרה והודפסה');
    closeDrawer();
    try {
      await refreshBoardData();
    } catch (err) {
      console.warn('[admin-tables] refresh after approve-print failed', err);
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
        <div class="table-menu__item${!available ? ' is-unavailable' : ''}">
          <div class="table-menu__item-text">
            <strong>${escapeHtml(item.name || item.id)}</strong>
            <span>${escapeHtml(priceLabel)}</span>
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
  }

  function closeDrawer() {
    selectedKey = null;
    menuMode = false;
    setDrawerView('detail');
    if (!drawer) return;
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('table-drawer-open');
  }

  async function handleAddProduct(productId) {
    const entry = getSelectedEntry();
    if (!entry?.order || !productId) return;

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

    try {
      if (dataSource === 'supabase' && entry.order._supabaseSessionId && OrdersApi()?.isConfigured?.()) {
        suppressCustomerNotify();
        const api = OrdersApi();
        const sessionId = entry.order._supabaseSessionId;
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
    couponInput?.focus();
  }

  function closeCouponModal() {
    if (!couponModal) return;
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

    if (action === 'approve-print') {
      await handleApprovePrint(entry);
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
          closed = entry.orderType === 'takeaway'
            ? Boolean(engine?.closeOrder?.({ orderId: entry.order.orderId }))
            : Boolean(engine?.closeTable?.(entry.tableNumber));
        }

        if (!closed) {
          showToast('לא ניתן לסגור');
          return;
        }

        showToast(entry.orderType === 'takeaway' ? 'איסוף עצמי נסגר' : `שולחן ${entry.tableNumber} נסגר`);
        closeDrawer();
        await refreshBoardData();
      } catch (err) {
        console.error('[admin-tables] close table failed', err);
        showToast('לא ניתן לסגור');
      }
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
    const entry = String(key).startsWith('takeaway')
      ? (takeawayCache.find((row) => entryKey(row) === key) || takeawayCache[0])
      : boardCache.find((row) => entryKey(row) === key);
    if (entry) openDrawer(entry);
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

        /* Customer sent a new order wave */
        if (table === 'orders' && eventType === 'INSERT') {
          const id = row?.id;
          if (id && orderIdsSeeded && !knownOrderIds.has(String(id))) {
            knownOrderIds.add(String(id));
            playOrderNotifyChime();
          } else if (id) {
            knownOrderIds.add(String(id));
          }
        }

        /* Customer requested the bill */
        if (table === 'order_sessions' && eventType === 'UPDATE') {
          const becameBill = row?.status === 'bill_requested' || row?.bill_requested === true;
          if (becameBill) playOrderNotifyChime();
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
    stopPolling();
    startRealtime();
    renderBoard();
    pollTimer = window.setInterval(renderBoard, 1000);
  }

  function stopPolling() {
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
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
