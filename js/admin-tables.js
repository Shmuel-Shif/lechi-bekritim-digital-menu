/**
 * LECHAIM — Admin Tables board (Stage 5)
 * Live table status from LechaimOrderSession + LechaimOrderEngine (localStorage).
 * In-admin menu picker to add dishes by category.
 */
(function () {
  'use strict';

  const Engine = () => window.LechaimOrderEngine;
  const gridEl = document.getElementById('tables-grid');
  const takeawaySection = document.getElementById('tables-takeaway');
  const takeawayGrid = document.getElementById('tables-takeaway-grid');
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
  const toastEl = document.getElementById('admin-toast');
  const successModal = document.getElementById('admin-success-modal');
  const successText = document.getElementById('admin-success-text');
  const successOk = document.getElementById('admin-success-ok');
  const successBackdrop = document.getElementById('admin-success-backdrop');

  let pollTimer = null;
  let selectedKey = null;
  let toastTimer = null;
  let menuMode = false;
  let menuCategoryId = 'all';
  let menuQuery = '';
  let catalogCache = [];

  function showToast(message) {
    if (!toastEl) return;
    toastEl.hidden = false;
    toastEl.textContent = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.hidden = true;
      toastEl.textContent = '';
    }, 2200);
  }

  function showSuccessModal(message) {
    if (!successModal) {
      showToast(message);
      return;
    }
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
    document.body.classList.remove('admin-modal-open');
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
    if (uiStatus === 'active') return 'פעיל';
    if (uiStatus === 'bill_requested') return 'ביקש חשבון';
    return 'פנוי';
  }

  function orderTypeLabel(orderType) {
    if (orderType === 'takeaway') return 'Take Away';
    if (orderType === 'dinein') return 'Dine In';
    return '—';
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
    const engine = Engine();
    if (!engine || !selectedKey) return null;
    const board = engine.getTablesBoard?.() || [];
    const takeaway = engine.getTakeawayBoard?.() || [];
    return findSelectedEntry(board, takeaway);
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
    return `
      <button
        type="button"
        class="table-card table-card--${escapeHtml(entry.uiStatus)}"
        data-entry-key="${escapeHtml(entryKey(entry))}"
      >
        <span class="table-card__num">${
          entry.orderType === 'takeaway'
            ? 'TA'
            : escapeHtml(String(entry.tableNumber))
        }</span>
        <span class="table-card__status">${escapeHtml(statusLabel(entry.uiStatus))}</span>
        <span class="table-card__type">${escapeHtml(orderTypeLabel(entry.orderType))}</span>
        <span class="table-card__total">${free ? '€0' : escapeHtml(formatMoney(entry.total))}</span>
        <span class="table-card__items">${free ? '0 פריטים' : `${entry.itemCount} פריטים`}</span>
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
      drawerTitle.textContent = entry.orderType === 'takeaway'
        ? 'Take Away'
        : `שולחן ${entry.tableNumber}`;
    }
    if (drawerType) {
      drawerType.textContent = menuMode
        ? `${orderTypeLabel(entry.orderType)} · הוספת מנות`
        : `${orderTypeLabel(entry.orderType)} · ${statusLabel(entry.uiStatus)}`;
    }

    if (drawerMeta) {
      drawerMeta.innerHTML = `
        <div class="table-drawer__meta-item"><span>שעת פתיחה</span><strong>${escapeHtml(formatClock(entry.openedAt))}</strong></div>
        <div class="table-drawer__meta-item"><span>משך</span><strong>${escapeHtml(formatElapsed(entry.openedAt))}</strong></div>
        <div class="table-drawer__meta-item"><span>פריטים</span><strong>${escapeHtml(String(entry.itemCount))}</strong></div>
      `;
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
                </div>
                ${item.notes ? `<p class="table-drawer__notes">${escapeHtml(item.notes)}</p>` : ''}
              </li>
            `).join('')}
          </ul>
        `;
      }
    }

    if (drawerTotal) {
      drawerTotal.innerHTML = `<span>סה״כ לתשלום</span><strong>${escapeHtml(formatMoney(entry.total))}</strong>`;
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
      showToast('השולחן פנוי');
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

  function handleAddProduct(productId) {
    const engine = Engine();
    const entry = getSelectedEntry();
    if (!engine?.addProductToOrder || !entry?.order || !productId) return;

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

    const updated = engine.addProductToOrder(entry.order.orderId, product, 1);
    if (!updated) {
      showToast('לא ניתן להוסיף');
      return;
    }

    showSuccessModal(`המוצר נוסף בהצלחה\n${product.name}`);
    renderBoard();
    if (menuMode) renderMenuPicker();
  }

  async function handlePrintCustomerBill(entry) {
    const engine = Engine();
    if (!entry?.order?.orderId) {
      showToast('אין הזמנה פעילה');
      return;
    }
    if (!window.LechaimPrintEngine?.printCustomerBill) {
      showToast('מנוע ההדפסה לא זמין');
      return;
    }

    try {
      const printed = await LechaimPrintEngine.printCustomerBill(entry.order);
      if (!printed) {
        showToast('הדפסת החשבון נכשלה');
        return;
      }

      engine.requestBill?.(entry.order.orderId);
      showToast('החשבון הודפס בבר · השולחן מסומן: ביקש חשבון');
      setDrawerView('detail');
      renderBoard();
    } catch (err) {
      console.error('[admin-tables] print customer bill failed', err);
      showToast('הדפסת החשבון נכשלה');
    }
  }

  function handleAction(action) {
    const engine = Engine();
    if (!engine || !selectedKey) return;

    const entry = getSelectedEntry();
    if (!entry?.order) return;

    if (action === 'add-items') {
      openMenuPicker();
      return;
    }

    if (action === 'print-bill') {
      handlePrintCustomerBill(entry);
      return;
    }

    if (action === 'close-table') {
      const closed = entry.orderType === 'takeaway'
        ? engine.closeOrder?.({ orderId: entry.order.orderId })
        : engine.closeTable?.(entry.tableNumber);

      if (!closed) {
        showToast('לא ניתן לסגור');
        return;
      }
      showToast(entry.orderType === 'takeaway' ? 'Take Away נסגר' : `שולחן ${entry.tableNumber} נסגר`);
      closeDrawer();
      renderBoard();
    }
  }

  function renderBoard() {
    const engine = Engine();
    if (!engine || !gridEl) return;

    const board = engine.getTablesBoard?.() || [];
    const takeaway = engine.getTakeawayBoard?.() || [];

    gridEl.innerHTML = board.map(renderCard).join('');

    if (takeawayGrid && takeawaySection) {
      if (takeaway.length) {
        takeawaySection.hidden = false;
        takeawayGrid.innerHTML = takeaway.map(renderCard).join('');
      } else {
        takeawaySection.hidden = true;
        takeawayGrid.innerHTML = '';
      }
    }

    const selected = findSelectedEntry(board, takeaway);
    if (selectedKey && selected?.order) {
      fillDrawer(selected);
    } else if (selectedKey && (!selected || !selected.order)) {
      closeDrawer();
    }
  }

  function onGridClick(event) {
    const card = event.target.closest('[data-entry-key]');
    if (!card) return;
    const key = card.dataset.entryKey;
    const engine = Engine();
    const board = engine?.getTablesBoard?.() || [];
    const takeaway = engine?.getTakeawayBoard?.() || [];
    const entry = String(key).startsWith('takeaway')
      ? (takeaway.find((row) => entryKey(row) === key) || takeaway[0])
      : board.find((row) => entryKey(row) === key);
    if (entry) openDrawer(entry);
  }

  function startPolling() {
    stopPolling();
    renderBoard();
    pollTimer = window.setInterval(renderBoard, 1000);
  }

  function stopPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function init() {
    gridEl?.addEventListener('click', onGridClick);
    takeawayGrid?.addEventListener('click', onGridClick);
    drawerBackdrop?.addEventListener('click', closeDrawer);
    drawerClose?.addEventListener('click', closeDrawer);
    menuBack?.addEventListener('click', closeMenuPicker);
    successOk?.addEventListener('click', closeSuccessModal);
    successBackdrop?.addEventListener('click', closeSuccessModal);

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
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
