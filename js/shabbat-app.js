/**
 * LECHAIM — Shabbat ordering app (isolated from dine-in / takeaway)
 */
(function () {
  'use strict';

  const CART_KEY = 'lechaim-shabbat-cart';
  const DETAILS_KEY = 'lechaim-shabbat-customer';
  const LOCK_KEY = 'lechaim-shabbat-order-lock';
  const ENTERED_MENU_KEY = 'lechaim-shabbat-entered-menu';
  function pickupWindow() {
    return window.LechaimAppSettings?.getShabbatPickupTime?.() || '14:00';
  }

  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  let lang = 'he';
  let cart = [];
  let customerDetails = null;
  let sending = false;
  let browseOnly = false;
  let receiptItems = null;
  let sessionWatchUnsub = null;
  let remoteSyncTimer = null;

  const closedEl = $('#shabbat-closed');
  const appEl = $('#shabbat-app');
  const browseBtn = $('#shabbat-browse-menu');
  const notesBody = $('#shabbat-menu-notes-body');
  const yearEl = $('#shabbat-year');
  const cartToggle = $('#shabbat-cart-toggle');
  const cartIcon = $('#shabbat-cart-icon');
  const cartBadge = $('#shabbat-cart-badge');
  const cartLabel = $('#shabbat-cart-label');
  const cartPanel = $('#shabbat-cart-panel');
  const cartTitle = $('#shabbat-cart-title');
  const cartBody = $('#shabbat-cart-body');
  const cartTotal = $('#shabbat-cart-total');
  const cartClose = $('#shabbat-cart-close');
  const cartBackdrop = $('#shabbat-cart-backdrop');
  const btnContinue = $('#shabbat-continue');
  const btnClear = $('#shabbat-clear');
  const menuSections = $('#shabbat-menu-sections');
  const menuEmpty = $('#shabbat-menu-empty');
  const navList = $('#shabbat-nav-list');
  const entryGate = $('#shabbat-entry-gate');
  const pickupForm = $('#shabbat-pickup-form');
  const pickupName = $('#shabbat-pickup-name');
  const pickupPhone = $('#shabbat-pickup-phone');
  const pickupNotes = $('#shabbat-pickup-notes');
  const pickupError = $('#shabbat-pickup-error');
  const feedback = $('#shabbat-feedback');
  const langToggle = $('#shabbat-lang-toggle');
  const entryLangToggle = $('#shabbat-entry-lang-toggle');
  const orderReceipt = $('#shabbat-order-receipt');
  const receiptBackdrop = $('#shabbat-receipt-backdrop');
  const receiptClose = $('#shabbat-receipt-close');
  const receiptEyebrow = $('#shabbat-receipt-eyebrow');
  const receiptTitle = $('#shabbat-receipt-title');
  const receiptMeta = $('#shabbat-receipt-meta');
  const receiptBody = $('#shabbat-receipt-body');
  const receiptTotalLabel = $('#shabbat-receipt-total-label');
  const receiptTotal = $('#shabbat-receipt-total');
  const receiptContinue = $('#shabbat-receipt-continue');
  const receiptNew = $('#shabbat-receipt-new');
  const foodModal = $('#shabbat-food-modal');
  const foodModalBody = $('#shabbat-food-modal-body');
  const foodModalClose = $('#shabbat-food-modal-close');
  const foodModalBackdrop = $('#shabbat-food-modal-backdrop');

  let openModalItemId = null;
  let adminShabbatOrdersEnabled = true;

  /* Ordering is open unless Admin closes Shabbat orders. */

  const focusTrapReleases = {
    cart: null,
    receipt: null,
    details: null,
    food: null,
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

  function clearFocusTrap(key) {
    if (typeof focusTrapReleases[key] === 'function') {
      focusTrapReleases[key]();
    }
    focusTrapReleases[key] = null;
  }

  function t(key) {
    const overlay = window.LechaimAppSettings?.copy?.(key, lang);
    if (overlay) return overlay;
    const pack = window.SHABBAT_TRANSLATIONS?.[lang] || window.SHABBAT_TRANSLATIONS?.he || {};
    if (key.startsWith('categories.')) {
      const id = key.slice('categories.'.length);
      return pack.categories?.[id] || key;
    }
    if (key.startsWith('categoryNotes.')) {
      const id = key.slice('categoryNotes.'.length);
      return pack.categoryNotes?.[id] || '';
    }
    return pack[key] || key;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  function isShabbatCustomerOrderingOpen() {
    return adminShabbatOrdersEnabled !== false;
  }

  async function refreshAdminShabbatOrdersFlag() {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.getShabbatOrdersEnabled !== 'function') {
      adminShabbatOrdersEnabled = true;
      return;
    }
    try {
      adminShabbatOrdersEnabled = Boolean(await api.getShabbatOrdersEnabled());
    } catch (err) {
      console.warn('[shabbat] admin orders flag load failed', err);
      adminShabbatOrdersEnabled = true;
    }
  }

  function applyClosedCopy() {
    const titleEl = $('#shabbat-closed-title');
    const textEl = $('#shabbat-closed-text');
    if (titleEl) titleEl.setAttribute('data-i18n', 'closedTitle');
    if (textEl) textEl.setAttribute('data-i18n', 'closedText');
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.title = t('pageTitle');
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const text = t(key);
      el.innerHTML = String(text).includes('\n')
        ? String(text).split('\n').map((line) => line.replace(/</g, '&lt;')).join('<br>')
        : text;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      const text = t(key);
      if (key && text) el.setAttribute('aria-label', text);
    });
    [langToggle, entryLangToggle].forEach((toggle) => {
      if (!toggle) return;
      toggle.querySelectorAll('[data-lang]').forEach((opt) => {
        opt.classList.toggle('lang-toggle__option--active', opt.dataset.lang === lang);
      });
      toggle.setAttribute('aria-label', t('langAria'));
    });
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
    renderNotes();
    updateCartToggleMode();
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      cart = Array.isArray(parsed) ? parsed.filter((row) => row && row.id && Number(row.qty) > 0) : [];
    } catch {
      cart = [];
    }
  }

  function loadCustomerDetails() {
    try {
      const raw = sessionStorage.getItem(DETAILS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.customerName && parsed?.customerPhone) {
        customerDetails = {
          customerName: String(parsed.customerName),
          customerNameRaw: String(parsed.customerNameRaw || ''),
          customerPhone: String(parsed.customerPhone),
          customerNotes: String(parsed.customerNotes || ''),
        };
      } else {
        customerDetails = null;
      }
    } catch {
      customerDetails = null;
    }
  }

  function saveCustomerDetails(details) {
    customerDetails = details;
    try {
      sessionStorage.setItem(DETAILS_KEY, JSON.stringify(details));
    } catch {
      /* ignore */
    }
  }

  function clearCustomerDetails() {
    customerDetails = null;
    try {
      sessionStorage.removeItem(DETAILS_KEY);
    } catch {
      /* ignore */
    }
  }

  function readLock() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object' || !parsed.sessionId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeLock(payload) {
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('[shabbat-lock] persist failed', err);
    }
  }

  function clearLock() {
    receiptItems = null;
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch (_) { /* ignore */ }
    document.body.classList.remove('shabbat-locked');
    updateCartToggleMode();
  }

  function isOrderLocked() {
    return Boolean(readLock()?.sessionId);
  }

  function normalizeReceiptItems(rows) {
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => row && Number(row.qty) > 0)
      .map((row) => ({
        productId: row.productId || row.id || '',
        name: row.name || row.printName || row.productId || row.id || '',
        printName: row.printName || '',
        price: Number(row.price) || 0,
        qty: Number(row.qty) || 0,
      }));
  }

  function getReceiptItems() {
    if (Array.isArray(receiptItems) && receiptItems.length) return receiptItems;
    const lock = readLock();
    if (Array.isArray(lock?.items) && lock.items.length) return lock.items;
    return [];
  }

  function lockAfterSend(waveItems) {
    const wave = normalizeReceiptItems(waveItems);
    const prev = getReceiptItems();
    const items = prev.length ? (() => {
      const map = new Map();
      prev.concat(wave).forEach((row) => {
        const key = String(row.productId || row.name);
        const existing = map.get(key);
        if (existing) {
          existing.qty += Number(row.qty) || 0;
        } else {
          map.set(key, { ...row });
        }
      });
      return Array.from(map.values());
    })() : wave;

    const lock = readLock();
    const details = customerDetails || {};
    receiptItems = items;
    writeLock({
      sessionId: lock?.sessionId || null,
      items,
      customerName: details.customerName || lock?.customerName || '',
      customerPhone: details.customerPhone || lock?.customerPhone || '',
      customerNotes: details.customerNotes || lock?.customerNotes || '',
      lockedAt: lock?.lockedAt || new Date().toISOString(),
    });
    document.body.classList.add('shabbat-locked');
    updateCartToggleMode();
  }

  function setLockSessionId(sessionId) {
    const lock = readLock() || {};
    writeLock({
      ...lock,
      sessionId,
      items: Array.isArray(lock.items) ? lock.items : getReceiptItems(),
      customerName: customerDetails?.customerName || lock.customerName || '',
      customerPhone: customerDetails?.customerPhone || lock.customerPhone || '',
      customerNotes: customerDetails?.customerNotes || lock.customerNotes || '',
      lockedAt: lock.lockedAt || new Date().toISOString(),
    });
    document.body.classList.add('shabbat-locked');
  }

  function syncCartBadge(count) {
    if (!cartBadge) return;
    const n = Math.max(0, Number(count) || 0);
    cartBadge.textContent = String(n);
    cartBadge.setAttribute('data-count', String(n));
    cartBadge.hidden = n <= 0;
  }

  function updateCartToggleMode() {
    if (!cartToggle) return;
    const locked = isOrderLocked();
    const cartCount = getCartCount();
    const showOrderIcon = locked && cartCount === 0;
    cartToggle.classList.toggle('is-order-view', showOrderIcon);
    if (cartIcon) {
      cartIcon.src = showOrderIcon ? 'assets/icons/order.svg' : 'assets/icons/cart.svg';
    }
    if (cartLabel) {
      cartLabel.textContent = showOrderIcon ? t('myOrderView') : t('myCart');
      if (showOrderIcon) cartLabel.removeAttribute('data-i18n');
      else cartLabel.setAttribute('data-i18n', 'myCart');
    }
    cartToggle.setAttribute('aria-label', showOrderIcon ? t('openMyOrder') : t('openCart'));
    cartToggle.setAttribute('aria-controls', showOrderIcon ? 'shabbat-order-receipt' : 'shabbat-cart-panel');
    if (showOrderIcon) {
      if (cartBadge) cartBadge.hidden = true;
    } else {
      syncCartBadge(cartCount);
    }
  }

  function formatReceiptMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n.toFixed(2)}`;
  }

  function closeOrderReceipt() {
    if (!orderReceipt) return;
    clearFocusTrap('receipt');
    orderReceipt.hidden = true;
    orderReceipt.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('order-receipt-open');
  }

  function openFoodModalById(itemId) {
    const item = findItem(itemId);
    if (!item || !foodModal || !foodModalBody) return;
    if (!isProductAvailable(item.id)) {
      closeFoodModal();
      return;
    }

    openModalItemId = itemId;
    const name = itemName(item);
    const desc = lang === 'en' && item.descEn ? item.descEn : (item.desc || '');
    const note = lang === 'en' && item.noteEn ? item.noteEn : (item.note || '');
    const imageSrc = String(item.image || '').trim();
    const price = Number(item.price) || 0;
    const imageHtml = imageSrc
      ? `<div class="food-modal-hero">
           <img
             class="food-modal-image"
             src="${escapeAttr(imageSrc)}"
             alt="${escapeAttr(name)}"
             width="540"
             height="540"
             decoding="async"
             onerror="this.closest('.food-modal-hero')?.remove();"
           >
         </div>`
      : '';

    foodModalBody.innerHTML = `
      <div class="food-modal-content" data-item-id="${escapeAttr(itemId)}">
        <article class="food-modal-card">
          ${imageHtml}
          <div class="food-modal-info">
            <h2 id="shabbat-food-modal-title" class="food-modal-title">${escapeHtml(name)}</h2>
            ${desc ? `<p class="food-modal-desc">${escapeHtml(desc)}</p>` : ''}
            <p class="food-modal-price">${escapeHtml(formatPrice(price))}${note ? ` <span class="food-note">${escapeHtml(note)}</span>` : ''}</p>
          </div>
          ${renderModalActions(item)}
        </article>
      </div>
    `;

    foodModal.hidden = false;
    foodModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setFocusTrap('food', foodModal);

    requestAnimationFrame(() => {
      foodModal.classList.add('is-open');
      foodModalClose?.focus();
    });
  }

  function renderModalActions(item) {
    if (browseOnly || !item) return '';
    const qty = cart.find((row) => row.id === item.id)?.qty || 0;
    if (qty > 0) {
      return `
        <div class="food-modal-actions" data-stop-modal="true">
          <div class="food-qty-control food-qty-control--modal">
            <button type="button" class="food-qty-btn" data-action="dec" data-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
            <span class="food-qty-value" aria-live="polite">${qty}</span>
            <button type="button" class="food-qty-btn" data-action="inc" data-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('increase'))}">+</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="food-modal-actions" data-stop-modal="true">
        <button type="button" class="btn btn-primary food-modal-add" data-action="add" data-id="${escapeAttr(item.id)}">
          ${escapeHtml(t('addToCart'))}
        </button>
      </div>
    `;
  }

  function updateOpenFoodModal() {
    if (!openModalItemId || !foodModal || foodModal.hidden) return;
    const item = findItem(openModalItemId);
    if (!item || !isProductAvailable(item.id)) {
      closeFoodModal();
      return;
    }
    const card = foodModalBody?.querySelector('.food-modal-card');
    if (!card) {
      openFoodModalById(openModalItemId);
      return;
    }
    const nextActions = renderModalActions(item);
    const existingActions = card.querySelector('.food-modal-actions');
    if (existingActions && nextActions) {
      existingActions.outerHTML = nextActions;
    } else if (existingActions && !nextActions) {
      existingActions.remove();
    } else if (!existingActions && nextActions) {
      card.insertAdjacentHTML('beforeend', nextActions);
    }
  }

  function closeFoodModal() {
    if (!foodModal) return;
    clearFocusTrap('food');
    foodModal.classList.remove('is-open');
    foodModal.hidden = true;
    foodModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    openModalItemId = null;
    if (foodModalBody) foodModalBody.innerHTML = '';
  }

  function showOrderReceipt(itemsOverride) {
    if (!orderReceipt) {
      showFeedback(true, t('orderSentSuccess'));
      return;
    }

    const items = normalizeReceiptItems(itemsOverride != null ? itemsOverride : getReceiptItems());
    const total = items.reduce((sum, row) => (
      sum + (Number(row.price) || 0) * (Number(row.qty) || 0)
    ), 0);
    const lock = readLock();
    const name = customerDetails?.customerName || lock?.customerName || '';
    const pickup = t('receiptPickupAt').replace('{time}', pickupWindow());

    if (receiptEyebrow) receiptEyebrow.textContent = t('receiptEyebrow');
    if (receiptTitle) receiptTitle.textContent = t('receiptTitle');
    if (receiptTotalLabel) receiptTotalLabel.textContent = t('receiptTotal');
    if (receiptContinue) {
      receiptContinue.textContent = t('receiptContinue');
      receiptContinue.hidden = false;
    }
    if (receiptNew) receiptNew.hidden = true;
    if (receiptClose) {
      receiptClose.hidden = false;
      receiptClose.setAttribute('aria-label', t('receiptClose'));
    }
    if (receiptMeta) {
      const bits = [t('receiptShabbat')];
      if (name) bits.push(name);
      bits.push(pickup);
      receiptMeta.textContent = bits.join(' · ');
    }
    if (receiptBody) {
      if (!items.length) {
        receiptBody.innerHTML = `<p class="order-receipt__empty">${escapeHtml(t('receiptEmpty'))}</p>`;
      } else {
        receiptBody.innerHTML = `
          <ul class="order-receipt__list">
            ${items.map((item) => {
              const lineTotal = (Number(item.price) || 0) * (Number(item.qty) || 0);
              return `
                <li class="order-receipt__line">
                  <span class="order-receipt__qty">${escapeHtml(String(item.qty))}×</span>
                  <span class="order-receipt__name">${escapeHtml(item.name || '')}</span>
                  <span class="order-receipt__price">${escapeHtml(formatReceiptMoney(lineTotal))}</span>
                </li>
              `;
            }).join('')}
          </ul>
        `;
      }
    }
    if (receiptTotal) receiptTotal.textContent = formatReceiptMoney(total);

    closeCart();
    orderReceipt.hidden = false;
    orderReceipt.setAttribute('aria-hidden', 'false');
    document.body.classList.add('order-receipt-open');
    setFocusTrap('receipt', orderReceipt);
    receiptContinue?.focus();
  }

  function stopSessionWatcher() {
    if (typeof sessionWatchUnsub === 'function') {
      try { sessionWatchUnsub(); } catch (_) { /* ignore */ }
      sessionWatchUnsub = null;
    }
    if (remoteSyncTimer) {
      window.clearInterval(remoteSyncTimer);
      remoteSyncTimer = null;
    }
  }

  function resetAfterAdminClose() {
    stopSessionWatcher();
    closeOrderReceipt();
    closeCart();
    clearShabbatLocalState();
    if (pickupForm) pickupForm.reset();
    if (appEl) appEl.hidden = true;
    if (cartToggle) cartToggle.hidden = true;
    showFeedback(true, t('orderClosedByAdmin'));
    window.location.replace('index.html');
  }

  async function syncRemoteReceiptItems() {
    const api = window.LechaimSupabaseOrders;
    const lock = readLock();
    if (!lock?.sessionId || !api?.getSessionOrders) return;
    try {
      const orders = await api.getSessionOrders(lock.sessionId);
      const remoteItems = [];
      (orders || []).forEach((order) => {
        (order.order_items || []).forEach((row) => {
          const qty = Number(row.quantity) || 0;
          if (qty <= 0) return;
          remoteItems.push({
            productId: String(row.product_id || ''),
            name: row.product_name || row.print_name || row.product_id || '',
            printName: row.print_name || '',
            price: Number(row.price) || 0,
            qty,
          });
        });
      });
      if (!remoteItems.length) return;
      receiptItems = remoteItems;
      writeLock({
        ...lock,
        items: remoteItems,
      });
      if (orderReceipt && !orderReceipt.hidden) {
        showOrderReceipt(remoteItems);
      }
    } catch (err) {
      console.warn('[shabbat] receipt sync failed', err);
    }
  }

  function initSessionClosedWatcher() {
    const api = window.LechaimSupabaseOrders;
    const lock = readLock();
    if (!lock?.sessionId || !api?.isConfigured?.() || typeof api.subscribeToOrders !== 'function') {
      return;
    }

    stopSessionWatcher();

    const sessionId = String(lock.sessionId);
    syncRemoteReceiptItems();
    remoteSyncTimer = window.setInterval(() => {
      syncRemoteReceiptItems();
      api.getSession?.(sessionId).then((remote) => {
        if (remote && remote.status === 'closed') resetAfterAdminClose();
      }).catch(() => {});
    }, 45000);

    try {
      sessionWatchUnsub = api.subscribeToOrders((payload) => {
        const table = payload?.table;
        if (table === 'order_sessions') {
          const row = payload.new || payload.payload?.new;
          if (!row || String(row.session_id) !== sessionId) return;
          if (row.status === 'closed') {
            resetAfterAdminClose();
            return;
          }
          syncRemoteReceiptItems();
          return;
        }
        if (table === 'orders') {
          syncRemoteReceiptItems();
        }
      }, { sessionId });
    } catch (err) {
      console.warn('[shabbat] subscribe failed', err);
    }
  }

  async function restoreLockIfNeeded() {
    const lock = readLock();
    if (!lock?.sessionId) return false;

    const api = window.LechaimSupabaseOrders;
    if (api?.getSession) {
      try {
        const remote = await api.getSession(lock.sessionId);
        if (!remote || remote.status === 'closed') {
          clearLock();
          clearCustomerDetails();
          clearCart();
          return false;
        }
      } catch (err) {
        console.warn('[shabbat] lock session check failed', err);
      }
    }

    receiptItems = Array.isArray(lock.items) ? lock.items : [];
    if (!customerDetails && lock.customerName && lock.customerPhone) {
      saveCustomerDetails({
        customerName: lock.customerName,
        customerPhone: lock.customerPhone,
        customerNotes: lock.customerNotes || '',
      });
    }
    document.body.classList.add('shabbat-locked');
    updateCartToggleMode();
    initSessionClosedWatcher();
    return true;
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (_) { /* ignore */ }
  }

  function getCartCount() {
    return cart.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
  }

  function getCartTotal() {
    return cart.reduce((sum, row) => sum + (Number(row.price) || 0) * (Number(row.qty) || 0), 0);
  }

  function findItem(id) {
    const cats = window.SHABBAT_MENU_DATA?.categories || [];
    for (let i = 0; i < cats.length; i += 1) {
      const hit = (cats[i].items || []).find((item) => item && item.id === id);
      if (hit) return hit;
    }
    return null;
  }

  function itemName(item) {
    if (!item) return '';
    if (lang === 'en' && item.nameEn) return item.nameEn;
    return item.name || item.id;
  }

  function formatPrice(amount) {
    return `${t('currency')}${Number(amount) || 0}`;
  }

  function showFeedback(ok, message) {
    if (!feedback) return;
    feedback.hidden = false;
    feedback.classList.toggle('is-ok', ok);
    feedback.classList.toggle('is-err', !ok);
    feedback.textContent = message;
    window.setTimeout(() => {
      feedback.hidden = true;
    }, 3200);
  }

  function renderNotes() {
    if (!notesBody) return;
    const pickup = pickupWindow();
    const notes = window.SHABBAT_MENU_DATA?.notes || [];
    notesBody.innerHTML = notes.map((note) => {
      let text = lang === 'en' ? (note.en || note.he) : (note.he || note.en);
      text = String(text || '').replace(/\d{1,2}:\d{2}/, pickup);
      return `<p>${escapeHtml(text)}</p>`;
    }).join('');
  }

  function isProductAvailable(itemId) {
    if (!window.LechaimInventory?.isAvailable) return true;
    return window.LechaimInventory.isAvailable(itemId);
  }

  function renderMenu() {
    if (!menuSections) return;
    const categories = window.SHABBAT_MENU_DATA?.categories || [];
    const hasItems = categories.some((cat) => (cat.items || []).some((item) => item && isProductAvailable(item.id)));

    renderNotes();

    if (menuEmpty) menuEmpty.hidden = hasItems;
    if (navList) {
      navList.innerHTML = hasItems
        ? categories.map((cat) => {
          const visibleItems = (cat.items || []).filter((item) => item && isProductAvailable(item.id));
          if (!visibleItems.length) return '';
          const title = cat.titleKey ? t(cat.titleKey) : (cat.title || cat.id);
          return `<li><a class="category-link" href="#${escapeAttr(cat.id)}">${escapeHtml(title)}</a></li>`;
        }).join('')
        : '';
    }

    menuSections.innerHTML = categories.map((cat) => {
      const title = cat.titleKey ? t(cat.titleKey) : (cat.title || cat.id);
      const note = cat.noteKey ? t(cat.noteKey) : '';
      const items = (cat.items || []).filter((item) => item && isProductAvailable(item.id));
      if (!items.length) return '';
      return `
        <section class="menu-category is-visible" id="${escapeAttr(cat.id)}">
          <header class="category-header">
            <h2 class="category-title">${escapeHtml(title)}</h2>
            ${note ? `<p class="category-desc shabbat-category-note">${escapeHtml(note)}</p>` : ''}
          </header>
          <div class="food-list">
            ${items.map((item) => {
              const qty = cart.find((row) => row.id === item.id)?.qty || 0;
              const name = itemName(item);
              const price = Number(item.price) || 0;
              const imageSrc = String(item.image || '').trim();
              const hasImage = Boolean(imageSrc);
              let actions = '';
              if (!browseOnly) {
                actions = renderCardActionsHtml(item.id, qty);
              }
              const imageHtml = hasImage
                ? `<div class="food-image-wrap">
                    <img
                      class="food-image"
                      src="${escapeAttr(imageSrc)}"
                      alt="${escapeAttr(name)}"
                      loading="lazy"
                      decoding="async"
                      width="160"
                      height="160"
                      onerror="this.closest('.food-card')?.classList.add('food-card--no-image');this.closest('.food-image-wrap')?.remove();"
                    >
                  </div>`
                : '';
              const recommended = Boolean(window.LechaimInventory?.isRecommended?.(item.id));
              const cardClass = [
                'food-card',
                'is-visible',
                hasImage ? '' : 'food-card--no-image',
                qty > 0 ? 'food-card--in-cart' : '',
                recommended ? 'food-card--recommended' : '',
              ].filter(Boolean).join(' ');
              const cardAttrs = ` tabindex="0" role="button" aria-label="${escapeAttr(name)}"`;
              const ribbon = recommended
                ? `<span class="food-ribbon">${escapeHtml(t('recommended'))}</span>`
                : '';
              return `
                <article
                  class="${cardClass}"
                  data-item-id="${escapeAttr(item.id)}"${cardAttrs}
                >
                  ${ribbon}
                  <div class="food-content">
                    <div class="food-text">
                      <div class="food-text-body">
                        <h3 class="food-name">${escapeHtml(name)}</h3>
                        ${item.desc ? `<p class="food-desc">${escapeHtml(lang === 'en' && item.descEn ? item.descEn : item.desc)}</p>` : ''}
                        <div class="food-meta">
                          <span class="food-price">${escapeHtml(formatPrice(price))}</span>
                          ${item.note ? `<span class="food-note">${escapeHtml(lang === 'en' && item.noteEn ? item.noteEn : item.note)}</span>` : ''}
                        </div>
                      </div>
                      <div class="food-card-actions">${actions}</div>
                    </div>
                    ${imageHtml}
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }).join('');
  }

  function initInventory() {
    if (!window.LechaimInventory) return;
    const apply = () => {
      const before = cart.length;
      cart = cart.filter((row) => isProductAvailable(row.id));
      if (cart.length !== before) saveCart();
      if (openModalItemId && !isProductAvailable(openModalItemId)) closeFoodModal();
      else updateOpenFoodModal();
      renderMenu();
      renderCart();
    };
    window.LechaimInventory.load()
      .then(apply)
      .catch(() => { /* keep full menu if inventory fails */ });
    window.LechaimInventory.subscribe(apply);
  }

  function renderCart() {
    const count = getCartCount();
    const empty = count === 0;
    if (cartTitle) {
      cartTitle.textContent = empty ? t('myCart') : `${t('myCart')} (${count})`;
      if (empty) cartTitle.setAttribute('data-i18n', 'myCart');
      else cartTitle.removeAttribute('data-i18n');
    }
    if (cartTotal) cartTotal.textContent = formatPrice(getCartTotal());
    if (btnContinue) btnContinue.disabled = empty || sending;
    if (btnClear) btnClear.disabled = empty || sending;
    updateCartToggleMode();

    if (!cartBody) return;
    if (empty) {
      cartBody.innerHTML = `<p class="cart-empty">${escapeHtml(t('cartEmpty'))}</p>`;
      return;
    }

    cartBody.innerHTML = cart.map((row) => {
      const item = findItem(row.id) || row;
      const name = itemName(item) || row.name || row.id;
      const price = Number(row.price) || 0;
      const lineTotal = price * (Number(row.qty) || 0);
      const imageSrc = String(item.image || '').trim();
      const thumbHtml = imageSrc
        ? `<div class="cart-item-thumb">
            <img src="${escapeAttr(imageSrc)}" alt="" loading="lazy" decoding="async" width="52" height="52" onerror="this.closest('.cart-item')?.classList.add('cart-item--no-image');this.closest('.cart-item-thumb')?.remove();">
          </div>`
        : '';
      return `
        <article class="cart-item${imageSrc ? '' : ' cart-item--no-image'}" data-id="${escapeAttr(row.id)}">
          ${thumbHtml}
          <div class="cart-item-body">
            <div class="cart-item-main">
              <h3 class="cart-item-name">${escapeHtml(name)}</h3>
              <p class="cart-item-unit">${escapeHtml(formatPrice(price))}</p>
            </div>
            <div class="cart-item-controls">
              <button type="button" class="cart-qty-btn" data-action="dec" data-id="${escapeAttr(row.id)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
              <span class="cart-item-qty">${row.qty}</span>
              <button type="button" class="cart-qty-btn" data-action="inc" data-id="${escapeAttr(row.id)}" aria-label="${escapeAttr(t('increase'))}">+</button>
            </div>
          </div>
          <div class="cart-item-total">${escapeHtml(formatPrice(lineTotal))}</div>
        </article>
      `;
    }).join('');
  }

  function renderCardActionsHtml(itemId, qty) {
    if (browseOnly) return '';
    if (qty > 0) {
      return `<div class="food-qty-control">
        <button type="button" class="food-qty-btn" data-action="dec" data-id="${escapeAttr(itemId)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
        <span class="food-qty-value" aria-live="polite">${qty}</span>
        <button type="button" class="food-qty-btn" data-action="inc" data-id="${escapeAttr(itemId)}" aria-label="${escapeAttr(t('increase'))}">+</button>
      </div>`;
    }
    return `<button type="button" class="food-add-btn" data-action="add" data-id="${escapeAttr(itemId)}"><span>${escapeHtml(t('addToCart'))}</span></button>`;
  }

  /** Update only qty controls (1 / 2 / 3…) — same pattern as main menu. */
  function updateFoodCardActions(itemId) {
    const article = menuSections?.querySelector(`.food-card[data-item-id="${CSS.escape(String(itemId))}"]`);
    if (!article) return;
    const qty = cart.find((row) => row.id === itemId)?.qty || 0;
    article.classList.toggle('food-card--in-cart', qty > 0);
    const actions = article.querySelector('.food-card-actions');
    if (actions) actions.innerHTML = renderCardActionsHtml(itemId, qty);
  }

  function addToCart(id) {
    if (!isProductAvailable(id)) return;
    const item = findItem(id);
    if (!item) return;
    const existing = cart.find((row) => row.id === id);
    if (existing) existing.qty += 1;
    else {
      cart.push({
        id: item.id,
        name: item.name,
        nameEn: item.nameEn || '',
        price: Number(item.price) || 0,
        qty: 1,
        printName: item.printName || item.nameEn || item.name || item.id,
      });
    }
    saveCart();
    updateFoodCardActions(id);
    updateOpenFoodModal();
    renderCart();
  }

  function changeQty(id, delta) {
    const row = cart.find((r) => r.id === id);
    if (!row) {
      if (delta > 0) addToCart(id);
      return;
    }
    row.qty += delta;
    if (row.qty <= 0) cart = cart.filter((r) => r.id !== id);
    saveCart();
    updateFoodCardActions(id);
    updateOpenFoodModal();
    renderCart();
  }

  function clearCart() {
    const ids = cart.map((row) => row.id);
    cart = [];
    saveCart();
    ids.forEach((id) => updateFoodCardActions(id));
    if (!ids.length) renderMenu();
    updateOpenFoodModal();
    renderCart();
  }

  function openCart() {
    if (isOrderLocked() && getCartCount() === 0) {
      showOrderReceipt(getReceiptItems());
      return;
    }
    if (!cartPanel) return;
    cartPanel.hidden = false;
    cartPanel.setAttribute('aria-hidden', 'false');
    cartToggle?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('cart-open');
    setFocusTrap('cart', cartPanel);
    requestAnimationFrame(() => {
      cartPanel.classList.add('is-open');
      cartClose?.focus();
    });
  }

  function closeCart() {
    if (!cartPanel) return;
    clearFocusTrap('cart');
    cartPanel.classList.remove('is-open');
    cartToggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('cart-open');
    window.setTimeout(() => {
      cartPanel.hidden = true;
      cartPanel.setAttribute('aria-hidden', 'true');
    }, 220);
  }

  function showDetailsPage() {
    if (!entryGate || isOrderLocked()) return;
    closeCart();
    closeOrderReceipt();
    if (closedEl) closedEl.hidden = true;
    if (appEl) appEl.hidden = false;
    if (cartToggle) cartToggle.hidden = browseOnly;
    if (pickupError) {
      pickupError.hidden = true;
      pickupError.textContent = '';
    }
    if (customerDetails) {
      if (pickupName) {
        pickupName.value = customerDetails.customerNameRaw || customerDetails.customerName || '';
      }
      if (pickupPhone) pickupPhone.value = customerDetails.customerPhone || '';
      if (pickupNotes) pickupNotes.value = customerDetails.customerNotes || '';
    }
    const submitLabel = entryGate.querySelector('#shabbat-pickup-submit .entry-gate__btn-label');
    if (submitLabel) submitLabel.textContent = t('sendOrder');
    entryGate.hidden = false;
    entryGate.setAttribute('aria-hidden', 'false');
    document.body.classList.add('shabbat-details-pending');
    setFocusTrap('details', entryGate);
    pickupName?.focus();
  }

  function closeDetailsToMenu() {
    hideDetailsPage();
    if (appEl) appEl.hidden = false;
    if (cartToggle) cartToggle.hidden = browseOnly;
    if (!browseOnly && getCartCount() > 0) openCart();
  }

  function hideDetailsPage() {
    if (!entryGate) return;
    clearFocusTrap('details');
    entryGate.hidden = true;
    entryGate.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('shabbat-details-pending');
  }

  function showMenuUi() {
    hideDetailsPage();
    if (closedEl) closedEl.hidden = true;
    if (appEl) appEl.hidden = false;
    if (cartToggle) cartToggle.hidden = browseOnly;
    document.body.classList.toggle('shabbat-browse-only', browseOnly);
    if (!browseOnly) loadCart();
    else cart = [];
    applyI18n();
    renderMenu();
    if (!browseOnly) renderCart();
  }

  function enterBrowseOnly() {
    browseOnly = true;
    hideDetailsPage();
    showMenuUi();
  }

  function isValidPhone(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }

  /** Hebrew → Latin for kitchen (same rules as takeaway entry-gate). */
  function titleCaseLatin(value) {
    const s = String(value || '').toLowerCase();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function transliterateHebrewWord(word) {
    const chars = [...String(word || '')];
    let out = '';
    let i = 0;

    while (i < chars.length) {
      const ch = chars[i];
      const next = chars[i + 1];

      if (ch === '\u05E9') { out += 'sh'; i += 1; continue; }
      if (ch === '\u05D7') { out += 'ch'; i += 1; continue; }
      if (ch === '\u05E6' || ch === '\u05E5') { out += 'tz'; i += 1; continue; }

      if (ch === '\u05D5') {
        if (next === '\u05D0' || next === '\u05E2') { out += 'ue'; i += 2; continue; }
        if (next === '\u05D9') { out += 'oi'; i += 2; continue; }
        out += i === 0 ? 'v' : 'o';
        i += 1;
        continue;
      }

      if (ch === '\u05D9') { out += i === 0 ? 'y' : 'i'; i += 1; continue; }
      if (ch === '\u05D0') { if (i === 0) out += 'a'; i += 1; continue; }
      if (ch === '\u05D4') { if (i !== chars.length - 1) out += 'h'; i += 1; continue; }
      if (ch === '\u05E2') { out += 'a'; i += 1; continue; }
      if (ch === '\u05E4' || ch === '\u05E3') {
        out += (ch === '\u05E3' || i === chars.length - 1) ? 'f' : 'p';
        i += 1;
        continue;
      }

      const simple = {
        '\u05D1': 'b', '\u05D2': 'g', '\u05D3': 'd', '\u05D6': 'z', '\u05D8': 't',
        '\u05DB': 'k', '\u05DA': 'k', '\u05DC': 'l', '\u05DE': 'm', '\u05DD': 'm',
        '\u05E0': 'n', '\u05DF': 'n', '\u05E1': 's', '\u05E7': 'k', '\u05E8': 'r',
        '\u05EA': 't',
      };
      if (simple[ch]) { out += simple[ch]; i += 1; continue; }
      if (/[A-Za-z0-9]/.test(ch)) out += ch;
      i += 1;
    }

    return out.replace(/(.)\1+/g, '$1$1');
  }

  function transliterateToEnglish(raw) {
    const text = String(raw || '').normalize('NFKC').trim();
    if (!text) return '';
    if (!/[\u0590-\u05FF]/.test(text)) {
      return text.replace(/\s+/g, ' ').trim();
    }
    return text
      .split(/\s+/)
      .map((word) => titleCaseLatin(transliterateHebrewWord(word)))
      .filter(Boolean)
      .join(' ');
  }

  async function submitShabbatOrder(details) {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.createSession !== 'function') {
      throw new Error('Supabase not configured');
    }
    if (!cart.length) throw new Error('empty cart');

    const waveItems = cart.map((row) => ({
      productId: row.id,
      name: itemName(findItem(row.id) || row) || row.name || row.id,
      printName: row.printName || row.nameEn || row.name || row.id,
      price: Number(row.price) || 0,
      qty: Number(row.qty) || 1,
    }));

    let sessionId = readLock()?.sessionId || null;
    if (!sessionId) {
      const session = await api.createSession({
        orderType: 'shabbat',
        customerName: details.customerName,
        customerPhone: details.customerPhone,
        notes: details.customerNotes || null,
        language: lang,
        pickupType: 'TIME',
        pickupTime: pickupWindow(),
      });
      if (!session?.session_id) throw new Error('createSession failed');
      sessionId = session.session_id;
    }

    const total = getCartTotal();
    const order = await api.createOrder({
      sessionId,
      total,
      status: 'submitted',
      language: lang,
    });
    if (!order?.id) throw new Error('createOrder failed');

    await api.createOrderItems(order.id, cart.map((row) => ({
      productId: row.id,
      productName: row.name || row.id,
      printName: row.printName || row.nameEn || row.name || row.id,
      quantity: Number(row.qty) || 1,
      price: Number(row.price) || 0,
      category: 'shabbat',
      notes: null,
    })));

    return { sessionId, order, waveItems };
  }

  function validatePickupForm() {
    const nameRaw = String(pickupName?.value || '').trim();
    const phone = String(pickupPhone?.value || '').trim();
    const notes = String(pickupNotes?.value || '').trim();
    const nameEn = transliterateToEnglish(nameRaw);

    if (!nameRaw || !nameEn) {
      if (pickupError) {
        pickupError.hidden = false;
        pickupError.textContent = t('nameRequired');
      }
      pickupName?.focus();
      return null;
    }
    if (!phone) {
      if (pickupError) {
        pickupError.hidden = false;
        pickupError.textContent = t('phoneRequired');
      }
      pickupPhone?.focus();
      return null;
    }
    if (!isValidPhone(phone)) {
      if (pickupError) {
        pickupError.hidden = false;
        pickupError.textContent = t('phoneInvalid');
      }
      pickupPhone?.focus();
      return null;
    }
    return {
      customerName: nameEn,
      customerNameRaw: nameRaw,
      customerPhone: phone,
      customerNotes: notes,
    };
  }

  /** Checkout modal: save customer details, then send the order. */
  function handlePickupSubmit(event) {
    event?.preventDefault?.();
    const details = validatePickupForm();
    if (!details) return;
    saveCustomerDetails(details);
    markEnteredMenu();
    hideDetailsPage();
    void sendShabbatOrderFromCart();
  }

  async function sendShabbatOrderFromCart() {
    if (sending || !cart.length) return;
    if (!customerDetails?.customerName || !customerDetails?.customerPhone) {
      showDetailsPage();
      return;
    }

    sending = true;
    if (btnContinue) {
      btnContinue.disabled = true;
      btnContinue.textContent = t('sendingOrder');
    }

    try {
      const result = await submitShabbatOrder(customerDetails);
      clearCart();
      closeCart();
      setLockSessionId(result.sessionId);
      lockAfterSend(result.waveItems);
      showOrderReceipt(getReceiptItems());
      initSessionClosedWatcher();
    } catch (err) {
      console.error('[shabbat] send failed', err);
      showFeedback(false, t('orderSentFail'));
    } finally {
      sending = false;
      if (btnContinue) btnContinue.textContent = t('continueOrder');
      renderCart();
    }
  }

  function markEnteredMenu() {
    try { sessionStorage.setItem(ENTERED_MENU_KEY, '1'); } catch (_) { /* ignore */ }
  }

  function hasEnteredMenu() {
    try { return sessionStorage.getItem(ENTERED_MENU_KEY) === '1'; } catch (_) { return false; }
  }

  function clearEnteredMenu() {
    try { sessionStorage.removeItem(ENTERED_MENU_KEY); } catch (_) { /* ignore */ }
  }

  function clearShabbatLocalState() {
    clearCart();
    clearLock();
    clearCustomerDetails();
    clearEnteredMenu();
    try {
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem(LOCK_KEY);
      sessionStorage.removeItem(DETAILS_KEY);
    } catch (_) { /* ignore */ }
  }

  async function bootOpenUi() {
    loadCustomerDetails();
    loadCart();
    applyI18n();
    if (closedEl) closedEl.hidden = true;

    const locked = await restoreLockIfNeeded();
    if (locked) {
      markEnteredMenu();
      showMenuUi();
      if (getCartCount() === 0) showOrderReceipt(getReceiptItems());
      return;
    }

    markEnteredMenu();
    showMenuUi();
  }

  function bootClosedUi() {
    browseOnly = false;
    hideDetailsPage();
    if (appEl) appEl.hidden = true;
    if (cartToggle) cartToggle.hidden = true;
    if (closedEl) closedEl.hidden = false;
    document.body.classList.remove('shabbat-browse-only');
    applyClosedCopy();
    applyI18n();
  }

  function onLangClick(event) {
    const next = event.target.closest('[data-lang]')?.dataset.lang;
    if (next !== 'he' && next !== 'en') return;
    lang = next;
    applyI18n();
    if (browseOnly || (appEl && !appEl.hidden)) {
      renderMenu();
      if (!browseOnly) renderCart();
    }
    if (orderReceipt && !orderReceipt.hidden) showOrderReceipt(getReceiptItems());
    const submitLabel = entryGate?.querySelector('#shabbat-pickup-submit .entry-gate__btn-label');
    if (submitLabel && entryGate && !entryGate.hidden) submitLabel.textContent = t('sendOrder');
    updateCartToggleMode();
  }

  async function init() {
    await refreshAdminShabbatOrdersFlag();
    window.LechaimAppSettings?.onChange?.(applyI18n);

    if (!adminShabbatOrdersEnabled) {
      bootClosedUi();
    } else {
      await bootOpenUi();
    }

    initInventory();

    const api = window.LechaimSupabaseOrders;
    if (api?.subscribeRestaurantFlags) {
      api.subscribeRestaurantFlags((evt) => {
        if (evt?.flagKey !== 'shabbat_orders_enabled') return;
        const next = Boolean(evt.flagValue);
        if (next === adminShabbatOrdersEnabled) return;
        adminShabbatOrdersEnabled = next;
        if (!next) {
          bootClosedUi();
          return;
        }
        /* Re-open without full reload when admin turns ordering back on */
        window.location.reload();
      });
    }

    langToggle?.addEventListener('click', onLangClick);
    entryLangToggle?.addEventListener('click', onLangClick);

    browseBtn?.addEventListener('click', enterBrowseOnly);

    cartToggle?.addEventListener('click', openCart);
    cartClose?.addEventListener('click', closeCart);
    cartBackdrop?.addEventListener('click', closeCart);
    btnClear?.addEventListener('click', clearCart);
    btnContinue?.addEventListener('click', () => {
      if (browseOnly || !cart.length) return;
      sendShabbatOrderFromCart();
    });

    receiptBackdrop?.addEventListener('click', closeOrderReceipt);
    receiptClose?.addEventListener('click', closeOrderReceipt);
    receiptContinue?.addEventListener('click', () => {
      closeOrderReceipt();
    });

    menuSections?.addEventListener('click', (event) => {
      if (event.target.closest('[data-stop-modal]')) {
        event.stopPropagation();
      }
      const btn = event.target.closest('[data-action][data-id]');
      if (btn) {
        event.stopPropagation();
        if (browseOnly) return;
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'add' || action === 'inc') changeQty(id, 1);
        if (action === 'dec') changeQty(id, -1);
        return;
      }
      const card = event.target.closest('.food-card[data-item-id]');
      if (!card) return;
      openFoodModalById(card.dataset.itemId);
    });

    menuSections?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('[data-action]')) return;
      const card = event.target.closest('.food-card[data-item-id]');
      if (!card || (event.target !== card && !event.target.closest('.food-card'))) return;
      event.preventDefault();
      openFoodModalById(card.dataset.itemId);
    });

    foodModalBody?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action][data-id]');
      if (!btn || browseOnly) return;
      event.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'add' || action === 'inc') changeQty(id, 1);
      if (action === 'dec') changeQty(id, -1);
    });

    foodModalClose?.addEventListener('click', closeFoodModal);
    foodModalBackdrop?.addEventListener('click', closeFoodModal);

    cartBody?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action][data-id]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'inc') changeQty(id, 1);
      if (btn.dataset.action === 'dec') changeQty(id, -1);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (entryGate && !entryGate.hidden) {
        closeDetailsToMenu();
        return;
      }
      if (foodModal && !foodModal.hidden) {
        closeFoodModal();
        return;
      }
      if (orderReceipt && !orderReceipt.hidden) {
        closeOrderReceipt();
        return;
      }
      if (cartPanel && !cartPanel.hidden) {
        closeCart();
      }
    });

    pickupForm?.addEventListener('submit', handlePickupSubmit);
    $('#shabbat-entry-back')?.addEventListener('click', (event) => {
      event.preventDefault();
      closeDetailsToMenu();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void init(); });
  } else {
    void init();
  }
})();
