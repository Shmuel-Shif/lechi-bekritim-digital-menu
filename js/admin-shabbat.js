/**
 * LECHAIM — Admin Shabbat orders board
 * Same actions as takeaway: Approve → Print → Add dishes → Close (with confirm).
 */
(function (global) {
  'use strict';

  const gridEl = document.getElementById('shabbat-orders-grid');
  const emptyEl = document.getElementById('shabbat-orders-empty');
  const badgeEl = document.getElementById('tab-badge-shabbat');
  const drawer = document.getElementById('shabbat-drawer');
  const drawerBackdrop = document.getElementById('shabbat-drawer-backdrop');
  const drawerClose = document.getElementById('shabbat-drawer-close');
  const drawerTitle = document.getElementById('shabbat-drawer-title');
  const drawerType = document.getElementById('shabbat-drawer-type');
  const drawerDetail = document.getElementById('shabbat-drawer-detail');
  const drawerMenu = document.getElementById('shabbat-drawer-menu');
  const drawerMeta = document.getElementById('shabbat-drawer-meta');
  const drawerItems = document.getElementById('shabbat-drawer-items');
  const drawerTotal = document.getElementById('shabbat-drawer-total');
  const approveBtn = document.getElementById('shabbat-approve');
  const printBtn = document.getElementById('shabbat-print');
  const addItemsBtn = document.getElementById('shabbat-add-items');
  const closeBtn = document.getElementById('shabbat-close-order');
  const menuBack = document.getElementById('shabbat-menu-back');
  const menuSearch = document.getElementById('shabbat-menu-search');
  const menuCats = document.getElementById('shabbat-menu-cats');
  const menuList = document.getElementById('shabbat-menu-list');
  const toastEl = document.getElementById('admin-toast');
  const newBtn = document.getElementById('shabbat-new-btn');
  const ordersToggleBtn = document.getElementById('shabbat-orders-toggle-btn');
  const newModal = document.getElementById('shabbat-new-modal');
  const newModalBackdrop = document.getElementById('shabbat-new-modal-backdrop');
  const newForm = document.getElementById('shabbat-new-form');
  const newName = document.getElementById('shabbat-new-name');
  const newPhone = document.getElementById('shabbat-new-phone');
  const newNotes = document.getElementById('shabbat-new-notes');
  const newFormError = document.getElementById('shabbat-new-form-error');
  const newSaveBtn = document.getElementById('shabbat-new-save-btn');
  const newCancelBtn = document.getElementById('shabbat-new-cancel-btn');

  let cache = [];
  let selectedId = null;
  let busy = false;
  let removeBusy = false;
  let timer = null;
  let unsub = null;
  let running = false;
  let menuMode = false;
  let menuCategoryId = 'all';
  let menuQuery = '';
  let pendingQtyProduct = null;
  let pendingQty = 1;
  let pendingQtyMode = 'add';
  let pendingRemoveItemId = null;
  let pendingRemoveMaxQty = 1;
  const QTY_MIN = 1;
  const QTY_MAX = 99;
  let catalogCache = [];
  let newModalTrapRelease = null;
  let shabbatOrdersEnabled = true;
  let shabbatFlagUnsub = null;

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;');
  }

  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  }

  function formatClock(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.hidden = false;
    toastEl.textContent = message;
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => {
      toastEl.hidden = true;
      toastEl.textContent = '';
    }, 2800);
  }

  function showConfirm(message, yesLabel) {
    if (typeof global.LechaimAdminTables?.showConfirmModal === 'function') {
      return global.LechaimAdminTables.showConfirmModal(message, { yesLabel: yesLabel || 'כן' });
    }
    return Promise.resolve(window.confirm(String(message || '')));
  }

  function showSuccess(message, options) {
    if (typeof global.LechaimAdminTables?.showSuccessModal === 'function') {
      global.LechaimAdminTables.showSuccessModal(message, options);
      return;
    }
    showToast(message);
  }

  function orderNeedsApprove(order) {
    return Boolean(
      order
      && order.id
      && !order.printed_at
      && String(order.status || 'submitted').toLowerCase() === 'submitted'
    );
  }

  function orderNeedsPrint(order) {
    return Boolean(order?.id && !order.printed_at);
  }

  function needsApprove(orders) {
    return (orders || []).some(orderNeedsApprove);
  }

  function needsPrint(orders) {
    return (orders || []).some(orderNeedsPrint);
  }

  function entryStatus(row) {
    if (needsApprove(row.orders)) return 'pending_print';
    if ((row.orders || []).some((o) => o && !o.printed_at && String(o.status || '').toLowerCase() === 'preparing')) {
      return 'preparing';
    }
    return 'active';
  }

  function statusLabel(status) {
    if (status === 'pending_print') return 'ממתין לאישור';
    if (status === 'preparing') return 'בהכנה';
    return 'פעיל';
  }

  function flattenItems(orders) {
    const items = [];
    let total = 0;
    (orders || []).forEach((order) => {
      (order.order_items || []).forEach((row) => {
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) return;
        const price = Number(row.price) || 0;
        items.push({
          itemId: String(row.id),
          productId: String(row.product_id || ''),
          name: row.product_name || row.print_name || row.product_id || '',
          printName: row.print_name || '',
          qty,
          price,
          linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
          isNew: !order.printed_at
            && String(order.status || 'submitted').toLowerCase() === 'submitted',
          isLateAdd: !order.printed_at
            && String(order.status || 'submitted').toLowerCase() === 'submitted',
        });
        total += price * qty;
      });
    });
    return { items, total };
  }

  function mapRow(session, orders) {
    const { items, total } = flattenItems(orders);
    return {
      sessionId: String(session.session_id),
      customerName: session.customer_name || '—',
      customerPhone: session.customer_phone || '—',
      customerNotes: session.notes || '',
      pickupTime: session.pickup_time || '14:00',
      openedAt: session.created_at,
      orders: orders || [],
      items,
      total: session.subtotal != null && session.discount_amount != null
        ? Math.max(0, Number(session.subtotal) - Number(session.discount_amount))
        : total,
      couponCode: session.coupon_code || null,
      discountPercent: session.discount_percent,
      uiStatus: entryStatus({ orders }),
    };
  }

  function setBadge(count) {
    if (!badgeEl) return;
    const n = Math.max(0, Number(count) || 0);
    badgeEl.textContent = String(n);
    badgeEl.setAttribute('data-count', String(n));
    badgeEl.hidden = n <= 0;
  }

  function setDrawerView(view) {
    menuMode = view === 'menu';
    if (drawerDetail) drawerDetail.hidden = menuMode;
    if (drawerMenu) drawerMenu.hidden = !menuMode;
    if (drawerType) {
      drawerType.textContent = menuMode
        ? 'הזמנות לשבת · הוספת מנות'
        : 'הזמנות לשבת';
    }
  }

  function loadCatalog() {
    const cats = global.SHABBAT_MENU_DATA?.categories || [];
    const pack = global.SHABBAT_TRANSLATIONS?.he || {};
    catalogCache = [];
    cats.forEach((cat) => {
      const key = cat.titleKey && String(cat.titleKey).startsWith('categories.')
        ? String(cat.titleKey).slice('categories.'.length)
        : cat.id;
      const title = pack.categories?.[key] || cat.title || cat.id;
      (cat.items || []).forEach((item) => {
        if (!item?.id) return;
        catalogCache.push({
          id: item.id,
          name: item.name || item.id,
          printName: item.printName || item.nameEn || item.name || item.id,
          price: Number(item.price) || 0,
          categoryId: cat.id,
          categoryTitle: title,
          available: window.LechaimInventory
            ? window.LechaimInventory.isAvailable(item.id)
            : true,
        });
      });
    });
    return catalogCache;
  }

  function getCategories(catalog) {
    const seen = new Map();
    (catalog || []).forEach((item) => {
      if (!item.categoryId || seen.has(item.categoryId)) return;
      seen.set(item.categoryId, { id: item.categoryId, title: item.categoryTitle || item.categoryId });
    });
    return Array.from(seen.values());
  }

  function renderGrid() {
    if (!gridEl) return;
    setBadge(cache.length);
    if (!cache.length) {
      gridEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    gridEl.innerHTML = cache.map((entry) => `
      <button
        type="button"
        class="table-card table-card--pickup table-card--${escapeHtml(entry.uiStatus)}"
        data-shabbat-id="${escapeHtml(entry.sessionId)}"
      >
        <span class="table-card__badge">שבת</span>
        <span class="table-card__customer">${escapeHtml(entry.customerName)}</span>
        <span class="table-card__phone" dir="ltr">${escapeHtml(entry.customerPhone)}</span>
        <span class="table-card__status">${escapeHtml(statusLabel(entry.uiStatus))}</span>
        <span class="table-card__total">${escapeHtml(formatMoney(entry.total))}</span>
        <span class="table-card__items">${entry.items.reduce((s, i) => s + i.qty, 0)} פריטים</span>
        <span class="table-card__time">${escapeHtml(formatClock(entry.openedAt))}</span>
      </button>
    `).join('');
  }

  function updateActionButtons(entry) {
    const canApprove = needsApprove(entry?.orders);
    if (approveBtn) {
      approveBtn.hidden = !canApprove;
      approveBtn.disabled = busy;
    }
    if (printBtn) {
      printBtn.hidden = false;
      printBtn.disabled = busy;
    }
    if (addItemsBtn) addItemsBtn.disabled = busy;
    if (closeBtn) closeBtn.disabled = busy;
  }

  function fillDrawer(entry) {
    if (!entry) return;
    if (drawerTitle) drawerTitle.textContent = entry.customerName;
    if (drawerMeta) {
      drawerMeta.innerHTML = `
        <div class="table-drawer__pickup">
          <div class="table-drawer__pickup-badge">הזמנות לשבת</div>
          <div class="table-drawer__pickup-grid">
            <div class="table-drawer__pickup-row"><span>לקוח</span><strong>${escapeHtml(entry.customerName)}</strong></div>
            <div class="table-drawer__pickup-row"><span>טלפון</span><strong dir="ltr">${escapeHtml(entry.customerPhone)}</strong></div>
            <div class="table-drawer__pickup-row"><span>איסוף</span><strong>${escapeHtml(entry.pickupTime || '14:00')}</strong></div>
            ${entry.customerNotes
              ? `<div class="table-drawer__pickup-row"><span>הערות</span><strong dir="auto">${escapeHtml(entry.customerNotes)}</strong></div>`
              : ''}
            ${entry.couponCode
              ? `<div class="table-drawer__pickup-row"><span>קופון</span><strong dir="ltr">${escapeHtml(entry.couponCode)}${entry.discountPercent != null ? ` (−${escapeHtml(String(entry.discountPercent))}%)` : ''}</strong></div>`
              : ''}
          </div>
        </div>
        <div class="table-drawer__meta-row">
          <div class="table-drawer__meta-item"><span>שעה</span><strong>${escapeHtml(formatClock(entry.openedAt))}</strong></div>
          <div class="table-drawer__meta-item"><span>סטטוס</span><strong>${escapeHtml(statusLabel(entry.uiStatus))}</strong></div>
          <div class="table-drawer__meta-item"><span>פריטים</span><strong>${escapeHtml(String(entry.items.reduce((s, i) => s + i.qty, 0)))}</strong></div>
        </div>
      `;
    }
    if (drawerItems) {
      if (!entry.items.length) {
        drawerItems.innerHTML = '<p class="table-drawer__empty">אין פריטים</p>';
      } else if (typeof global.LechaimAdminTables?.renderDrawerItemsHtml === 'function') {
        drawerItems.innerHTML = global.LechaimAdminTables.renderDrawerItemsHtml(entry.items);
      } else {
        const sidesByParent = new Map();
        entry.items.forEach((item) => {
          const parentId = item.linkedToMainItemId ? String(item.linkedToMainItemId) : '';
          if (!parentId) return;
          if (!sidesByParent.has(parentId)) sidesByParent.set(parentId, []);
          sidesByParent.get(parentId).push(item);
        });
        const used = new Set();
        const blocks = [];
        entry.items.forEach((item) => {
          if (item.linkedToMainItemId) return;
          const sides = sidesByParent.get(String(item.itemId)) || [];
          sides.forEach((s) => used.add(String(s.itemId)));
          const sideNames = sides.map((s) => s.name).filter(Boolean).join(', ');
          blocks.push(`
            <li class="${item.isNew ? 'table-drawer__item--late' : ''} table-drawer__group">
              <div class="table-drawer__line">
                <span class="table-drawer__qty">${escapeHtml(String(item.qty))}×</span>
                <span class="table-drawer__name${item.isNew ? ' table-drawer__name--late' : ''}">${escapeHtml(item.name)}</span>
                <span class="table-drawer__price">${escapeHtml(formatMoney(item.price * item.qty))}</span>
              </div>
              ${sideNames ? `<p class="table-drawer__served">מוגש עם: ${escapeHtml(sideNames)}</p>` : ''}
              ${sides.map((side) => `
                <div class="table-drawer__line table-drawer__item--side">
                  <span class="table-drawer__side-badge">תוספת</span>
                  <span class="table-drawer__qty">${escapeHtml(String(side.qty))}×</span>
                  <span class="table-drawer__name">${escapeHtml(side.name)}</span>
                </div>
              `).join('')}
            </li>
          `);
        });
        entry.items.forEach((item) => {
          if (!item.linkedToMainItemId || used.has(String(item.itemId))) return;
          blocks.push(`
            <li class="${item.isNew ? 'table-drawer__item--late' : ''}">
              <div class="table-drawer__line">
                <span class="table-drawer__qty">${escapeHtml(String(item.qty))}×</span>
                <span class="table-drawer__name">${escapeHtml(item.name)}</span>
                <span class="table-drawer__price">${escapeHtml(formatMoney(item.price * item.qty))}</span>
              </div>
            </li>
          `);
        });
        drawerItems.innerHTML = `<ul class="table-drawer__list">${blocks.join('')}</ul>`;
      }
    }
    if (drawerTotal) {
      drawerTotal.innerHTML = `<span>סה״כ</span><strong>${escapeHtml(formatMoney(entry.total))}</strong>`;
    }
    updateActionButtons(entry);
  }

  let drawerFocusTrapRelease = null;

  function openDrawer(entry) {
    selectedId = entry.sessionId;
    setDrawerView('detail');
    fillDrawer(entry);
    if (!drawer) return;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('table-drawer-open');
    if (typeof drawerFocusTrapRelease === 'function') drawerFocusTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(drawer);
    drawerFocusTrapRelease = typeof release === 'function' ? release : null;
    const closeBtn = document.getElementById('shabbat-drawer-close');
    requestAnimationFrame(() => closeBtn?.focus());
  }

  function closeDrawer() {
    selectedId = null;
    menuMode = false;
    setDrawerView('detail');
    if (!drawer) return;
    if (typeof drawerFocusTrapRelease === 'function') drawerFocusTrapRelease();
    drawerFocusTrapRelease = null;
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('table-drawer-open');
  }

  function renderMenuPicker() {
    const catalog = catalogCache.length ? catalogCache : loadCatalog();
    const categories = getCategories(catalog);
    const query = menuQuery.trim().toLowerCase();

    if (menuCats) {
      const chips = [{ id: 'all', title: 'הכל' }, ...categories];
      menuCats.innerHTML = chips.map((cat) => `
        <button
          type="button"
          class="table-menu__cat${menuCategoryId === cat.id ? ' is-active' : ''}"
          data-shabbat-menu-cat="${escapeAttr(cat.id)}"
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
      menuList.innerHTML = '<p class="table-drawer__empty">לא נמצאו מנות</p>';
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
      parts.push(`
        <div class="table-menu__item${!available ? ' is-unavailable' : ''}">
          <div class="table-menu__item-text">
            <strong>${escapeHtml(item.name || item.id)}</strong>
            <span>${escapeHtml(formatMoney(item.price))}</span>
            ${!available ? '<em>אין במלאי</em>' : ''}
          </div>
          <button
            type="button"
            class="admin-btn admin-btn--soft table-menu__add"
            data-shabbat-add-product="${escapeAttr(item.id)}"
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
    const entry = cache.find((row) => row.sessionId === selectedId);
    if (entry) fillDrawer(entry);
    renderMenuPicker();
    menuSearch?.focus();
  }

  function closeMenuPicker() {
    setDrawerView('detail');
    const entry = cache.find((row) => row.sessionId === selectedId);
    if (entry) fillDrawer(entry);
  }

  async function refresh() {
    const api = global.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.getOpenShabbatSessionsWithOrders !== 'function') {
      cache = [];
      renderGrid();
      return;
    }
    try {
      const rows = await api.getOpenShabbatSessionsWithOrders();
      cache = (rows || []).map((row) => mapRow(row.session, row.orders));
      /* Keep empty admin-created cards (name only, no items yet) */
      renderGrid();
      if (selectedId) {
        const selected = cache.find((row) => row.sessionId === selectedId);
        if (selected) {
          fillDrawer(selected);
          if (menuMode) renderMenuPicker();
        } else {
          closeDrawer();
        }
      }
    } catch (err) {
      console.error('[admin-shabbat] refresh failed', err);
    }
  }

  async function handleApprove() {
    const entry = cache.find((row) => row.sessionId === selectedId);
    if (!entry || busy) return;
    const api = global.LechaimSupabaseOrders;
    if (!api?.markOrderApproved) {
      showToast('אישור לא זמין');
      return;
    }
    const pending = (entry.orders || []).filter(orderNeedsApprove);
    if (!pending.length) {
      showToast('אין מה לאשר');
      return;
    }
    busy = true;
    updateActionButtons(entry);
    try {
      global.LechaimAdminTables?.silenceNotifyChime?.();
      for (const order of pending) {
        await api.markOrderApproved(order.id);
      }
      showToast('ההזמנה אושרה · בהכנה');
      await refresh();
    } catch (err) {
      console.error('[admin-shabbat] approve failed', err);
      showToast('האישור נכשל');
    } finally {
      busy = false;
      const next = cache.find((row) => row.sessionId === selectedId);
      if (next) updateActionButtons(next);
    }
  }

  /** Build one print ticket from everything currently shown on the card. */
  function mapEntryToFullPrintOrder(entry) {
    const items = (entry.items || [])
      .map((row) => {
        const qty = Number(row.qty) || 0;
        if (qty <= 0) return null;
        return {
          itemId: String(row.itemId),
          productId: String(row.productId || ''),
          name: row.printName || row.name || row.productId || '',
          printName: row.printName || '',
          price: Number(row.price) || 0,
          qty,
          notes: '',
          printed: false,
          linkedToMainItemId: row.linkedToMainItemId || null,
        };
      })
      .filter(Boolean);

    const maxWave = (entry.orders || []).reduce(
      (max, order) => Math.max(max, Number(order.order_number) || 0),
      0
    );

    return {
      orderId: `shabbat-full-${entry.sessionId}`,
      sessionId: entry.sessionId,
      tableNumber: null,
      orderType: 'shabbat',
      status: 'active',
      createdAt: entry.openedAt || null,
      updatedAt: null,
      items,
      ticketSeq: maxWave || 1,
      customerName: entry.customerName,
      customerPhone: entry.customerPhone,
      customerNotes: entry.customerNotes,
      pickupType: 'TIME',
      pickupTime: entry.pickupTime || '14:00',
      publicOrderNo: null,
      _skipLocalMarkPrinted: true,
    };
  }

  async function handlePrint() {
    const entry = cache.find((row) => row.sessionId === selectedId);
    if (!entry || busy) return;
    const api = global.LechaimSupabaseOrders;
    const print = global.LechaimPrintEngine;
    if (typeof print?.printOrder !== 'function') {
      showToast('הדפסה לא זמינה');
      return;
    }

    const synthetic = mapEntryToFullPrintOrder(entry);
    if (!synthetic.items.length) {
      showToast('אין פריטים להדפסה');
      return;
    }

    busy = true;
    updateActionButtons(entry);
    let printedOk = false;
    try {
      const ok = await print.printOrder(synthetic);
      if (ok !== true) {
        showToast('ההדפסה נכשלה — נסה שוב');
        return;
      }

      /* Mark unprinted waves so status stays in sync (reprint still allowed anytime). */
      if (api?.markOrderPrinted) {
        const unprinted = (entry.orders || []).filter(orderNeedsPrint);
        for (const order of unprinted) {
          try {
            await api.markOrderPrinted(order.id);
          } catch (markErr) {
            console.error('[admin-shabbat] markOrderPrinted failed after print', markErr);
          }
        }
      }
      printedOk = true;
    } catch (err) {
      console.error('[admin-shabbat] print failed', err);
      showToast('ההדפסה נכשלה');
      return;
    } finally {
      busy = false;
    }

    if (!printedOk) return;
    showSuccess('ההזמנה הודפסה', { checkOnly: true });
    closeDrawer();
    await refresh();
  }

  function clampQty(n, max = QTY_MAX) {
    const v = Math.floor(Number(n) || 0);
    const hi = Math.max(QTY_MIN, Math.floor(Number(max) || QTY_MAX));
    if (!Number.isFinite(v)) return QTY_MIN;
    return Math.min(hi, Math.max(QTY_MIN, v));
  }

  function qtyModalMax() {
    return pendingQtyMode === 'remove' ? pendingRemoveMaxQty : QTY_MAX;
  }

  function renderAdminQtyModal() {
    const nameEl = document.getElementById('admin-qty-product-name');
    const valueEl = document.getElementById('admin-qty-value');
    const decBtn = document.getElementById('admin-qty-dec');
    const incBtn = document.getElementById('admin-qty-inc');
    const titleEl = document.getElementById('admin-qty-title');
    const confirmBtn = document.getElementById('admin-qty-confirm');
    if (!pendingQtyProduct) return;
    const isRemove = pendingQtyMode === 'remove';
    const max = qtyModalMax();
    let label = pendingQtyProduct.name || pendingQtyProduct.id || '';
    if (isRemove && pendingRemoveMaxQty > 1) {
      label = `${label} (יש ${pendingRemoveMaxQty})`;
    }
    if (titleEl) titleEl.textContent = isRemove ? 'כמה להסיר?' : 'בחרו כמות';
    if (confirmBtn) confirmBtn.textContent = isRemove ? 'הסר' : 'הוסף';
    if (nameEl) nameEl.textContent = label;
    if (valueEl) valueEl.textContent = String(pendingQty);
    if (decBtn) decBtn.disabled = pendingQty <= QTY_MIN;
    if (incBtn) incBtn.disabled = pendingQty >= max;
  }

  function openAdminQtyModal(product) {
    const modal = document.getElementById('admin-qty-modal');
    if (!modal || !product) return;
    pendingQtyMode = 'add';
    pendingRemoveItemId = null;
    pendingRemoveMaxQty = QTY_MAX;
    pendingQtyProduct = product;
    pendingQty = QTY_MIN;
    renderAdminQtyModal();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => document.getElementById('admin-qty-confirm')?.focus());
  }

  function openAdminRemoveQtyModal(item) {
    const modal = document.getElementById('admin-qty-modal');
    if (!modal || !item) return;
    const have = Math.max(1, Math.floor(Number(item.qty) || 1));
    pendingQtyMode = 'remove';
    pendingRemoveItemId = String(item.itemId);
    pendingRemoveMaxQty = have;
    pendingQtyProduct = {
      id: item.productId || item.itemId,
      name: item.name || 'מנה',
    };
    pendingQty = QTY_MIN;
    renderAdminQtyModal();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => document.getElementById('admin-qty-confirm')?.focus());
  }

  function closeAdminQtyModal() {
    const modal = document.getElementById('admin-qty-modal');
    pendingQtyProduct = null;
    pendingQty = QTY_MIN;
    pendingQtyMode = 'add';
    pendingRemoveItemId = null;
    pendingRemoveMaxQty = QTY_MAX;
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    const titleEl = document.getElementById('admin-qty-title');
    const confirmBtn = document.getElementById('admin-qty-confirm');
    if (titleEl) titleEl.textContent = 'בחרו כמות';
    if (confirmBtn) confirmBtn.textContent = 'הוסף';
  }

  function setAdminQty(next) {
    if (!pendingQtyProduct) return;
    pendingQty = clampQty(next, qtyModalMax());
    renderAdminQtyModal();
  }

  async function commitAddProduct(product, quantity = 1) {
    const entry = cache.find((row) => row.sessionId === selectedId);
    if (!entry || !product) return false;

    const qty = clampQty(quantity);
    const api = global.LechaimSupabaseOrders;
    if (!api?.createOrder || !api?.createOrderItems) {
      showToast('הוספה לא זמינה');
      return false;
    }

    const price = Number(product.price) || 0;
    const printName = global.LechaimPrintEngine?.resolvePrintName?.({
      productId: product.id,
      name: product.name,
      printName: product.printName,
    }) || product.printName || product.name || '';

    let remoteOrders = entry.orders || [];
    try {
      const fresh = await api.getSessionOrders?.(entry.sessionId);
      if (Array.isArray(fresh)) remoteOrders = fresh;
    } catch (_) { /* use cached */ }

    const unprinted = remoteOrders
      .filter((order) => order && order.id && !order.printed_at)
      .sort((a, b) => (Number(b.order_number) || 0) - (Number(a.order_number) || 0));
    const stackInto = unprinted[0] && (Number(unprinted[0].order_number) || 0) > 1
      ? unprinted[0]
      : null;

    if (stackInto?.id) {
      const lines = Array.isArray(stackInto.order_items) ? stackInto.order_items : [];
      const same = lines.find((row) => (
        String(row.product_id || '') === String(product.id)
        && !row.parent_item_id
      ));
      if (same?.id && typeof api.bumpOrderItemQuantity === 'function') {
        await api.bumpOrderItemQuantity(same.id, qty);
        return true;
      }
      await api.createOrderItems(stackInto.id, [{
        productId: product.id,
        productName: product.name || '',
        printName,
        quantity: qty,
        price,
        category: 'shabbat',
        notes: null,
      }]);
      if (typeof api.refreshOrderTotal === 'function') {
        await api.refreshOrderTotal(stackInto.id);
      }
      return true;
    }

    const remoteOrder = await api.createOrder({
      sessionId: entry.sessionId,
      total: price * qty,
      status: 'submitted',
    });
    if (!remoteOrder?.id) throw new Error('createOrder failed');
    await api.createOrderItems(remoteOrder.id, [{
      productId: product.id,
      productName: product.name || '',
      printName,
      quantity: qty,
      price,
      category: 'shabbat',
      notes: null,
    }]);
    return true;
  }

  async function confirmAdminQtyModal() {
    if (!pendingQtyProduct) return;

    if (pendingQtyMode === 'remove') {
      if (removeBusy || !pendingRemoveItemId) return;
      const itemId = pendingRemoveItemId;
      const qty = clampQty(pendingQty, pendingRemoveMaxQty);
      closeAdminQtyModal();
      await commitRemoveQuantity(itemId, qty);
      return;
    }

    if (busy) return;
    const product = pendingQtyProduct;
    const qty = clampQty(pendingQty);
    busy = true;
    try {
      const ok = await commitAddProduct(product, qty);
      if (!ok) {
        showToast('לא ניתן להוסיף');
        return;
      }
      closeAdminQtyModal();
      const qtyLabel = qty > 1 ? `${qty}× ` : '';
      showSuccess(`המוצר נוסף בהצלחה\n${qtyLabel}${product.name}`);
      await refresh();
      if (menuMode) renderMenuPicker();
    } catch (err) {
      console.error('[admin-shabbat] add product with qty failed', err);
      showToast('לא ניתן להוסיף');
    } finally {
      busy = false;
    }
  }

  async function handleAddProduct(productId) {
    const entry = cache.find((row) => row.sessionId === selectedId);
    if (!entry || !productId || busy) return;
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
    openAdminQtyModal(product);
  }

  async function handleRemoveItem(itemId) {
    const id = String(itemId || '');
    if (!id || removeBusy) return;
    const entry = cache.find((row) => row.sessionId === selectedId);
    if (!entry) return;
    const item = (entry.items || []).find((row) => String(row.itemId) === id);
    if (!item) return;

    const have = Math.floor(Number(item.qty) || 0);
    if (have > 1) {
      openAdminRemoveQtyModal(item);
      return;
    }

    const label = item?.name || 'מנה';
    const productId = String(item?.productId || '');
    const isShakeBase = Boolean(global.SHAKE_BASE_IDS?.has?.(productId));
    const isShakeParent = productId === String(global.FRUIT_SHAKE_ID || 'fruit-shake')
      && !item?.linkedToMainItemId;
    const linkedKids = isShakeParent
      ? (entry.items || []).filter((row) => String(row.linkedToMainItemId || '') === id)
      : [];

    let ask = `האם אתה בטוח שברצונך להסיר את "${label}" מההזמנה?`;
    if (isShakeBase) {
      ask = `להסיר את בסיס השייק "${label}" מההזמנה?`;
    } else if (isShakeParent) {
      ask = linkedKids.length
        ? `להסיר את שייק הפירות ואת הבסיס שנבחר (${linkedKids.map((k) => k.name).filter(Boolean).join(', ') || 'בסיס'})?`
        : `להסיר את שייק הפירות מההזמנה?`;
    }

    const ok = await showConfirm(ask, 'כן, הסר');
    if (!ok) return;

    await commitRemoveQuantity(id, 1);
  }

  async function commitRemoveQuantity(itemId, removeQty) {
    const id = String(itemId || '');
    if (!id || removeBusy) return false;
    const entry = cache.find((row) => row.sessionId === selectedId);
    if (!entry) return false;
    const item = (entry.items || []).find((row) => String(row.itemId) === id);
    if (!item) return false;

    const have = Math.floor(Number(item.qty) || 0);
    const qty = Math.min(Math.max(1, Math.floor(Number(removeQty) || 0)), have);
    if (qty < 1 || have < 1) return false;

    const api = global.LechaimSupabaseOrders;
    if (!api?.deleteOrderItem) {
      showToast('מחיקה לא זמינה');
      return false;
    }

    const productId = String(item?.productId || '');
    const isShakeBase = Boolean(global.SHAKE_BASE_IDS?.has?.(productId));
    const linkedKids = (entry.items || []).filter(
      (row) => String(row.linkedToMainItemId || '') === id
    );

    removeBusy = true;
    try {
      if (qty >= have) {
        await api.deleteOrderItem(id);
      } else {
        if (typeof api.bumpOrderItemQuantity !== 'function') {
          showToast('הפחתת כמות לא זמינה');
          return false;
        }
        await api.bumpOrderItemQuantity(id, -qty);
        for (const kid of linkedKids) {
          const kidHave = Math.floor(Number(kid.qty) || 0);
          if (kidHave <= 0) continue;
          if (kidHave <= qty) {
            await api.deleteOrderItem(kid.itemId);
          } else {
            await api.bumpOrderItemQuantity(kid.itemId, -qty);
          }
        }
      }
      showToast(isShakeBase ? 'בסיס השייק הוסר' : (qty > 1 ? `${qty} מנות הוסרו` : 'המנה הוסרה'));
      await refresh();
      if (!cache.find((row) => row.sessionId === selectedId)) closeDrawer();
      return true;
    } catch (err) {
      console.error('[admin-shabbat] remove quantity failed', err);
      showToast('לא ניתן להסיר את המנה');
      return false;
    } finally {
      removeBusy = false;
    }
  }

  async function handleClose() {
    const entry = cache.find((row) => row.sessionId === selectedId);
    if (!entry || busy) return;
    const ok = await showConfirm(
      'האם אתה בטוח שברצונך לסגור את הזמנת השבת?',
      'כן, סגור הזמנה'
    );
    if (!ok) return;

    const api = global.LechaimSupabaseOrders;
    if (!api?.updateSessionStatus) {
      showToast('סגירה לא זמינה');
      return;
    }
    busy = true;
    try {
      await api.updateSessionStatus(entry.sessionId, { status: 'closed' });
      showToast('הזמנת שבת נסגרה');
      closeDrawer();
      await refresh();
    } catch (err) {
      console.error('[admin-shabbat] close failed', err);
      showToast('לא ניתן לסגור');
    } finally {
      busy = false;
    }
  }

  function showNewFormError(message) {
    if (!newFormError) return;
    if (!message) {
      newFormError.hidden = true;
      newFormError.textContent = '';
      return;
    }
    newFormError.hidden = false;
    newFormError.textContent = message;
  }

  function closeNewModal() {
    if (!newModal) return;
    if (typeof newModalTrapRelease === 'function') newModalTrapRelease();
    newModalTrapRelease = null;
    newModal.hidden = true;
    newModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    showNewFormError('');
  }

  function openNewModal() {
    if (!newModal || !newForm) return;
    showNewFormError('');
    newForm.reset();
    newModal.hidden = false;
    newModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    if (typeof newModalTrapRelease === 'function') newModalTrapRelease();
    const release = global.LechaimFocusTrap?.activate?.(newModal);
    newModalTrapRelease = typeof release === 'function' ? release : null;
    newName?.focus();
  }

  async function handleCreateCard(event) {
    event.preventDefault();
    const customerName = String(newName?.value || '').trim();
    const customerPhone = String(newPhone?.value || '').trim();
    const notes = String(newNotes?.value || '').trim();
    if (!customerName) {
      showNewFormError('נא להזין שם לקוח');
      newName?.focus();
      return;
    }
    const api = global.LechaimSupabaseOrders;
    if (!api?.createSession) {
      showNewFormError('יצירת כרטיס לא זמינה');
      return;
    }
    if (newSaveBtn) newSaveBtn.disabled = true;
    try {
      const session = await api.createSession({
        orderType: 'shabbat',
        customerName,
        customerPhone: customerPhone || null,
        notes: notes || null,
        pickupType: 'TIME',
        pickupTime: '14:00',
        language: 'he',
      });
      closeNewModal();
      showSuccess('כרטיס שבת נוצר');
      await refresh();
      const entry = cache.find((row) => row.sessionId === String(session?.session_id || ''));
      if (entry) {
        openDrawer(entry);
        openMenuPicker();
      }
    } catch (err) {
      console.error('[admin-shabbat] create card failed', err);
      showNewFormError(err?.message || 'יצירת הכרטיס נכשלה');
    } finally {
      if (newSaveBtn) newSaveBtn.disabled = false;
    }
  }

  function onGridClick(event) {
    const btn = event.target.closest('[data-shabbat-id]');
    if (!btn) return;
    const entry = cache.find((row) => row.sessionId === btn.getAttribute('data-shabbat-id'));
    if (entry) openDrawer(entry);
  }

  function updateShabbatOrdersToggleButton() {
    if (!ordersToggleBtn) return;
    if (shabbatOrdersEnabled) {
      ordersToggleBtn.textContent = 'הזמנות שבת פתוחות';
      ordersToggleBtn.classList.add('admin-btn--ghost');
      ordersToggleBtn.classList.remove('admin-btn--primary');
    } else {
      ordersToggleBtn.textContent = 'הזמנות שבת סגורות';
      ordersToggleBtn.classList.remove('admin-btn--ghost');
      ordersToggleBtn.classList.add('admin-btn--primary');
    }
  }

  async function refreshShabbatOrdersEnabledFlag() {
    const api = global.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.getShabbatOrdersEnabled !== 'function') {
      updateShabbatOrdersToggleButton();
      return;
    }
    try {
      shabbatOrdersEnabled = Boolean(await api.getShabbatOrdersEnabled());
      updateShabbatOrdersToggleButton();
    } catch (err) {
      console.warn('[admin-shabbat] orders flag load failed', err);
    }
  }

  async function toggleShabbatOrdersEnabled() {
    const api = global.LechaimSupabaseOrders;
    if (!api?.setShabbatOrdersEnabled) {
      showToast('מתג הזמנות שבת לא זמין — הריצו supabase-shabbat-orders-flag.sql');
      return;
    }
    const nextEnabled = !shabbatOrdersEnabled;
    const ok = await showConfirm(
      nextEnabled
        ? 'לפתוח הזמנות שבת בצד הלקוח?\nיופיע שוב כרטיס "הזמנות לשבת" וניתן יהיה להזמין.'
        : 'לסגור הזמנות שבת בצד הלקוח?\nהכרטיס יהיה סגור ולא ניתן יהיה להיכנס להזמנה.',
      nextEnabled ? 'פתח הזמנות שבת' : 'סגור הזמנות שבת'
    );
    if (!ok) return;
    try {
      await api.setShabbatOrdersEnabled(nextEnabled);
      shabbatOrdersEnabled = nextEnabled;
      updateShabbatOrdersToggleButton();
      showSuccess(nextEnabled ? 'הזמנות שבת פתוחות' : 'הזמנות שבת סגורות', { checkOnly: true });
    } catch (err) {
      console.error('[admin-shabbat] toggle orders flag failed', err);
      showToast('לא ניתן לעדכן את מצב הזמנות שבת');
    }
  }

  function start() {
    if (running) {
      refresh();
      refreshShabbatOrdersEnabledFlag().catch(() => {});
      return;
    }
    running = true;
    refresh();
    refreshShabbatOrdersEnabledFlag().catch(() => {});
    if (!shabbatFlagUnsub && global.LechaimSupabaseOrders?.subscribeRestaurantFlags) {
      shabbatFlagUnsub = global.LechaimSupabaseOrders.subscribeRestaurantFlags((evt) => {
        if (evt?.flagKey !== 'shabbat_orders_enabled') return;
        shabbatOrdersEnabled = Boolean(evt.flagValue);
        updateShabbatOrdersToggleButton();
      });
    }
    timer = window.setInterval(refresh, 8000);
    try {
      if (global.LechaimSupabaseOrders?.subscribeToOrders) {
        unsub = global.LechaimSupabaseOrders.subscribeToOrders(() => {
          refresh();
        });
      }
    } catch (err) {
      console.warn('[admin-shabbat] subscribe failed', err);
    }
  }

  function stop() {
    running = false;
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    if (typeof unsub === 'function') {
      try { unsub(); } catch (_) { /* ignore */ }
      unsub = null;
    }
    if (typeof shabbatFlagUnsub === 'function') {
      try { shabbatFlagUnsub(); } catch (_) { /* ignore */ }
      shabbatFlagUnsub = null;
    }
    closeNewModal();
    closeDrawer();
  }

  gridEl?.addEventListener('click', onGridClick);
  drawerBackdrop?.addEventListener('click', closeDrawer);
  drawerClose?.addEventListener('click', closeDrawer);
  approveBtn?.addEventListener('click', handleApprove);
  printBtn?.addEventListener('click', handlePrint);
  addItemsBtn?.addEventListener('click', openMenuPicker);
  closeBtn?.addEventListener('click', handleClose);
  menuBack?.addEventListener('click', closeMenuPicker);
  newBtn?.addEventListener('click', openNewModal);
  ordersToggleBtn?.addEventListener('click', () => {
    toggleShabbatOrdersEnabled().catch((err) => {
      console.error('[admin-shabbat] toggle failed', err);
    });
  });
  newCancelBtn?.addEventListener('click', closeNewModal);
  newModalBackdrop?.addEventListener('click', closeNewModal);
  newForm?.addEventListener('submit', handleCreateCard);

  menuCats?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-shabbat-menu-cat]');
    if (!btn) return;
    menuCategoryId = btn.getAttribute('data-shabbat-menu-cat') || 'all';
    renderMenuPicker();
  });

  menuList?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-shabbat-add-product]');
    if (!btn || btn.disabled) return;
    handleAddProduct(btn.getAttribute('data-shabbat-add-product'));
  });

  document.getElementById('admin-qty-inc')?.addEventListener('click', () => {
    if (!pendingQtyProduct) return;
    setAdminQty(pendingQty + 1);
  });
  document.getElementById('admin-qty-dec')?.addEventListener('click', () => {
    if (!pendingQtyProduct) return;
    setAdminQty(pendingQty - 1);
  });
  document.getElementById('admin-qty-confirm')?.addEventListener('click', () => {
    if (!pendingQtyProduct) return;
    void confirmAdminQtyModal();
  });
  document.getElementById('admin-qty-cancel')?.addEventListener('click', () => {
    if (!pendingQtyProduct) return;
    closeAdminQtyModal();
  });
  document.getElementById('admin-qty-backdrop')?.addEventListener('click', () => {
    if (!pendingQtyProduct) return;
    closeAdminQtyModal();
  });

  menuSearch?.addEventListener('input', () => {
    menuQuery = menuSearch.value || '';
    renderMenuPicker();
  });

  drawerItems?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove-item-id], [data-shabbat-remove-id]');
    if (!btn || !drawerItems.contains(btn)) return;
    event.preventDefault();
    handleRemoveItem(
      btn.getAttribute('data-remove-item-id') || btn.getAttribute('data-shabbat-remove-id')
    );
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const qtyModal = document.getElementById('admin-qty-modal');
    if (pendingQtyProduct && qtyModal && !qtyModal.hidden) {
      closeAdminQtyModal();
      return;
    }
    if (newModal && !newModal.hidden) {
      closeNewModal();
      return;
    }
    if (!drawer || drawer.hidden) return;
    if (menuMode) {
      closeMenuPicker();
      return;
    }
    closeDrawer();
  });

  global.LechaimAdminShabbat = { start, stop, refresh, closeDrawer };
})(window);
