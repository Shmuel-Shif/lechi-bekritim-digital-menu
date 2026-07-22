/**
 * לחיים בכריתים — Digital Menu
 */
(function () {
  'use strict';

  try {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  } catch (_) { /* ignore */ }

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const header = $('#site-header');
  const categoryNavWrapper = $('#category-nav-wrapper');
  const categoryNavList = $('#category-nav-list');
  const menuSections = $('#menu-sections');
  const categoryNavScroll = $('#category-nav-scroll');
  const foodModal = $('#food-modal');
  const foodModalBody = $('#food-modal-body');
  const foodModalClose = $('#food-modal-close');
  const foodModalBackdrop = $('#food-modal-backdrop');
  const sidesModal = $('#sides-modal');
  const sidesModalBody = $('#sides-modal-body');
  const sidesModalClose = $('#sides-modal-close');
  const sidesModalBackdrop = $('#sides-modal-backdrop');
  const cartToggle = $('#cart-toggle');
  const cartPanel = $('#cart-panel');
  const cartBody = $('#cart-body');
  const cartFooter = $('#cart-footer');
  const cartPendingTotalRow = $('#cart-pending-total-row');
  const cartTotalPrice = $('#cart-total-price');
  const cartSessionTotalPrice = $('#cart-session-total-price');
  const cartBadge = $('#cart-badge');
  const cartClose = $('#cart-close');
  const cartBackdrop = $('#cart-backdrop');
  const cartClear = $('#cart-clear');
  const cartSend = $('#cart-send');
  const cartRequestBill = $('#cart-request-bill');
  const cartToast = $('#cart-toast');
  const orderFeedback = $('#order-feedback');
  const appConfirm = $('#app-confirm');
  const appConfirmText = $('#app-confirm-text');
  const appConfirmYes = $('#app-confirm-yes');
  const appConfirmCancel = $('#app-confirm-cancel');
  const appConfirmBackdrop = $('#app-confirm-backdrop');
  let appConfirmKind = null;

  const CART_STORAGE_KEY = 'lechaim-keri-cart';

  let currentLang = 'he';
  let activeCategoryId = null;
  let categoryObserver = null;
  let categoryScrollHandler = null;
  let revealObserver = null;
  let heroSlideTimer = null;
  let lastFocusedElement = null;
  let cartLastFocusedElement = null;
  let cartToastTimer = null;
  let orderFeedbackTimer = null;
  let isSendingOrder = false;
  let openModalItemId = null;
  let openSidesMainLineId = null;
  let sidesModalLastFocused = null;

  let cartLines = [];
  let cartLineOrder = [];
  let lastMainLineId = null;

  /* Hero keeps brand atmosphere without dish photos (new menu has no images yet). */
  function headerFoto(filename) {
    return `assets/images/header%20foto/${filename}`;
  }

  function shuffleArray(items) {
    const list = items.slice();
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = list[i];
      list[i] = list[j];
      list[j] = temp;
    }
    return list;
  }

  const HERO_SLIDES = shuffleArray([
    headerFoto('1.webp'),
    headerFoto('chicken-salad.webp'),
    headerFoto('fries.webp'),
    headerFoto('fruit-plate.webp'),
    headerFoto('3.webp'),
    headerFoto('fruit-shake.webp'),
    headerFoto('hummus-egg.webp'),
    headerFoto('kebab.webp'),
    headerFoto('denis.webp'),
    headerFoto('4.webp'),
    headerFoto('mushrooms.webp'),
    headerFoto('salmon.webp'),
    headerFoto('2.webp'),
    headerFoto('schnitzel.webp'),
    headerFoto('salad-plate.webp'),
    headerFoto('puree.webp'),
    headerFoto('fanta.webp'),
    headerFoto('sprite.webp'),
  ]);

  /* ---------- i18n ---------- */
  function t(key) {
    const keys = key.split('.');
    function lookup(lang) {
      let value = TRANSLATIONS[lang];
      keys.forEach((k) => {
        value = value?.[k];
      });
      return value;
    }
    return lookup(currentLang) ?? lookup('en') ?? lookup('he') ?? key;
  }

  function tReplace(key, vars) {
    let text = t(key);
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v);
    });
    return text;
  }

  function getResolvedItem(item) {
    if (!item) return item;
    return window.LechaimInventory?.resolveItem?.(item) || item;
  }

  function getItemName(item) {
    const resolved = getResolvedItem(item);
    if (currentLang === 'en' && DISH_I18N.en[item.id]) {
      return DISH_I18N.en[item.id].name;
    }
    return resolved.name;
  }

  function getItemDesc(item) {
    const resolved = getResolvedItem(item);
    if (currentLang === 'en' && DISH_I18N.en[item.id]) {
      return DISH_I18N.en[item.id].desc;
    }
    return resolved.description || '';
  }

  function getItemPrice(item) {
    return getResolvedItem(item).price;
  }

  function getItemImage(item) {
    return getResolvedItem(item).image || '';
  }

  function getCategoryTitle(cat) {
    return cat.titleKey ? t(cat.titleKey) : cat.title;
  }

  function formatPrice(amount) {
    return `${t('currency')}${amount}`;
  }

  function formatEuroTotal(amount) {
    return `${t('currency')}${(Number(amount) || 0).toFixed(2)}`;
  }

  function getSessionOrderTotal() {
    const engine = window.LechaimOrderEngine;
    const order = engine?.getOrder?.();
    if (!order) return 0;
    if (typeof engine.getOrderTotal === 'function') {
      return Number(engine.getOrderTotal(order)) || 0;
    }
    return (order.items || []).reduce((sum, item) => {
      if (!item || !(Number(item.qty) > 0)) return sum;
      return sum + (Number(item.price) || 0) * (Number(item.qty) || 0);
    }, 0);
  }

  function formatDishPrice(amount) {
    if (amount === 0) return t('sidesIncluded');
    return formatPrice(amount);
  }

  function setDocumentLanguage() {
    const dir = currentLang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
    document.documentElement.dir = dir;
    document.documentElement.dataset.lang = currentLang;
    document.body.dir = dir;
    document.body.dataset.lang = currentLang;
    document.title = t('pageTitle');

    const metaDesc = $('meta[name="description"]');
    if (metaDesc) metaDesc.content = t('pageDescription');
  }

  function updateLangToggleUI() {
    document.querySelectorAll('.lang-toggle [data-lang]').forEach((opt) => {
      opt.classList.toggle('lang-toggle__option--active', opt.dataset.lang === currentLang);
    });
  }

  function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
  }

  function toggleLanguage(targetLang) {
    const nextLang = targetLang === 'he' || targetLang === 'en'
      ? targetLang
      : (currentLang === 'he' ? 'en' : 'he');

    if (nextLang === currentLang) return;

    closeFoodModal();
    closeSidesModal();
    currentLang = nextLang;
    setDocumentLanguage();
    updateLangToggleUI();
    applyStaticTranslations();
    updateTableHeader();
    rebuildNavigation();
    rebuildMenu(true);
    renderCart();
    updateOpenFoodModal();
    refreshSidesModal();
  }

  /* ---------- Menu lookup ---------- */
  function getCategoryItems(category) {
    const items = [...(category.items || [])];
    (category.subsections || []).forEach((sub) => items.push(...sub.items));
    return items;
  }

  function getHotSideItems() {
    return HOT_SIDE_ITEMS;
  }

  function findItem(itemId) {
    for (const category of MENU_DATA.categories) {
      const item = getCategoryItems(category).find((i) => i.id === itemId);
      if (item) return item;
    }
    return HOT_SIDE_ITEMS.find((item) => item.id === itemId) || null;
  }

  function getSideQtyForMain(mainLineId, sideItemId) {
    const line = cartLines.find(
      (l) => l.linkedToMainLineId === mainLineId && l.itemId === sideItemId
    );
    return line ? line.qty : 0;
  }

  function addSideToMainLine(mainLineId, sideItemId) {
    if (!isProductAvailable(sideItemId)) {
      showCartToast(t('outOfStock'));
      return false;
    }

    const otherSides = cartLines.filter(
      (l) => l.linkedToMainLineId === mainLineId && l.itemId !== sideItemId
    );
    otherSides.forEach((line) => {
      removeCartLine(line.lineId);
    });

    if (!canAddSideToMain(mainLineId)) {
      showCartToast(t('maxSidesPerMain'));
      return false;
    }

    const existing = cartLines.find(
      (l) => l.linkedToMainLineId === mainLineId && l.itemId === sideItemId
    );

    if (existing) {
      existing.qty += 1;
      moveCartLineToTop(existing.lineId);
    } else {
      const lineId = createCartLineId();
      cartLines.push({
        lineId,
        itemId: sideItemId,
        qty: 1,
        linkedToMainLineId: mainLineId,
      });
      moveCartLineToTop(lineId);
    }

    saveCart();
    renderCart();
    refreshSidesModal();
    return true;
  }

  function removeSideFromMainLine(mainLineId, sideItemId) {
    const line = cartLines.find(
      (l) => l.linkedToMainLineId === mainLineId && l.itemId === sideItemId
    );
    if (!line) return;

    if (line.qty <= 1) {
      removeCartLine(line.lineId);
      saveCart();
      renderCart();
    } else {
      line.qty -= 1;
      saveCart();
      renderCart();
    }

    refreshSidesModal();
  }

  function isMainCourse(itemId) {
    return MAIN_COURSE_IDS.has(itemId);
  }

  function isHotSide(itemId) {
    return HOT_SIDE_IDS.has(itemId);
  }

  function createCartLineId() {
    return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function findCartLine(lineId) {
    return cartLines.find((l) => l.lineId === lineId);
  }

  function getCartQtyForItem(itemId) {
    return cartLines
      .filter((l) => l.itemId === itemId)
      .reduce((sum, l) => sum + l.qty, 0);
  }

  function moveCartLineToTop(lineId) {
    cartLineOrder = cartLineOrder.filter((id) => id !== lineId);
    cartLineOrder.unshift(lineId);
  }

  function getSideLinesForMain(mainLineId) {
    return cartLines.filter((l) => l.linkedToMainLineId === mainLineId);
  }

  function countSidesForMain(mainLineId) {
    return getSideLinesForMain(mainLineId).reduce((sum, l) => sum + l.qty, 0);
  }

  function canAddSideToMain(mainLineId, addQty = 1) {
    if (!mainLineId) return false;
    return countSidesForMain(mainLineId) + addQty <= MAX_SIDES_PER_MAIN;
  }

  function findMainLineForNewSide() {
    if (lastMainLineId) {
      const last = findCartLine(lastMainLineId);
      if (last && isMainCourse(last.itemId) && canAddSideToMain(last.lineId)) {
        return last.lineId;
      }
    }

    for (const lineId of cartLineOrder) {
      const line = findCartLine(lineId);
      if (line && isMainCourse(line.itemId) && canAddSideToMain(line.lineId)) {
        return line.lineId;
      }
    }

    return null;
  }

  function hasMainCourseInCart() {
    return cartLines.some((line) => isMainCourse(line.itemId));
  }

  function rejectHotSideAdd() {
    if (!hasMainCourseInCart()) {
      showCartToast(t('chooseMainFirst'));
      return true;
    }

    const mainLineId = findMainLineForNewSide();
    if (!mainLineId) {
      showCartToast(t('maxSidesPerMain'));
      return true;
    }

    return false;
  }

  function findLineForQuantityChange(itemId) {
    if (isHotSide(itemId) && lastMainLineId) {
      for (let i = cartLineOrder.length - 1; i >= 0; i -= 1) {
        const line = findCartLine(cartLineOrder[i]);
        if (
          line
          && line.itemId === itemId
          && line.linkedToMainLineId === lastMainLineId
        ) {
          return line.lineId;
        }
      }
    }

    for (let i = cartLineOrder.length - 1; i >= 0; i -= 1) {
      const line = findCartLine(cartLineOrder[i]);
      if (line && line.itemId === itemId) {
        return line.lineId;
      }
    }

    return null;
  }

  function removeCartLine(lineId) {
    const line = findCartLine(lineId);
    if (!line) return;

    if (isMainCourse(line.itemId)) {
      getSideLinesForMain(lineId).forEach((sideLine) => {
        cartLines = cartLines.filter((l) => l.lineId !== sideLine.lineId);
        cartLineOrder = cartLineOrder.filter((id) => id !== sideLine.lineId);
      });
      if (lastMainLineId === lineId) lastMainLineId = null;
      if (openSidesMainLineId === lineId) closeSidesModal();
    }

    cartLines = cartLines.filter((l) => l.lineId !== lineId);
    cartLineOrder = cartLineOrder.filter((id) => id !== lineId);
  }

  function buildCartDisplayQueue() {
    const queue = [];
    const used = new Set();

    for (const lineId of cartLineOrder) {
      const line = findCartLine(lineId);
      if (!line || used.has(lineId) || line.linkedToMainLineId) continue;

      if (isMainCourse(line.itemId)) {
        const sides = cartLineOrder
          .map(findCartLine)
          .filter((l) => l && l.linkedToMainLineId === line.lineId);
        queue.push({ kind: 'main-group', main: line, sides });
        used.add(line.lineId);
        sides.forEach((s) => used.add(s.lineId));
      } else {
        queue.push({ kind: 'single', line });
        used.add(line.lineId);
      }
    }

    cartLines.forEach((line) => {
      if (!used.has(line.lineId)) {
        queue.push({ kind: 'single', line });
      }
    });

    return queue;
  }

  /* ---------- Init ---------- */
  let appStarted = false;

  function init() {
    setDocumentLanguage();
    updateLangToggleUI();
    applyStaticTranslations();
    $('#year').textContent = new Date().getFullYear();
    buildNavigation();
    buildMenu();
    initStickyHeader();
    initCategoryNav();
    initSmoothScroll();
    initGlobalKeyboard();
    initScrollReveal();
    initCategoryTracking();
    initHeroSlideshow();
    handleHeroAnimations();
    initFoodModal();
    initSidesModal();
    initCart();
    initLanguageToggle();
    initSocialLinks();
    initInventory();
    initTableHeader();
    updateTableHeader();
  }

  /**
   * Always land on the menu hero (ברוכים הבאים + צפייה בתפריט),
   * never mid-page from scroll restoration or #menu hash.
   */
  function scrollToHeroWelcome() {
    try {
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
    } catch (_) { /* ignore */ }

    try {
      if (location.hash) {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
      }
    } catch (_) { /* ignore */ }

    const goTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    goTop();
    requestAnimationFrame(goTop);
    window.setTimeout(goTop, 0);
  }

  /**
   * Called by entry-gate.js after order type / language / table selection.
   * Keeps menu, cart, and inventory logic unchanged.
   */
  function startApp(options = {}) {
    if (appStarted) return;
    appStarted = true;

    if (options.lang === 'he' || options.lang === 'en') {
      currentLang = options.lang;
    }

    window.LechaimOrderContext = {
      orderType: options.orderType || null,
      tableNumber: options.orderType === 'takeaway'
        ? null
        : (options.tableNumber != null ? Number(options.tableNumber) : null),
      lang: currentLang,
      sessionId: options.sessionId || null,
      openedAt: options.openedAt || null,
      status: options.status || null,
    };

    /* Do not create an empty open order on table entry — only after first send. */

    init();
    scrollToHeroWelcome();

    verifyRemoteSessionOrReset()
      .then((didReset) => {
        if (!didReset) initRemoteSessionClosedWatcher();
      })
      .catch((err) => {
        console.warn('[session-watch] startup check failed', err);
        initRemoteSessionClosedWatcher();
      });
  }

  function updateOrderContext(options = {}) {
    const prev = window.LechaimOrderContext || {};
    const orderType = options.orderType != null ? options.orderType : prev.orderType;
    const isTakeaway = orderType === 'takeaway';
    const nextTable = isTakeaway
      ? null
      : (options.tableNumber !== undefined
        ? (options.tableNumber != null ? Number(options.tableNumber) : null)
        : prev.tableNumber);

    const tableChanged = !isTakeaway &&
      options.tableNumber !== undefined &&
      Number(nextTable) !== Number(prev.tableNumber);
    const typeChanged = options.orderType != null && options.orderType !== prev.orderType;

    window.LechaimOrderContext = {
      orderType,
      tableNumber: nextTable,
      lang: options.lang || prev.lang || currentLang,
      sessionId: options.sessionId !== undefined ? options.sessionId : prev.sessionId,
      openedAt: options.openedAt !== undefined ? options.openedAt : prev.openedAt,
      status: options.status !== undefined ? options.status : prev.status,
    };

    if (tableChanged || typeChanged) {
      cartLines = [];
      cartLineOrder = [];
      lastMainLineId = null;
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ lines: [], order: [] }));
      } catch (err) {
        console.warn('[cart] failed to clear cart on table change', err);
      }
    }

    /* Do not create empty open orders when browsing / switching tables. */

    updateTableHeader();
    if (appStarted) renderCart();
    scrollToHeroWelcome();
  }

  function updateTableHeader() {
    const tableBtn = $('#table-toggle');
    const numEl = $('#table-number');
    const backBtn = $('#order-back-toggle');
    if (!tableBtn || !numEl) return;

    const ctx = window.LechaimOrderContext || {};
    const isDineIn = ctx.orderType === 'dine-in' && ctx.tableNumber != null;
    const isTakeaway = ctx.orderType === 'takeaway';
    const locked = hasActiveOrderItems();

    if (isDineIn) {
      tableBtn.hidden = false;
      numEl.textContent = String(ctx.tableNumber);
      tableBtn.disabled = locked;
      tableBtn.classList.toggle('is-locked', locked);
      tableBtn.setAttribute(
        'aria-label',
        locked
          ? t('tableChangeLocked')
          : `${t('changeTableAria')}: ${ctx.tableNumber}`
      );
      if (backBtn) backBtn.hidden = true;
      return;
    }

    tableBtn.hidden = true;
    tableBtn.disabled = false;
    tableBtn.classList.remove('is-locked');
    numEl.textContent = '—';

    if (backBtn) {
      backBtn.hidden = !isTakeaway;
      if (isTakeaway) {
        backBtn.setAttribute('aria-label', t('backToOrderTypeAria'));
      }
    }
  }

  function initTableHeader() {
    const tableBtn = $('#table-toggle');
    const backBtn = $('#order-back-toggle');

    if (tableBtn && tableBtn.dataset.bound !== '1') {
      tableBtn.dataset.bound = '1';
      tableBtn.addEventListener('click', () => {
        if (hasActiveOrderItems()) {
          showOrderFeedback('err', t('tableChangeLocked'));
          return;
        }
        if (typeof window.LechaimEntryGate?.reopenTablePicker === 'function') {
          window.LechaimEntryGate.reopenTablePicker();
        }
      });
    }

    if (backBtn && backBtn.dataset.bound !== '1') {
      backBtn.dataset.bound = '1';
      backBtn.addEventListener('click', () => {
        if (typeof window.LechaimEntryGate?.reopenOrderTypePicker === 'function') {
          window.LechaimEntryGate.reopenOrderTypePicker();
        }
      });
    }
  }

  window.LechaimMenu = {
    start: startApp,
    updateOrderContext,
    notifyTableLocked() {
      showOrderFeedback('err', t('tableChangeLocked'));
    },
    returnToEntry: returnCustomerToEntryGate,
  };

  function isProductAvailable(itemId) {
    if (!window.LechaimInventory) return true;
    return LechaimInventory.isAvailable(itemId);
  }

  function syncStockBadge(article, item) {
    if (!article || !item) return;

    const available = isProductAvailable(item.id);
    article.classList.toggle('food-card--unavailable', !available);

    const wrap = article.querySelector('.food-image-wrap');
    if (!wrap) return;

    let badge = wrap.querySelector('.food-stock-badge');
    if (!available) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'food-stock-badge food-stock-badge--image';
        wrap.appendChild(badge);
      }
      badge.textContent = t('outOfStock');
    } else if (badge) {
      badge.remove();
    }
  }

  function initInventory() {
    if (!window.LechaimInventory) return;

    const applyChange = (payload) => {
      const productId = typeof payload === 'string' ? payload : payload?.productId;
      const change = typeof payload === 'object' && payload?.change ? payload.change : 'availability';

      if (productId) {
        refreshFoodCardById(productId, { full: change === 'content' });
        if (openModalItemId === productId) {
          if (change === 'content') openFoodModalById(productId);
          else updateOpenFoodModal();
        }
        if (isHotSide(productId)) refreshSidesModal();
        return;
      }

      refreshAllFoodCardsFull();
      updateOpenFoodModal();
      refreshSidesModal();
    };

    LechaimInventory.load()
      .then(() => {
        refreshAllFoodCardsFull();
        updateOpenFoodModal();
        refreshSidesModal();
      })
      .catch(() => {
        /* Menu stays fully available if inventory cannot load */
      });

    LechaimInventory.subscribe(applyChange);
  }

  function initSocialLinks() {
    const instagram = $('#footer-instagram');
    const facebook = $('#footer-facebook');
    if (instagram && SOCIAL_LINKS?.instagram) {
      instagram.href = SOCIAL_LINKS.instagram;
    }
    if (facebook && SOCIAL_LINKS?.facebook) {
      facebook.href = SOCIAL_LINKS.facebook;
    }
  }

  function initLanguageToggle() {
    document.querySelectorAll('.lang-toggle').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const lang = e.target.closest('[data-lang]')?.dataset.lang;
        toggleLanguage(lang);
      });
    });
  }

  /* ---------- Build nav links ---------- */
  function rebuildNavigation() {
    categoryNavList.replaceChildren();
    buildNavigation();
  }

  function buildNavigation() {
    const catFragment = document.createDocumentFragment();

    MENU_DATA.categories.forEach((cat) => {
      const title = getCategoryTitle(cat);
      const a = document.createElement('a');
      a.href = `#${cat.id}`;
      a.textContent = title;
      a.dataset.category = cat.id;
      a.className = 'category-link';

      const catLi = document.createElement('li');
      catLi.appendChild(a);
      catFragment.appendChild(catLi);
    });

    categoryNavList.appendChild(catFragment);
  }

  /* ---------- Build menu HTML ---------- */
  function markMenuContentVisible() {
    $$('#menu-sections .menu-category, #menu-sections .food-card').forEach((el) => {
      el.classList.add('is-visible');
    });
  }

  function rebuildMenu(showImmediately = false) {
    if (categoryObserver) {
      categoryObserver.disconnect();
      categoryObserver = null;
    }

    menuSections.replaceChildren();
    buildMenu();
    initCategoryTracking();

    if (showImmediately) {
      markMenuContentVisible();
      return;
    }

    $$('#menu-sections .menu-category.reveal:not(.is-visible)').forEach((el) => {
      if (revealObserver) revealObserver.observe(el);
    });
    initScrollRevealForCards();
  }

  function buildMenu() {
    const fragment = document.createDocumentFragment();

    MENU_DATA.categories.forEach((cat) => {
      const section = document.createElement('section');
      section.className = 'menu-category reveal';
      section.id = cat.id;
      section.dataset.category = cat.id;

      const descParts = [];
      if (cat.descriptionKey) {
        descParts.push(`<p class="category-desc">${escapeHtml(t(cat.descriptionKey))}</p>`);
      } else if (cat.description) {
        descParts.push(`<p class="category-desc">${escapeHtml(cat.description)}</p>`);
      }
      if (cat.sidesTitleKey) {
        descParts.push(`<p class="category-sides-title">${escapeHtml(t(cat.sidesTitleKey))}</p>`);
        descParts.push(`<p class="category-sides-note">${escapeHtml(t('sidesIncludedNote'))}</p>`);
      }
      if (cat.sidesListKey) {
        descParts.push(`<p class="category-sides-list">${escapeHtml(t(cat.sidesListKey))}</p>`);
      }
      const descHtml = descParts.join('');

      section.innerHTML = `
        <header class="category-header">
          <h2 class="category-title">${escapeHtml(getCategoryTitle(cat))}</h2>
          ${descHtml}
        </header>
      `;

      appendItemsToList(section, cat.items);

      (cat.subsections || []).forEach((sub) => {
        const subBlock = document.createElement('div');
        subBlock.className = 'menu-subsection';
        subBlock.innerHTML = `
          <h3 class="subsection-title">${escapeHtml(sub.titleKey ? t(sub.titleKey) : sub.title)}</h3>
          ${sub.description ? `<p class="subsection-desc">${escapeHtml(sub.description)}</p>` : ''}
        `;
        appendItemsToList(subBlock, sub.items);
        section.appendChild(subBlock);
      });

      fragment.appendChild(section);
    });

    menuSections.appendChild(fragment);
  }

  function appendItemsToList(parent, items) {
    const list = document.createElement('ul');
    list.className = 'food-list';
    list.setAttribute('role', 'list');

    items.forEach((item) => {
      list.appendChild(createFoodCard(item));
    });

    parent.appendChild(list);
  }

  function renderCardActions(item) {
    const qty = getCartQtyForItem(item.id);
    const name = getItemName(item);
    const available = isProductAvailable(item.id);
    const price = getItemPrice(item);

    if (!available) {
      if (qty > 0) {
        return `
          <div class="food-qty-control" data-stop-modal="true">
            <button type="button" class="food-qty-btn" data-action="dec-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
            <span class="food-qty-value" aria-live="polite">${qty}</span>
            <button type="button" class="food-qty-btn" disabled aria-disabled="true" aria-label="${escapeAttr(t('increase'))}">+</button>
          </div>
        `;
      }

      return `<span class="food-stock-badge">${escapeHtml(t('outOfStock'))}</span>`;
    }

    if (qty > 0) {
      return `
        <div class="food-qty-control" data-stop-modal="true">
          <button type="button" class="food-qty-btn" data-action="dec-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
          <span class="food-qty-value" aria-live="polite">${qty}</span>
          <button type="button" class="food-qty-btn" data-action="inc-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('increase'))}">+</button>
        </div>
      `;
    }

    if (price == null) return '';

    return `
      <button type="button" class="food-add-btn" data-action="add-to-cart" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('addToCart'))}: ${escapeAttr(name)}">
        <span>${escapeHtml(t('addToCart'))}</span>
      </button>
    `;
  }

  function buildFoodCardMarkup(item) {
    const imageSrc = getItemImage(item);
    const hasImage = Boolean(imageSrc);
    const price = getItemPrice(item);
    const canAddToCart = price != null;
    const priceHtml = canAddToCart && price > 0
      ? `<span class="food-price">${formatDishPrice(price)}</span>`
      : '';

    const noteHtml = item.note
      ? `<span class="food-note">${escapeHtml(item.note)}</span>`
      : '';

    const imageHtml = hasImage
      ? `<div class="food-image-wrap">
           <img
             class="food-image"
             src="${escapeAttr(imageSrc)}"
             alt="${escapeAttr(getItemName(item))}"
             loading="lazy"
             decoding="async"
             width="160"
             height="160"
             onerror="this.closest('.food-card')?.classList.add('food-card--no-image');this.closest('.food-image-wrap')?.remove();"
           >
           ${isProductAvailable(item.id) ? '' : `<span class="food-stock-badge food-stock-badge--image">${escapeHtml(t('outOfStock'))}</span>`}
         </div>`
      : '';

    const desc = getItemDesc(item);
    const descHtml = desc
      ? `<p class="food-desc">${escapeHtml(desc)}</p>`
      : '';

    const qty = getCartQtyForItem(item.id);
    const cardClass = [
      'food-card',
      hasImage ? '' : 'food-card--no-image',
      qty > 0 ? 'food-card--in-cart' : '',
      isProductAvailable(item.id) ? '' : 'food-card--unavailable'
    ].filter(Boolean).join(' ');

    return {
      cardClass,
      itemId: item.id,
      innerHtml: `
        <div class="food-content">
          <div class="food-text">
            <div class="food-text-body">
              <h3 class="food-name">${escapeHtml(getItemName(item))}</h3>
              ${descHtml}
              <div class="food-meta">
                ${priceHtml}
                ${noteHtml}
              </div>
            </div>
            <div class="food-card-actions">
              ${renderCardActions(item)}
            </div>
          </div>
          ${imageHtml}
        </div>
      `
    };
  }

  function createFoodCard(item) {
    const li = document.createElement('li');
    li.className = 'food-item';
    const { cardClass, innerHtml, itemId } = buildFoodCardMarkup(item);

    li.innerHTML = `
      <article
        class="${cardClass}"
        data-item-id="${escapeAttr(itemId)}"
        tabindex="0"
        role="button"
        aria-haspopup="dialog"
        aria-label="${escapeAttr(tReplace('showDish', { name: getItemName(item) }))}"
      >
        ${innerHtml}
      </article>
    `;

    return li;
  }

  /* Update only cart actions / in-cart state — never rebuild images (avoids re-fetch & CLS). */
  function rebuildFoodCard(article, item) {
    if (!article || !item) return;
    const wasVisible = article.classList.contains('is-visible');
    const { cardClass, innerHtml } = buildFoodCardMarkup(item);
    article.className = cardClass;
    if (wasVisible) article.classList.add('is-visible');
    article.innerHTML = innerHtml;
    article.setAttribute(
      'aria-label',
      tReplace('showDish', { name: getItemName(item) })
    );
  }

  function refreshAllFoodCardsFull() {
    $$('.food-card[data-item-id]').forEach((article) => {
      const item = findItem(article.dataset.itemId);
      if (item) rebuildFoodCard(article, item);
    });
  }

  function updateFoodCardActions(article, item) {
    if (!article || !item) return;

    const qty = getCartQtyForItem(item.id);
    article.classList.toggle('food-card--in-cart', qty > 0);
    syncStockBadge(article, item);

    const actions = article.querySelector('.food-card-actions');
    if (actions) {
      actions.innerHTML = renderCardActions(item);
    }
  }

  function refreshFoodCardById(itemId, options = {}) {
    if (!itemId) return;
    const item = findItem(itemId);
    if (!item) return;

    $$(`.food-card[data-item-id="${CSS.escape(itemId)}"]`).forEach((article) => {
      if (options.full) rebuildFoodCard(article, item);
      else updateFoodCardActions(article, item);
    });
  }

  function refreshFoodCards(itemIds) {
    if (itemIds == null) {
      $$('.food-card[data-item-id]').forEach((article) => {
        const item = findItem(article.dataset.itemId);
        if (item) updateFoodCardActions(article, item);
      });
      return;
    }

    const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
    ids.forEach(refreshFoodCardById);
  }

  /* ---------- Food modal ---------- */
  function initFoodModal() {
    if (!foodModal || !foodModalBody) return;

    menuSections.addEventListener('click', (event) => {
      if (event.target.closest('[data-stop-modal]')) {
        event.stopPropagation();
      }

      const actionBtn = event.target.closest('[data-action]');
      if (actionBtn) {
        event.stopPropagation();
        handleCardAction(actionBtn);
        return;
      }

      const card = event.target.closest('.food-card');
      if (!card) return;
      openFoodModal(card);
    });

    menuSections.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('[data-action]')) return;

      const card = event.target.closest('.food-card');
      if (!card) return;

      event.preventDefault();
      openFoodModal(card);
    });

    foodModalBody.addEventListener('click', (event) => {
      const actionBtn = event.target.closest('[data-action]');
      if (actionBtn) {
        event.stopPropagation();
        handleCardAction(actionBtn);
      }
    });

    foodModalClose.addEventListener('click', closeFoodModal);
    foodModalBackdrop.addEventListener('click', closeFoodModal);
  }

  function handleCardAction(btn) {
    const action = btn.dataset.action;
    const itemId = btn.dataset.itemId;

    if (action === 'add-to-cart' && itemId) {
      addToCart(itemId);
      return;
    }

    if (action === 'inc-qty' && itemId) {
      changeItemQuantity(itemId, 1);
      return;
    }

    if (action === 'dec-qty' && itemId) {
      changeItemQuantity(itemId, -1);
    }
  }

  function renderModalActions(item) {
    const price = getItemPrice(item);
    if (price == null) return '';

    const qty = getCartQtyForItem(item.id);
    const available = isProductAvailable(item.id);

    if (!available) {
      if (qty > 0) {
        return `
          <div class="food-modal-actions" data-stop-modal="true">
            <div class="food-qty-control food-qty-control--modal">
              <button type="button" class="food-qty-btn" data-action="dec-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
              <span class="food-qty-value" aria-live="polite">${qty}</span>
              <button type="button" class="food-qty-btn" disabled aria-disabled="true" aria-label="${escapeAttr(t('increase'))}">+</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="food-modal-actions" data-stop-modal="true">
          <span class="food-stock-badge food-stock-badge--modal">${escapeHtml(t('outOfStock'))}</span>
        </div>
      `;
    }

    if (qty > 0) {
      return `
        <div class="food-modal-actions" data-stop-modal="true">
          <div class="food-qty-control food-qty-control--modal">
            <button type="button" class="food-qty-btn" data-action="dec-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
            <span class="food-qty-value" aria-live="polite">${qty}</span>
            <button type="button" class="food-qty-btn" data-action="inc-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('increase'))}">+</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="food-modal-actions" data-stop-modal="true">
        <button type="button" class="btn btn-primary food-modal-add" data-action="add-to-cart" data-item-id="${escapeAttr(item.id)}">
          ${escapeHtml(t('addToCart'))}
        </button>
      </div>
    `;
  }

  function openFoodModal(card) {
    openFoodModalById(card.dataset.itemId);
  }

  function openFoodModalById(itemId) {
    const item = findItem(itemId);
    if (!item) return;

    openModalItemId = itemId;

    const desc = getItemDesc(item);
    const unavailable = !isProductAvailable(item.id);
    const imageSrc = getItemImage(item);
    const price = getItemPrice(item);
    const imageHtml = imageSrc
      ? `<div class="food-modal-hero${unavailable ? ' food-modal-hero--unavailable' : ''}">
           <img
             class="food-modal-image"
             src="${escapeAttr(imageSrc)}"
             alt="${escapeAttr(getItemName(item))}"
             width="540"
             height="540"
             decoding="async"
             onerror="this.closest('.food-modal-hero')?.remove();"
           >
           ${unavailable ? `<span class="food-stock-badge food-stock-badge--image">${escapeHtml(t('outOfStock'))}</span>` : ''}
         </div>`
      : '';

    const priceHtml = price != null
      ? `<p class="food-modal-price">${formatDishPrice(price)}</p>`
      : '';

    foodModalBody.innerHTML = `
      <div class="food-modal-content" data-item-id="${escapeAttr(itemId)}">
        <article class="food-modal-card${unavailable ? ' food-modal-card--unavailable' : ''}">
          ${imageHtml}
          <div class="food-modal-info">
            <h2 id="food-modal-title" class="food-modal-title">${escapeHtml(getItemName(item))}</h2>
            ${desc ? `<p class="food-modal-desc">${escapeHtml(desc)}</p>` : ''}
            ${priceHtml}
          </div>
          ${renderModalActions(item)}
        </article>
      </div>
    `;
    lastFocusedElement = document.activeElement;

    foodModal.hidden = false;
    foodModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => {
      foodModal.classList.add('is-open');
      foodModalClose.focus();
    });
  }

  function updateOpenFoodModal() {
    if (!openModalItemId || !foodModal || foodModal.hidden) return;

    const item = findItem(openModalItemId);
    if (!item) return;

    const card = foodModalBody?.querySelector('.food-modal-card');
    if (!card) {
      openFoodModalById(openModalItemId);
      return;
    }

    const unavailable = !isProductAvailable(item.id);
    card.classList.toggle('food-modal-card--unavailable', unavailable);

    const hero = card.querySelector('.food-modal-hero');
    if (hero) {
      hero.classList.toggle('food-modal-hero--unavailable', unavailable);
      let badge = hero.querySelector('.food-stock-badge');
      if (unavailable) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'food-stock-badge food-stock-badge--image';
          hero.appendChild(badge);
        }
        badge.textContent = t('outOfStock');
      } else if (badge) {
        badge.remove();
      }
    }

    const nextActions = renderModalActions(item);
    const existingActions = card.querySelector('.food-modal-actions');
    if (existingActions) {
      existingActions.outerHTML = nextActions;
    } else if (nextActions) {
      card.insertAdjacentHTML('beforeend', nextActions);
    }
  }

  function closeFoodModal() {
    if (foodModal.hidden) return;

    openModalItemId = null;
    foodModal.classList.remove('is-open');
    foodModal.setAttribute('aria-hidden', 'true');
    if (!openSidesMainLineId) {
      document.body.classList.remove('modal-open');
    }

    window.setTimeout(() => {
      if (foodModal.classList.contains('is-open')) return;

      foodModal.hidden = true;
      foodModalBody.replaceChildren();
      if (!openSidesMainLineId) {
        lastFocusedElement?.focus?.();
        lastFocusedElement = null;
      }
    }, 280);
  }

  function renderSidesModal() {
    if (!sidesModalBody || !openSidesMainLineId) return;

    const mainLine = findCartLine(openSidesMainLineId);
    if (!mainLine) {
      closeSidesModal();
      return;
    }

    const mainItem = findItem(mainLine.itemId);
    if (!mainItem) {
      closeSidesModal();
      return;
    }

    const selectedCount = countSidesForMain(openSidesMainLineId);
    const cellsHtml = getHotSideItems().map((side) => {
      const qty = getSideQtyForMain(openSidesMainLineId, side.id);
      const selected = qty > 0;
      const available = isProductAvailable(side.id);
      const hasImage = Boolean(getItemImage(side));
      const imageHtml = hasImage
        ? `<span class="sides-picker-thumb">
             <img
               class="sides-picker-image"
               src="${escapeAttr(getItemImage(side))}"
               alt=""
               loading="lazy"
               decoding="async"
               width="72"
               height="72"
               onerror="this.closest('.sides-picker-cell')?.classList.add('sides-picker-cell--no-image');this.closest('.sides-picker-thumb')?.remove();"
             >
           </span>`
        : '';

      return `
        <button
          type="button"
          class="sides-picker-cell${selected ? ' is-selected' : ''}${hasImage ? '' : ' sides-picker-cell--no-image'}${available ? '' : ' is-unavailable'}"
          data-action="toggle-side"
          data-item-id="${escapeAttr(side.id)}"
          aria-pressed="${selected ? 'true' : 'false'}"
          ${!available && !selected ? 'disabled' : ''}
        >
          ${imageHtml}
          <span class="sides-picker-name">${escapeHtml(getItemName(side))}</span>
          <span class="sides-picker-check" aria-hidden="true">${selected ? '✓' : ''}</span>
          ${available ? '' : `<span class="food-stock-badge food-stock-badge--side">${escapeHtml(t('outOfStock'))}</span>`}
        </button>
      `;
    }).join('');

    sidesModalBody.innerHTML = `
      <div class="sides-modal-content">
        <header class="sides-modal-header">
          <h2 id="sides-modal-title" class="sides-modal-title">${escapeHtml(t('chooseSidesTitle'))}</h2>
          <p class="sides-modal-subtitle">${escapeHtml(tReplace('chooseSidesSubtitle', { name: getItemName(mainItem) }))}</p>
          <p class="sides-modal-count" aria-live="polite">${escapeHtml(tReplace('sidesSelected', { count: String(selectedCount) }))}</p>
        </header>
        <div class="sides-picker-table" role="group" aria-label="${escapeAttr(t('chooseSidesTitle'))}">
          ${cellsHtml}
        </div>
        <footer class="sides-modal-footer">
          <button type="button" class="btn btn-primary sides-modal-continue" data-action="sides-continue">
            ${escapeHtml(t('sidesContinue'))}
          </button>
        </footer>
      </div>
    `;
  }

  function refreshSidesModal() {
    if (!openSidesMainLineId || sidesModal.hidden) return;
    renderSidesModal();
  }

  function openSidesModal(mainLineId) {
    if (!sidesModal || !sidesModalBody) return;

    openSidesMainLineId = mainLineId;
    lastMainLineId = mainLineId;
    sidesModalLastFocused = document.activeElement;

    closeFoodModal();
    renderSidesModal();

    sidesModal.hidden = false;
    sidesModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => {
      sidesModal.classList.add('is-open');
      sidesModalClose?.focus();
    });
  }

  function closeSidesModal() {
    if (!sidesModal || sidesModal.hidden) return;

    openSidesMainLineId = null;
    sidesModal.classList.remove('is-open');
    sidesModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    window.setTimeout(() => {
      if (sidesModal.classList.contains('is-open')) return;

      sidesModal.hidden = true;
      sidesModalBody.replaceChildren();
      sidesModalLastFocused?.focus?.();
      sidesModalLastFocused = null;
    }, 280);
  }

  function initSidesModal() {
    if (!sidesModal || !sidesModalBody) return;

    sidesModalBody.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      if (action === 'toggle-side' && btn.dataset.itemId) {
        const sideItemId = btn.dataset.itemId;
        const qty = getSideQtyForMain(openSidesMainLineId, sideItemId);
        if (qty > 0) {
          removeSideFromMainLine(openSidesMainLineId, sideItemId);
        } else {
          addSideToMainLine(openSidesMainLineId, sideItemId);
        }
        return;
      }

      if (action === 'sides-continue') {
        closeSidesModal();
      }
    });

    sidesModalClose?.addEventListener('click', closeSidesModal);
    sidesModalBackdrop?.addEventListener('click', closeSidesModal);
  }

  /* ---------- Sticky header ---------- */
  function initStickyHeader() {
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          header.classList.toggle('is-scrolled', window.scrollY > 20);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initCategoryNav() {
    const heroHeight = () => $('#hero').offsetHeight;
    const headerHeight = () => header.offsetHeight;

    const updateNavPosition = () => {
      const threshold = heroHeight() - headerHeight();
      categoryNavWrapper.classList.toggle('is-visible', window.scrollY >= threshold);
    };

    window.addEventListener('scroll', () => {
      requestAnimationFrame(updateNavPosition);
    }, { passive: true });

    updateNavPosition();
  }

  function scrollCategoryLinkIntoView(link) {
    if (!link || !categoryNavScroll) return;
    const scrollEl = categoryNavScroll;
    const linkRect = link.getBoundingClientRect();
    const scrollRect = scrollEl.getBoundingClientRect();
    const offset = linkRect.left - scrollRect.left - scrollRect.width / 2 + linkRect.width / 2;
    scrollEl.scrollBy({ left: offset, behavior: 'smooth' });
  }

  function initSmoothScroll() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;

      const id = link.getAttribute('href').slice(1);
      if (!id) return;

      const target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();
      scrollToSection(id);

      if (link.classList.contains('category-link')) {
        setActiveCategory(id);
        scrollCategoryLinkIntoView(link);
      }
    });
  }

  function scrollToSection(id) {
    const target = document.getElementById(id);
    if (!target) return;

    const offset = getScrollOffset();
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  function getScrollOffset() {
    const headerH = header.offsetHeight;
    const catNavH = categoryNavWrapper.classList.contains('is-visible')
      ? categoryNavWrapper.offsetHeight
      : 0;
    return headerH + catNavH + 12;
  }

  function initCategoryTracking() {
    const sections = $$('.menu-category');
    if (!sections.length) return;

    if (categoryObserver) {
      categoryObserver.disconnect();
      categoryObserver = null;
    }

    if (categoryScrollHandler) {
      window.removeEventListener('scroll', categoryScrollHandler);
      categoryScrollHandler = null;
    }

    let ticking = false;

    const updateActiveOnScroll = () => {
      const offset = getScrollOffset();
      let activeId = sections[0].id;

      sections.forEach((section) => {
        const top = section.getBoundingClientRect().top;
        if (top <= offset + 12) {
          activeId = section.id;
        }
      });

      setActiveCategory(activeId);
      ticking = false;
    };

    categoryScrollHandler = () => {
      if (!ticking) {
        requestAnimationFrame(updateActiveOnScroll);
        ticking = true;
      }
    };

    window.addEventListener('scroll', categoryScrollHandler, { passive: true });
    updateActiveOnScroll();

    window.addEventListener('resize', debounce(updateActiveOnScroll, 200));
  }

  function setActiveCategory(id) {
    if (activeCategoryId === id) return;
    activeCategoryId = id;

    $$('.category-link, .nav-link').forEach((link) => {
      const isActive = link.dataset.category === id;
      link.classList.toggle('is-active', isActive);
      if (isActive && link.classList.contains('category-link')) {
        scrollCategoryLinkIntoView(link);
      }
    });
  }

  function initScrollReveal() {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );

    $$('.reveal, .food-card').forEach((el) => revealObserver.observe(el));
  }

  function initScrollRevealForCards() {
    if (!revealObserver) return;
    $$('.food-card:not(.is-visible)').forEach((el) => revealObserver.observe(el));
  }

  function initHeroSlideshow() {
    const container = $('#hero-slides');
    if (!container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SLIDE_MS = 5000;
    const FADE_MS = 1600;
    const HERO_IMG_W = 1600;
    const HERO_IMG_H = 900;

    const slides = [];
    const preloadedHrefs = new Set();

    const loadSlideImage = (entry) => {
      if (!entry || entry.loaded) return;
      entry.img.src = entry.src;
      entry.loaded = true;
    };

    const preloadHref = (href, priority = 'low') => {
      if (preloadedHrefs.has(href)) return;
      preloadedHrefs.add(href);
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      link.setAttribute('fetchpriority', priority);
      document.head.appendChild(link);
    };

    const preloadSlide = (index, priority = 'low') => {
      const entry = slides[index];
      if (!entry || entry.prefetched) return;
      entry.prefetched = true;
      preloadHref(entry.src, priority);
    };

    HERO_SLIDES.forEach((src, index) => {
      const slide = document.createElement('div');
      slide.className = 'hero-slide';

      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.width = HERO_IMG_W;
      img.height = HERO_IMG_H;
      img.setAttribute('sizes', '100vw');

      const entry = { slide, img, src, loaded: false, prefetched: false };

      if (index === 0) {
        img.loading = 'eager';
        img.fetchPriority = 'high';
        entry.prefetched = true;
        preloadHref(src, 'high');
        loadSlideImage(entry);
      } else {
        /* Defer src until slide is about to show — avoids loading ~18 hero images upfront. */
        img.loading = 'lazy';
      }

      img.addEventListener('error', () => {
        const wasActive = slide.classList.contains('is-active');
        const removedIndex = slides.indexOf(entry);
        slide.remove();
        if (removedIndex >= 0) slides.splice(removedIndex, 1);

        if (wasActive && slides[0]) {
          loadSlideImage(slides[0]);
          slides[0].slide.classList.add('is-active');
        }
      });

      slide.appendChild(img);
      container.appendChild(slide);
      slides.push(entry);
    });

    if (slides[0]) {
      slides[0].slide.classList.add('is-active');
    }

    if (reducedMotion || slides.length < 2) return;

    /* Warm the next slide so the first transition is smooth */
    loadSlideImage(slides[1]);
    preloadSlide(1, 'low');

    let current = 0;
    let isTransitioning = false;

    const goNext = () => {
      if (slides.length < 2 || isTransitioning) return;

      isTransitioning = true;
      const outgoing = slides[current];
      current = (current + 1) % slides.length;
      const incoming = slides[current];
      const upcoming = slides[(current + 1) % slides.length];

      loadSlideImage(incoming);
      loadSlideImage(upcoming);

      /* Freeze outgoing zoom so scale doesn't snap mid-fade */
      const outgoingImg = outgoing?.img;
      if (outgoingImg) {
        const scale = getComputedStyle(outgoingImg).transform;
        outgoingImg.style.animation = 'none';
        outgoingImg.style.transform = scale === 'none' ? 'scale(1)' : scale;
      }

      outgoing?.slide.classList.remove('is-active');
      incoming?.slide.classList.add('is-active');

      window.setTimeout(() => {
        if (outgoingImg) {
          outgoingImg.style.animation = '';
          outgoingImg.style.transform = '';
        }
        isTransitioning = false;
      }, FADE_MS);
    };

    heroSlideTimer = window.setInterval(goNext, SLIDE_MS);
  }

  function handleHeroAnimations() {
    requestAnimationFrame(() => {
      $$('.hero .reveal').forEach((el) => {
        let delay = 0.76;

        if (el.classList.contains('hero-welcome')) delay = 0.12;
        else if (el.classList.contains('hero-title')) delay = 0.26;
        else if (el.classList.contains('hero-kosher')) delay = 0.4;
        else if (el.id === 'hero-cta') delay = 0.56;

        el.style.transitionDelay = `${delay}s`;
        el.classList.add('is-visible');
      });
    });
  }

  function initGlobalKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (appConfirm && !appConfirm.hidden) {
        closeAppConfirm();
        return;
      }
      if (sidesModal && !sidesModal.hidden) {
        closeSidesModal();
        return;
      }
      if (foodModal && !foodModal.hidden) {
        closeFoodModal();
        return;
      }
      if (cartPanel && !cartPanel.hidden) {
        closeCartPanel();
      }
    });
  }

  /* ---------- Cart ---------- */
  function initCart() {
    const loaded = loadCart();
    cartLines = loaded.lines || [];
    cartLineOrder = loaded.order || cartLines.map((l) => l.lineId);
    normalizeLoadedCart();
    renderCart();

    if (!cartToggle || !cartPanel) return;

    cartToggle.addEventListener('click', openCartPanel);
    cartClose.addEventListener('click', closeCartPanel);
    cartBackdrop.addEventListener('click', closeCartPanel);
    cartClear?.addEventListener('click', handleClearCart);
    cartSend?.addEventListener('click', () => {
      handleSendOrder();
    });
    cartRequestBill?.addEventListener('click', openBillConfirm);
    appConfirmYes?.addEventListener('click', () => {
      const kind = appConfirmKind;
      closeAppConfirm();
      if (kind === 'bill') handleRequestBill();
      if (kind === 'clear') confirmClearCart();
    });
    appConfirmCancel?.addEventListener('click', closeAppConfirm);
    appConfirmBackdrop?.addEventListener('click', closeAppConfirm);

    cartBody.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;

      const row = btn.closest('[data-cart-line-id]');
      if (!row) return;

      const lineId = row.dataset.cartLineId;

      if (btn.dataset.action === 'cart-inc') {
        changeQuantity(lineId, 1);
      } else if (btn.dataset.action === 'cart-dec') {
        changeQuantity(lineId, -1);
      }
    });
  }

  function hasActiveOrderItems() {
    const order = window.LechaimOrderEngine?.getOrder?.();
    return Boolean(order?.items?.some((item) => item && Number(item.qty) > 0));
  }

  function openAppConfirm(kind, message, yesLabel, cancelLabel) {
    if (!appConfirm) return;
    appConfirmKind = kind;
    if (appConfirmText) appConfirmText.textContent = message;
    if (appConfirmYes) appConfirmYes.textContent = yesLabel;
    if (appConfirmCancel) appConfirmCancel.textContent = cancelLabel;
    appConfirm.hidden = false;
    appConfirm.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-confirm-open');
  }

  function closeAppConfirm() {
    if (!appConfirm) return;
    appConfirmKind = null;
    appConfirm.hidden = true;
    appConfirm.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('app-confirm-open');
  }

  function openBillConfirm() {
    if (!hasActiveOrderItems()) {
      showOrderFeedback('err', t('requestBillNoOrder'));
      return;
    }
    openAppConfirm(
      'bill',
      t('requestBillConfirm'),
      t('requestBillYes'),
      t('requestBillCancel')
    );
  }

  /**
   * Customer Request Bill — marks table as bill_requested only.
   * Does NOT print. Waiter prints the bill from Admin ("חשבון").
   * Dual-writes bill_requested to Supabase when mapped session exists.
   */
  function handleRequestBill() {
    try {
      const session = ensureActiveOrderSession();
      if (!session) {
        showOrderFeedback('err', t('requestBillFail'));
        return;
      }

      const order = LechaimOrderEngine.ensureActiveOrder?.({
        orderType: window.LechaimOrderContext?.orderType,
        tableNumber: window.LechaimOrderContext?.tableNumber,
        sessionId: window.LechaimOrderContext?.sessionId || session.sessionId,
      });

      if (!order?.orderId || !hasActiveOrderItems()) {
        showOrderFeedback('err', t('requestBillNoOrder'));
        return;
      }

      const updated = LechaimOrderEngine.requestBill?.(order.orderId);
      if (!updated) {
        showOrderFeedback('err', t('requestBillFail'));
        return;
      }

      syncBillRequestedToSupabaseQuietly(session, order);
      showOrderFeedback('ok', t('requestBillSuccess'));
      renderCart();
    } catch (err) {
      console.error('[cart] request bill failed', err);
      showOrderFeedback('err', t('requestBillFail'));
    }
  }

  function handleClearCart() {
    if (!cartLines.length || isSendingOrder) return;
    openAppConfirm(
      'clear',
      t('clearCartConfirm'),
      t('clearCartYes'),
      t('clearCartCancel')
    );
  }

  function confirmClearCart() {
    if (!cartLines.length || isSendingOrder) return;
    cartLines = [];
    cartLineOrder = [];
    lastMainLineId = null;
    saveCart();
    renderCart();
    refreshFoodCards();
    updateOpenFoodModal();
  }

  function persistCartStorageOnly() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      lines: cartLines,
      order: cartLineOrder,
    }));
  }

  function clearCartAfterSuccessfulSend() {
    cartLines = [];
    cartLineOrder = [];
    lastMainLineId = null;
    /* Keep the open order in Order Engine (printed items) — do not sync empty cart. */
    persistCartStorageOnly();
    renderCart();
    refreshFoodCards();
    updateOpenFoodModal();
  }

  function setSendButtonState({ sending = false, empty = false } = {}) {
    if (!cartSend) return;
    if (sending) {
      cartSend.disabled = true;
      cartSend.textContent = t('sendingOrder');
      return;
    }
    cartSend.disabled = empty || isSendingOrder;
    cartSend.textContent = t('sendOrder');
  }

  function showOrderFeedback(kind, message) {
    if (!orderFeedback || !message) return;

    const icon = kind === 'ok' ? '✅' : '❌';
    orderFeedback.classList.remove('order-feedback--ok', 'order-feedback--err', 'is-visible');
    orderFeedback.classList.add(kind === 'ok' ? 'order-feedback--ok' : 'order-feedback--err');
    orderFeedback.innerHTML = `
      <span class="order-feedback__icon" aria-hidden="true">${icon}</span>
      <span class="order-feedback__text">${escapeHtml(message)}</span>
    `;
    orderFeedback.hidden = false;

    requestAnimationFrame(() => {
      orderFeedback.classList.add('is-visible');
    });

    window.clearTimeout(orderFeedbackTimer);
    orderFeedbackTimer = window.setTimeout(() => {
      orderFeedback.classList.remove('is-visible');
      window.setTimeout(() => {
        orderFeedback.hidden = true;
        orderFeedback.innerHTML = '';
      }, 280);
    }, 2500);
  }

  /**
   * Ensure an active session via LechaimOrderSession (no manual session object).
   */
  function ensureActiveOrderSession() {
    const Session = window.LechaimOrderSession;
    if (!Session) return null;

    let session = Session.getSession?.() || null;
    if (session) {
      applySessionToOrderContext(session);
      return session;
    }

    const ctx = window.LechaimOrderContext || {};
    const orderType = ctx.orderType === 'takeaway' || ctx.orderType === 'take-away'
      ? 'takeaway'
      : (ctx.orderType === 'dine-in' || ctx.orderType === 'dinein' || ctx.tableNumber != null
        ? 'dinein'
        : null);
    const lang = ctx.lang === 'en' || ctx.lang === 'he' ? ctx.lang : currentLang;

    if (orderType === 'takeaway') {
      session = Session.startTakeaway({ lang });
    } else if (orderType === 'dinein' && Session.isValidTable?.(ctx.tableNumber)) {
      session = Session.startDineIn(Number(ctx.tableNumber), { lang });
    } else {
      return null;
    }

    applySessionToOrderContext(session);
    return session;
  }

  function applySessionToOrderContext(session) {
    if (!session) return;
    const isTakeaway = session.orderType === 'takeaway' ||
      session.orderType === window.LechaimOrderSession?.ORDER_TYPE?.TAKEAWAY;

    updateOrderContext({
      orderType: isTakeaway ? 'takeaway' : 'dine-in',
      tableNumber: isTakeaway ? null : session.tableNumber,
      sessionId: session.sessionId,
      openedAt: session.openedAt,
      status: session.status,
      lang: session.lang || currentLang,
    });
  }

  async function handleSendOrder() {
    if (isSendingOrder) return;

    if (!cartLines.length) {
      showOrderFeedback('err', t('cartEmpty'));
      return;
    }

    if (!window.LechaimOrderEngine?.ensureActiveOrder || !window.LechaimPrintEngine?.printOrder) {
      console.error('[cart] Order/Print engine missing');
      showOrderFeedback('err', t('orderSentFail'));
      return;
    }

    isSendingOrder = true;
    setSendButtonState({ sending: true });
    if (cartClear) cartClear.disabled = true;

    try {
      const session = ensureActiveOrderSession();
      if (!session) {
        console.error('[cart] No active session and cannot create one');
        showOrderFeedback('err', t('orderSentFail'));
        return;
      }

      const order = LechaimOrderEngine.ensureActiveOrder({
        orderType: window.LechaimOrderContext?.orderType,
        tableNumber: window.LechaimOrderContext?.tableNumber,
        sessionId: window.LechaimOrderContext?.sessionId || session.sessionId,
      });

      if (!order?.orderId) {
        console.error('[cart] ensureActiveOrder failed');
        showOrderFeedback('err', t('orderSentFail'));
        return;
      }

      /* Append cart lines as separate order items, preserving main→side links. */
      if (typeof LechaimOrderEngine.addProductToOrder === 'function') {
        const cartLineToOrderItemId = new Map();
        const sortedLines = [...cartLines].sort((a, b) => {
          const aLinked = a.linkedToMainLineId ? 1 : 0;
          const bLinked = b.linkedToMainLineId ? 1 : 0;
          return aLinked - bLinked;
        });

        let currentOrder = order;
        for (const line of sortedLines) {
          const product = resolveCartProductForOrder(line.itemId, line);
          if (!product) continue;

          const linkedToMainItemId = line.linkedToMainLineId
            ? (cartLineToOrderItemId.get(line.linkedToMainLineId) || null)
            : null;

          const added = LechaimOrderEngine.addProductToOrder(
            currentOrder.orderId,
            {
              id: line.itemId,
              name: product.name,
              price: product.price,
            },
            Number(line.qty) || 1,
            product.notes || '',
            {
              allowMerge: false,
              linkedToMainItemId,
            }
          );

          if (!added) {
            console.error('[cart] addProductToOrder failed', line.itemId);
            showOrderFeedback('err', t('orderSentFail'));
            return;
          }

          if (added._lastAddedItemId) {
            cartLineToOrderItemId.set(line.lineId, added._lastAddedItemId);
          }
          currentOrder = added;
        }
      } else {
        LechaimOrderEngine.syncFromCart(cartLines, resolveCartProductForOrder);
      }

      const waveItems = typeof LechaimOrderEngine.getUnprintedItems === 'function'
        ? LechaimOrderEngine.getUnprintedItems().map((item) => ({ ...item }))
        : [];

      const printed = await LechaimPrintEngine.printOrder();
      if (printed !== true) {
        console.error('[cart] printOrder returned false');
        showOrderFeedback('err', t('orderSentFail'));
        return;
      }

      /* Stage 3 dual-write: local flow already succeeded; sync to Supabase in background. */
      syncOrderToSupabaseQuietly({
        localSession: session,
        localOrder: LechaimOrderEngine.getOrder?.() || order,
        waveItems,
      });

      clearCartAfterSuccessfulSend();
      showOrderFeedback('ok', t('orderSentSuccess'));
    } catch (err) {
      console.error('[cart] send order failed', err);
      showOrderFeedback('err', t('orderSentFail'));
    } finally {
      isSendingOrder = false;
      renderCart();
    }
  }

  const SUPABASE_SESSION_MAP_KEY = 'lechaim-supabase-session-map';

  function readSupabaseSessionMap() {
    try {
      const raw = localStorage.getItem(SUPABASE_SESSION_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeSupabaseSessionMap(map) {
    try {
      localStorage.setItem(SUPABASE_SESSION_MAP_KEY, JSON.stringify(map));
    } catch (err) {
      console.warn('[dual-write] failed to persist session map', err);
    }
  }

  function findProductCategoryId(productId) {
    const id = String(productId || '');
    if (!id) return null;
    const categories = window.MENU_DATA?.categories;
    if (Array.isArray(categories)) {
      for (let i = 0; i < categories.length; i += 1) {
        const cat = categories[i];
        const pools = [cat.items || []];
        (cat.subsections || []).forEach((sub) => pools.push(sub.items || []));
        for (let p = 0; p < pools.length; p += 1) {
          if (pools[p].some((entry) => entry && String(entry.id) === id)) {
            return cat.id || null;
          }
        }
      }
    }
    const hotSides = window.HOT_SIDE_ITEMS;
    if (Array.isArray(hotSides) && hotSides.some((entry) => entry && String(entry.id) === id)) {
      return 'hotSides';
    }
    return null;
  }

  async function resolveSupabaseSessionId(localSession, localOrder) {
    const api = window.LechaimSupabaseOrders;
    const localId = String(
      localSession?.sessionId ||
      localOrder?.sessionId ||
      window.LechaimOrderContext?.sessionId ||
      ''
    );
    if (!localId) {
      throw new Error('Missing local sessionId for dual-write');
    }

    const map = readSupabaseSessionMap();
    if (map[localId]) return map[localId];

    const ctx = window.LechaimOrderContext || {};
    const rawType = localOrder?.orderType || localSession?.orderType || ctx.orderType;
    const isTakeaway = String(rawType).toLowerCase().includes('take');
    const orderType = isTakeaway ? 'takeaway' : 'dine_in';
    const tableNumber = isTakeaway
      ? null
      : Number(localOrder?.tableNumber ?? localSession?.tableNumber ?? ctx.tableNumber);

    if (orderType === 'dine_in' && Number.isFinite(tableNumber)) {
      const open = await api.getOpenSessions();
      const existing = (open || []).find((row) => (
        row.order_type === 'dine_in' &&
        Number(row.table_number) === tableNumber
      ));
      if (existing?.session_id) {
        map[localId] = existing.session_id;
        writeSupabaseSessionMap(map);
        return existing.session_id;
      }
    }

    let created;
    try {
      created = await api.createSession({
        orderType,
        tableNumber: orderType === 'dine_in' ? tableNumber : null,
        language: currentLang,
      });
    } catch (err) {
      /* Race / unique open table: reuse existing open session */
      if (orderType === 'dine_in' && Number.isFinite(tableNumber)) {
        const open = await api.getOpenSessions();
        const existing = (open || []).find((row) => (
          row.order_type === 'dine_in' &&
          Number(row.table_number) === tableNumber
        ));
        if (existing?.session_id) {
          map[localId] = existing.session_id;
          writeSupabaseSessionMap(map);
          return existing.session_id;
        }
      }
      throw err;
    }

    if (!created?.session_id) {
      throw new Error('createSession returned no session_id');
    }

    map[localId] = created.session_id;
    writeSupabaseSessionMap(map);
    return created.session_id;
  }

  async function createSupabaseOrderItems(orderId, waveItems) {
    const api = window.LechaimSupabaseOrders;
    const resolvePrintName = window.LechaimPrintEngine?.resolvePrintName;
    const list = Array.isArray(waveItems) ? waveItems : [];
    if (!list.length) return [];

    const mains = list.filter((item) => !item.linkedToMainItemId);
    const sides = list.filter((item) => item.linkedToMainItemId);
    const localToRemote = new Map();

    function toPayload(item, parentRemoteId) {
      const printName = typeof resolvePrintName === 'function'
        ? resolvePrintName(item)
        : (item.printName || item.name || '');
      return {
        productId: item.productId,
        productName: item.name || '',
        printName,
        quantity: Number(item.qty) || 1,
        price: Number(item.price) || 0,
        category: findProductCategoryId(item.productId),
        notes: item.notes || null,
        sideDish: null,
        parentItemId: parentRemoteId || null,
      };
    }

    const mainRows = await api.createOrderItems(
      orderId,
      mains.map((item) => toPayload(item, null))
    );

    mains.forEach((item, index) => {
      if (mainRows[index]?.id && item.itemId) {
        localToRemote.set(String(item.itemId), mainRows[index].id);
      }
    });

    if (sides.length) {
      await api.createOrderItems(
        orderId,
        sides.map((item) => {
          const parentRemoteId = localToRemote.get(String(item.linkedToMainItemId)) || null;
          return toPayload(item, parentRemoteId);
        })
      );
    }

    return mainRows;
  }

  function lookupMappedSupabaseSessionId(localSessionId) {
    if (!localSessionId) return null;
    const map = readSupabaseSessionMap();
    return map[String(localSessionId)] || null;
  }

  async function findOpenSupabaseSessionIdForContext(localSession, localOrder) {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.()) return null;

    const localId = String(
      localSession?.sessionId ||
      localOrder?.sessionId ||
      window.LechaimOrderContext?.sessionId ||
      ''
    );
    const mapped = lookupMappedSupabaseSessionId(localId);
    if (mapped) return mapped;

    const ctx = window.LechaimOrderContext || {};
    const rawType = localOrder?.orderType || localSession?.orderType || ctx.orderType;
    const isTakeaway = String(rawType).toLowerCase().includes('take');
    if (isTakeaway) return null;

    const tableNumber = Number(
      localOrder?.tableNumber ?? localSession?.tableNumber ?? ctx.tableNumber
    );
    if (!Number.isFinite(tableNumber)) return null;

    const open = await api.getOpenSessions();
    const existing = (open || []).find((row) => (
      row.order_type === 'dine_in' &&
      Number(row.table_number) === tableNumber
    ));
    if (existing?.session_id && localId) {
      const map = readSupabaseSessionMap();
      map[localId] = existing.session_id;
      writeSupabaseSessionMap(map);
      return existing.session_id;
    }
    return null;
  }

  function syncBillRequestedToSupabaseQuietly(localSession, localOrder) {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.()) {
      console.warn('[dual-write] bill_requested skipped — Supabase not configured');
      return;
    }

    (async () => {
      try {
        const sessionId = await findOpenSupabaseSessionIdForContext(localSession, localOrder);
        if (!sessionId) {
          console.warn('[dual-write] bill_requested skipped — no Supabase session mapped');
          return;
        }
        await api.updateSessionStatus(sessionId, { status: 'bill_requested' });
        console.log('Bill requested synced to Supabase', { sessionId });
      } catch (err) {
        console.warn('[dual-write] bill_requested sync failed — local bill still OK', err);
      }
    })();
  }

  function clearLocalCustomerStateAfterRemoteClose() {
    const ctx = window.LechaimOrderContext || {};
    const localId = ctx.sessionId || window.LechaimOrderSession?.getSession?.()?.sessionId;
    const tableNumber = ctx.tableNumber != null
      ? Number(ctx.tableNumber)
      : window.LechaimOrderSession?.getTableNumber?.();

    try {
      if (localId) {
        const map = readSupabaseSessionMap();
        delete map[String(localId)];
        writeSupabaseSessionMap(map);
      }
    } catch (err) {
      console.warn('[session-watch] failed to clear session map', err);
    }

    try {
      window.LechaimOrderSession?.clearSession?.();
    } catch (err) {
      console.warn('[session-watch] clearSession failed', err);
    }

    try {
      cartLines = [];
      cartLineOrder = [];
      lastMainLineId = null;
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ lines: [], order: [] }));
    } catch (err) {
      console.warn('[session-watch] cart clear failed', err);
    }

    try {
      if (tableNumber != null && window.LechaimOrderEngine?.closeTable) {
        window.LechaimOrderEngine.closeTable(tableNumber);
      }
    } catch (err) {
      console.warn('[session-watch] local closeTable failed', err);
    }

    window.LechaimOrderContext = {
      orderType: null,
      tableNumber: null,
      sessionId: null,
      openedAt: null,
      status: null,
      lang: currentLang,
    };
  }

  let sessionWatchUnsub = null;

  function returnCustomerToEntryGate() {
    if (typeof sessionWatchUnsub === 'function') {
      try { sessionWatchUnsub(); } catch (_) { /* ignore */ }
      sessionWatchUnsub = null;
    }
    clearLocalCustomerStateAfterRemoteClose();
    if (typeof window.LechaimEntryGate?.resetToEntry === 'function') {
      window.LechaimEntryGate.resetToEntry();
      return;
    }
    window.location.reload();
  }

  async function isMappedSupabaseSessionClosed() {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.getSession !== 'function') return false;

    const localId = window.LechaimOrderContext?.sessionId ||
      window.LechaimOrderSession?.getSession?.()?.sessionId;
    const remoteId = lookupMappedSupabaseSessionId(localId);
    if (!remoteId) return false;

    try {
      const remote = await api.getSession(remoteId);
      return Boolean(remote && remote.status === 'closed');
    } catch (err) {
      console.warn('[session-watch] getSession failed', err);
      return false;
    }
  }

  async function verifyRemoteSessionOrReset() {
    if (await isMappedSupabaseSessionClosed()) {
      console.log('[session-watch] remote session closed — returning to entry');
      returnCustomerToEntryGate();
      return true;
    }
    return false;
  }

  function initRemoteSessionClosedWatcher() {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.subscribeToOrders !== 'function') return;

    const localId = window.LechaimOrderContext?.sessionId ||
      window.LechaimOrderSession?.getSession?.()?.sessionId;
    const remoteId = lookupMappedSupabaseSessionId(localId);
    if (!remoteId) return;

    if (typeof sessionWatchUnsub === 'function') {
      try { sessionWatchUnsub(); } catch (_) { /* ignore */ }
      sessionWatchUnsub = null;
    }

    try {
      sessionWatchUnsub = api.subscribeToOrders((payload) => {
        if (payload?.table !== 'order_sessions') return;
        const row = payload.new || payload.payload?.new;
        if (!row || String(row.session_id) !== String(remoteId)) return;
        if (row.status === 'closed') {
          console.log('[session-watch] Realtime closed — returning to entry');
          returnCustomerToEntryGate();
        }
      });
    } catch (err) {
      console.warn('[session-watch] subscribe failed', err);
    }
  }

  function syncOrderToSupabaseQuietly({ localSession, localOrder, waveItems }) {
    const api = window.LechaimSupabaseOrders;
    if (!api || typeof api.isConfigured !== 'function' || !api.isConfigured()) {
      console.warn('[dual-write] Supabase order service not configured — skip sync');
      return;
    }

    const items = Array.isArray(waveItems) ? waveItems : [];
    if (!items.length) {
      console.warn('[dual-write] no wave items to sync — skip');
      return;
    }

    (async () => {
      try {
        const sessionId = await resolveSupabaseSessionId(localSession, localOrder);
        const total = items.reduce((sum, item) => (
          sum + (Number(item.price) || 0) * (Number(item.qty) || 0)
        ), 0);

        const remoteOrder = await api.createOrder({
          sessionId,
          total,
          language: currentLang,
          status: 'submitted',
        });

        if (!remoteOrder?.id) {
          throw new Error('createOrder returned no id');
        }

        await createSupabaseOrderItems(remoteOrder.id, items);
        console.log('Order synced to Supabase', {
          sessionId,
          orderId: remoteOrder.id,
          orderNumber: remoteOrder.order_number,
          itemCount: items.length,
        });
        initRemoteSessionClosedWatcher();
      } catch (err) {
        console.warn('[dual-write] Supabase sync failed — local order still OK', err);
      }
    })();
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (Array.isArray(parsed)) {
        return { lines: parsed, order: parsed.map((l) => l.lineId) };
      }
      return {
        lines: Array.isArray(parsed.lines) ? parsed.lines : [],
        order: Array.isArray(parsed.order) ? parsed.order : [],
      };
    } catch {
      return { lines: [], order: [] };
    }
  }

  function resolveCartProductForOrder(productId, line) {
    const item = findItem(productId);
    if (!item) return null;
    const resolved = getResolvedItem(item);
    return {
      name: resolved?.name || item.name || '',
      price: resolved?.price != null ? resolved.price : (item.price != null ? item.price : 0),
      notes: line?.notes == null ? '' : String(line.notes),
    };
  }

  function syncActiveOrderFromCart() {
    if (!window.LechaimOrderEngine?.syncFromCart) return;
    try {
      LechaimOrderEngine.ensureActiveOrder?.({
        orderType: window.LechaimOrderContext?.orderType,
        tableNumber: window.LechaimOrderContext?.tableNumber,
        sessionId: window.LechaimOrderContext?.sessionId,
      });
      LechaimOrderEngine.syncFromCart(cartLines, resolveCartProductForOrder);
    } catch (err) {
      console.warn('[cart] order sync failed', err);
    }
  }

  function saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
      lines: cartLines,
      order: cartLineOrder,
    }));
    /* Stage 7: order is committed on "שלח הזמנה", not on every cart edit. */
  }

  function addToCart(itemId) {
    if (!isProductAvailable(itemId)) {
      showCartToast(t('outOfStock'));
      return;
    }

    let newMainLineId = null;

    if (isMainCourse(itemId)) {
      const lineId = createCartLineId();
      cartLines.push({ lineId, itemId, qty: 1, linkedToMainLineId: null });
      moveCartLineToTop(lineId);
      lastMainLineId = lineId;
      newMainLineId = lineId;
    } else if (isHotSide(itemId)) {
      if (rejectHotSideAdd()) return;

      const mainLineId = findMainLineForNewSide();
      const existing = cartLines.find(
        (l) => l.itemId === itemId && l.linkedToMainLineId === mainLineId
      );

      if (existing) {
        if (!canAddSideToMain(mainLineId)) {
          showCartToast(t('maxSidesPerMain'));
          return;
        }
        existing.qty += 1;
        moveCartLineToTop(existing.lineId);
      } else {
        const lineId = createCartLineId();
        cartLines.push({
          lineId,
          itemId,
          qty: 1,
          linkedToMainLineId: mainLineId,
        });
        moveCartLineToTop(lineId);
      }
    } else {
      const existing = cartLines.find(
        (l) => l.itemId === itemId && !l.linkedToMainLineId && !isMainCourse(l.itemId)
      );

      if (existing) {
        existing.qty += 1;
        moveCartLineToTop(existing.lineId);
      } else {
        const lineId = createCartLineId();
        cartLines.push({ lineId, itemId, qty: 1, linkedToMainLineId: null });
        moveCartLineToTop(lineId);
      }
    }

    saveCart();
    renderCart();
    if (!isHotSide(itemId)) {
      refreshFoodCards(itemId);
      updateOpenFoodModal();
    }

    if (newMainLineId) {
      openSidesModal(newMainLineId);
    }
  }

  function changeItemQuantity(itemId, delta) {
    if (delta > 0) {
      addToCart(itemId);
      return;
    }

    const lineId = findLineForQuantityChange(itemId);
    if (lineId) {
      changeQuantity(lineId, -1);
    }
  }

  function changeQuantity(lineId, delta) {
    const line = findCartLine(lineId);
    if (!line) return;

    const itemId = line.itemId;
    const newQty = line.qty + delta;
    if (newQty <= 0) {
      const wasHotSide = isHotSide(itemId) && line.linkedToMainLineId;
      const mainLineId = wasHotSide ? line.linkedToMainLineId : null;

      removeCartLine(lineId);
      saveCart();
      renderCart();
      if (!wasHotSide) {
        refreshFoodCards(itemId);
        updateOpenFoodModal();
      }

      if (wasHotSide && mainLineId && findCartLine(mainLineId)) {
        closeCartPanel();
        openSidesModal(mainLineId);
      }
      return;
    }

    if (delta > 0 && isHotSide(itemId) && line.linkedToMainLineId) {
      if (!canAddSideToMain(line.linkedToMainLineId)) {
        showCartToast(t('maxSidesPerMain'));
        return;
      }
      line.qty = newQty;
    } else {
      line.qty = newQty;
    }

    saveCart();
    renderCart();
    if (!isHotSide(itemId)) {
      refreshFoodCards(itemId);
      updateOpenFoodModal();
    }
  }

  function normalizeLoadedCart() {
    let changed = false;

    const validLines = cartLines.filter((line) => {
      if (findItem(line.itemId)) return true;
      changed = true;
      return false;
    });

    if (validLines.length !== cartLines.length) {
      cartLines = validLines;
      const validIds = new Set(cartLines.map((l) => l.lineId));
      cartLineOrder = cartLineOrder.filter((id) => validIds.has(id));
    }

    cartLines.forEach((line) => {
      if (isHotSide(line.itemId) && !line.linkedToMainLineId) {
        const mainLineId = findMainLineForNewSide();
        if (mainLineId) {
          line.linkedToMainLineId = mainLineId;
          changed = true;
        }
      }
    });

    if (changed) saveCart();
  }

  function getCartCount() {
    return cartLines
      .filter((line) => !isHotSide(line.itemId))
      .reduce((sum, line) => sum + line.qty, 0);
  }

  function getCartTotal() {
    return cartLines.reduce((sum, line) => {
      const item = findItem(line.itemId);
      if (!item) return sum;
      const price = getItemPrice(item);
      return sum + ((price || 0) * line.qty);
    }, 0);
  }

  function renderCartLineHtml(line, variant = 'single') {
    const item = findItem(line.itemId);
    if (!item) return '';

    const mainLine = line.linkedToMainLineId ? findCartLine(line.linkedToMainLineId) : null;
    const mainItem = mainLine ? findItem(mainLine.itemId) : null;

    let metaHtml = '';
    if (line.linkedToMainLineId && mainItem && variant !== 'child') {
      metaHtml = `<p class="cart-item-meta">${escapeHtml(tReplace('sideForMain', { name: getItemName(mainItem) }))}</p>`;
    } else if (isMainCourse(line.itemId)) {
      const sideNames = getSideLinesForMain(line.lineId)
        .map((s) => {
          const sideItem = findItem(s.itemId);
          return sideItem ? getItemName(sideItem) : '';
        })
        .filter(Boolean)
        .join(', ');
      if (sideNames) {
        metaHtml = `<p class="cart-item-meta">${escapeHtml(tReplace('servedWith', { sides: sideNames }))}</p>`;
      }
    }

    const mainClass = variant === 'main' ? ' cart-item--main' : '';
    const sideClass = variant === 'child' ? ' cart-item--side' : '';
    const imageSrc = getItemImage(item);
    const price = getItemPrice(item) || 0;
    const noImageClass = imageSrc ? '' : ' cart-item--no-image';
    const lineTotal = price * line.qty;
    const imageHtml = imageSrc
      ? `<div class="cart-item-thumb${variant === 'child' ? ' cart-item-thumb--side' : ''}">
           <img src="${escapeAttr(imageSrc)}" alt="" loading="lazy" decoding="async" width="52" height="52" onerror="this.closest('.cart-item')?.classList.add('cart-item--no-image');this.closest('.cart-item-thumb')?.remove();">
         </div>`
      : '';

    const unitHtml = variant === 'child'
      ? `<p class="cart-item-badge">${escapeHtml(t('sideLabel'))}</p>`
      : `<p class="cart-item-unit">${escapeHtml(tReplace('perUnit', { price: formatPrice(price) }))}</p>`;

    const controlsHtml = variant === 'child'
      ? ''
      : `<div class="cart-item-controls">
            <button type="button" class="cart-qty-btn" data-action="cart-dec" aria-label="${escapeAttr(t('decrease'))}">−</button>
            <span class="cart-item-qty">${line.qty}</span>
            <button type="button" class="cart-qty-btn" data-action="cart-inc" aria-label="${escapeAttr(t('increase'))}">+</button>
          </div>`;

    return `
      <article class="cart-item${mainClass}${sideClass}${noImageClass}" data-cart-line-id="${escapeAttr(line.lineId)}">
        ${imageHtml}
        <div class="cart-item-body">
          <div class="cart-item-main">
            <h3 class="cart-item-name">${escapeHtml(getItemName(item))}</h3>
            ${metaHtml}
            ${unitHtml}
          </div>
          ${controlsHtml}
        </div>
        <div class="cart-item-total">${price > 0 ? formatPrice(lineTotal) : ''}</div>
      </article>
    `;
  }

  function renderCart() {
    const count = getCartCount();
    const empty = count === 0;

    if (cartBadge) {
      cartBadge.textContent = String(count);
      cartBadge.setAttribute('data-count', String(count));
      cartBadge.hidden = empty;
    }

    if (cartFooter) cartFooter.hidden = false;
    if (cartPendingTotalRow) cartPendingTotalRow.hidden = empty;
    if (cartTotalPrice) cartTotalPrice.textContent = formatPrice(getCartTotal());
    if (cartSessionTotalPrice) {
      cartSessionTotalPrice.textContent = formatEuroTotal(getSessionOrderTotal());
    }

    /* Bill depends on sent order items — update even while send is in progress */
    if (cartRequestBill) {
      cartRequestBill.disabled = !hasActiveOrderItems();
      if (!isSendingOrder) {
        cartRequestBill.textContent = t('requestBill');
      }
    }

    if (!isSendingOrder) {
      setSendButtonState({ empty });
      if (cartClear) cartClear.disabled = empty;
    }

    updateTableHeader();

    if (!cartBody) return;

    const displayQueue = buildCartDisplayQueue();

    if (displayQueue.length === 0) {
      cartBody.innerHTML = `<p class="cart-empty">${escapeHtml(t('cartEmpty'))}</p>`;
      return;
    }

    cartBody.innerHTML = displayQueue.map((entry) => {
      if (entry.kind === 'main-group') {
        const mainHtml = renderCartLineHtml(entry.main, 'main');
        const sidesHtml = entry.sides.map((side) => renderCartLineHtml(side, 'child')).join('');
        return `
          <div class="cart-group">
            ${mainHtml}
            ${sidesHtml ? `<div class="cart-group-sides">${sidesHtml}</div>` : ''}
          </div>
        `;
      }
      return renderCartLineHtml(entry.line, 'single');
    }).join('');
  }

  function openCartPanel() {
    if (!cartPanel) return;

    cartLastFocusedElement = document.activeElement;
    cartPanel.hidden = false;
    cartPanel.setAttribute('aria-hidden', 'false');
    cartToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('cart-open');

    requestAnimationFrame(() => {
      cartPanel.classList.add('is-open');
      cartClose.focus();
    });
  }

  function closeCartPanel() {
    if (!cartPanel || cartPanel.hidden) return;

    cartPanel.classList.remove('is-open');
    cartPanel.setAttribute('aria-hidden', 'true');
    cartToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('cart-open');

    window.setTimeout(() => {
      if (cartPanel.classList.contains('is-open')) return;

      cartPanel.hidden = true;
      cartLastFocusedElement?.focus?.();
      cartLastFocusedElement = null;
    }, 280);
  }

  function showCartToast(message) {
    if (!cartToast || !message) return;

    cartToast.textContent = message;
    cartToast.hidden = false;
    cartToast.classList.add('is-visible');

    window.clearTimeout(cartToastTimer);
    cartToastTimer = window.setTimeout(() => {
      cartToast.classList.remove('is-visible');
      window.setTimeout(() => {
        cartToast.hidden = true;
      }, 280);
    }, 2200);
  }

  /* ---------- Utils ---------- */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;');
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      /* Entry gate owns startup when present; otherwise start menu immediately */
      if (!document.getElementById('entry-gate')) startApp();
    });
  } else if (!document.getElementById('entry-gate')) {
    startApp();
  }
})();
