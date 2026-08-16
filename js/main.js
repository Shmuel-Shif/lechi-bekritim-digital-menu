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
  const myOrderToggle = $('#my-order-toggle');
  const cartPanel = $('#cart-panel');
  const cartBody = $('#cart-body');
  const cartFooter = $('#cart-footer');
  const cartPendingTotalRow = $('#cart-pending-total-row');
  const cartTotalPrice = $('#cart-total-price');
  const cartDeliveryFeeRow = $('#cart-delivery-fee-row');
  const cartDeliveryFeeLabel = $('#cart-delivery-fee-label');
  const cartDeliveryFeePrice = $('#cart-delivery-fee-price');
  const cartSessionTotalPrice = $('#cart-session-total-price');
  const cartBadge = $('#cart-badge');
  const cartClose = $('#cart-close');
  const cartBackdrop = $('#cart-backdrop');
  const cartClear = $('#cart-clear');
  const cartSend = $('#cart-send');
  const cartRequestBill = $('#cart-request-bill');
  const cartToast = $('#cart-toast');
  const orderFeedback = $('#order-feedback');
  const orderReceipt = $('#order-receipt');
  const orderReceiptBackdrop = $('#order-receipt-backdrop');
  const orderReceiptTitle = $('#order-receipt-title');
  const orderReceiptEyebrow = $('#order-receipt-eyebrow');
  const orderReceiptOrderNo = $('#order-receipt-order-no');
  const orderReceiptRemember = $('#order-receipt-remember');
  const orderReceiptMeta = $('#order-receipt-meta');
  const orderReceiptBody = $('#order-receipt-body');
  const orderReceiptTotal = $('#order-receipt-total');
  const orderReceiptTotalLabel = $('#order-receipt-total-label');
  const orderReceiptContinue = $('#order-receipt-continue');
  const orderReceiptNew = $('#order-receipt-new');
  const orderReceiptClose = $('#order-receipt-close');
  const orderingHoursBanner = $('#ordering-hours-banner');
  const orderingHoursBannerText = $('#ordering-hours-banner-text');
  const appConfirm = $('#app-confirm');
  const appConfirmText = $('#app-confirm-text');
  const appConfirmYes = $('#app-confirm-yes');
  const appConfirmCancel = $('#app-confirm-cancel');
  const appConfirmBackdrop = $('#app-confirm-backdrop');
  const appConfirmCoupon = $('#app-confirm-coupon');
  const appConfirmCouponLabel = $('#app-confirm-coupon-label');
  const appConfirmCouponInput = $('#app-confirm-coupon-input');
  const appConfirmCouponApply = $('#app-confirm-coupon-apply');
  const appConfirmCouponStatus = $('#app-confirm-coupon-status');
  const appConfirmCouponTotals = $('#app-confirm-coupon-totals');
  let appConfirmKind = null;
  /** @type {null|{ code: string, discountPercent: number, discountAmount: number, subtotal: number, total: number }} */
  let pendingBillCoupon = null;

  const CART_STORAGE_KEY_FOOD = 'lechaim-keri-cart'; /* dine-in */
  const CART_STORAGE_KEY_PICKUP = 'lechaim-cart-pickup';
  const CART_STORAGE_KEY_DELIVERY = 'lechaim-cart-delivery';
  const CART_STORAGE_KEY_BUTCHER = 'lechaim-cart-butcher';
  const TAKEAWAY_LOCK_KEY_LEGACY = 'lechaim-takeaway-order-lock';
  const TAKEAWAY_LOCK_KEY_PICKUP = 'lechaim-takeaway-order-lock-pickup';
  const TAKEAWAY_LOCK_KEY_DELIVERY = 'lechaim-takeaway-order-lock-delivery';

  let currentLang = 'he';
  let activeCategoryId = null;
  let categoryObserver = null;
  let categoryScrollHandler = null;
  let revealObserver = null;
  let heroSlideTimer = null;
  let lastFocusedElement = null;
  let cartLastFocusedElement = null;
  const focusTrapReleases = {
    food: null,
    sides: null,
    cart: null,
    confirm: null,
    receipt: null,
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
  let cartToastTimer = null;
  let orderFeedbackTimer = null;
  let isSendingOrder = false;
  let openModalItemId = null;
  let openSidesMainLineId = null;
  let sidesModalLastFocused = null;

  let cartLines = [];
  let cartLineOrder = [];
  let lastMainLineId = null;
  let remoteSessionTotalOverride = null;
  let remoteTotalSyncTimer = null;
  let takeawayReceiptItems = null;

  /*
   * ---------------------------------------------------------------------------
   * Ordering hours — source: js/opening-hours.js (LechaimOpeningHours)
   * Sun–Thu OPEN..CLOSE exclusive; closed Fri–Sat. 21:59 open, 22:00 closed.
   * ---------------------------------------------------------------------------
   */
  const Hours = () => window.LechaimOpeningHours || null;
  const ORDERING_HOURS_ENABLED = true;
  const ORDERING_OPEN_HOUR = Hours()?.OPEN_HOUR ?? 14;
  const DINE_IN_CLOSE_HOUR = Hours()?.CLOSE_HOUR ?? 22;
  const TAKEAWAY_CLOSE_HOUR = Hours()?.CLOSE_HOUR ?? 22;

  function isWeekendClosed(date = new Date()) {
    if (typeof Hours()?.isWeekendClosed === 'function') {
      return Hours().isWeekendClosed(date);
    }
    const day = date.getDay();
    return day === 5 || day === 6;
  }

  function isWithinOrderingHours(date = new Date()) {
    if (typeof Hours()?.isWithinOrderingHours === 'function') {
      return Hours().isWithinOrderingHours(date);
    }
    if (isWeekendClosed(date)) return false;
    const hour = date.getHours();
    const closeHour = isTakeawayContext() ? TAKEAWAY_CLOSE_HOUR : DINE_IN_CLOSE_HOUR;
    return hour >= ORDERING_OPEN_HOUR && hour < closeHour;
  }

  /** Admin dine-in close countdown — global deadline; each guest sees remaining time. */
  let dineInCloseAtMs = null;
  let kitchenClosedModalShown = false;
  let kitchenCloseFocusTrapRelease = null;
  let kitchenCloseTickTimer = null;
  let kitchenClosePollTimer = null;
  let kitchenCloseModalMode = 'closed'; /* 'countdown' | 'closed' */
  /** Deadline for which we already showed the entry/realtime countdown modal (avoid poll spam). */
  let kitchenCountdownPromptedForMs = null;

  const kitchenCloseModal = $('#kitchen-close-modal');
  const kitchenCloseBackdrop = $('#kitchen-close-backdrop');
  const kitchenCloseOk = $('#kitchen-close-ok');
  const kitchenCloseText = $('#kitchen-close-text');

  function isDineInContext() {
    if (isTakeawayContext()) return false;
    const type = String(window.LechaimOrderContext?.orderType || '').toLowerCase();
    return type === 'dinein' || type === 'dine_in' || type === 'dine-in';
  }

  /** True only after the 30-minute countdown has ended. */
  function isManualDineInClosed() {
    if (!isDineInContext()) return false;
    if (!dineInCloseAtMs) return false;
    return Date.now() >= dineInCloseAtMs;
  }

  function isDineInCountdownActive() {
    if (!isDineInContext()) return false;
    if (!dineInCloseAtMs) return false;
    return Date.now() < dineInCloseAtMs;
  }

  function formatCountdownRemain(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function isOrderingAllowed() {
    if (window.LechaimOrderContext?.browseOnly) return false;
    /* Butcher shop: always open for ordering */
    if (isButcherContext()) return true;
    if (isManualDineInClosed()) return false;
    if (!ORDERING_HOURS_ENABLED) return true;
    return isWithinOrderingHours();
  }

  function refreshOrderingHoursUi() {
    const browseOnly = Boolean(window.LechaimOrderContext?.browseOnly);
    const allowed = isOrderingAllowed();
    document.body.classList.toggle('ordering-closed', !allowed);
    document.body.classList.toggle('browse-only', browseOnly);
    document.body.classList.toggle('takeaway-locked', isTakeawayOrderLocked());

    if (orderingHoursBanner) {
      const showKitchenClosed = isManualDineInClosed();
      const showCountdown = isDineInCountdownActive();
      orderingHoursBanner.hidden = browseOnly || (allowed && !showCountdown);
      if (orderingHoursBannerText) {
        if (showKitchenClosed) {
          orderingHoursBannerText.textContent = t('kitchenClosedBanner');
        } else if (showCountdown) {
          const remain = formatCountdownRemain(dineInCloseAtMs - Date.now());
          orderingHoursBannerText.textContent = tReplace('kitchenClosingCountdown', { time: remain });
        } else if (!allowed) {
          orderingHoursBannerText.textContent = t('orderingClosedBanner');
        }
      }
    }

    /* Keep open countdown modal text in sync with remaining time */
    if (
      kitchenCloseModal
      && !kitchenCloseModal.hidden
      && kitchenCloseModalMode === 'countdown'
      && isDineInCountdownActive()
      && kitchenCloseText
    ) {
      kitchenCloseText.textContent = tReplace('kitchenCountdownModal', {
        time: formatCountdownRemain(dineInCloseAtMs - Date.now()),
      });
    }

    if (cartToggle) {
      cartToggle.hidden = browseOnly;
      if (browseOnly) {
        cartToggle.setAttribute('aria-hidden', 'true');
        closeCartPanel();
      } else {
        cartToggle.removeAttribute('aria-hidden');
      }
    }
    if (browseOnly && myOrderToggle) {
      myOrderToggle.hidden = true;
    }

    updateTableHeader();

    updateCartToggleMode();

    if (!allowed) {
      setSendButtonState({ empty: true });
      if (cartClear) cartClear.disabled = true;
    }
  }

  function closeKitchenCloseModal() {
    if (!kitchenCloseModal) return;
    if (typeof kitchenCloseFocusTrapRelease === 'function') kitchenCloseFocusTrapRelease();
    kitchenCloseFocusTrapRelease = null;
    kitchenCloseModal.hidden = true;
    kitchenCloseModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('app-confirm-open');
  }

  function openKitchenModal(mode) {
    if (!kitchenCloseModal) return;
    if (!isDineInContext() || window.LechaimOrderContext?.browseOnly) return;

    kitchenCloseModalMode = mode === 'countdown' ? 'countdown' : 'closed';
    if (kitchenCloseModalMode === 'countdown') {
      if (!isDineInCountdownActive()) return;
      kitchenCloseText.textContent = tReplace('kitchenCountdownModal', {
        time: formatCountdownRemain(dineInCloseAtMs - Date.now()),
      });
    } else {
      if (kitchenCloseText) kitchenCloseText.textContent = t('kitchenClosedModal');
    }
    if (kitchenCloseOk) kitchenCloseOk.textContent = t('kitchenClosingOk');
    kitchenCloseModal.hidden = false;
    kitchenCloseModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-confirm-open');
    if (typeof kitchenCloseFocusTrapRelease === 'function') kitchenCloseFocusTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(kitchenCloseModal);
    kitchenCloseFocusTrapRelease = typeof release === 'function' ? release : null;
    kitchenCloseOk?.focus();
  }

  function showKitchenClosedModal() {
    openKitchenModal('closed');
  }

  function showKitchenCountdownModal() {
    openKitchenModal('countdown');
  }

  /**
   * Show kitchen modal for current state.
   * @param {{ force?: boolean, reason?: string }} [options]
   * force: show even if we already prompted for this deadline (menu entry / admin just started)
   */
  function maybeShowKitchenModalForDineInEntry(options = {}) {
    if (!isDineInContext() || window.LechaimOrderContext?.browseOnly) return;
    if (!dineInCloseAtMs) return;

    if (Date.now() >= dineInCloseAtMs) {
      if (!kitchenClosedModalShown || options.force) {
        kitchenClosedModalShown = true;
        kitchenCountdownPromptedForMs = dineInCloseAtMs;
        showKitchenClosedModal();
      }
      return;
    }

    if (!options.force && kitchenCountdownPromptedForMs === dineInCloseAtMs) return;
    kitchenCountdownPromptedForMs = dineInCloseAtMs;
    showKitchenCountdownModal();
  }

  function stopKitchenCloseTicker() {
    if (kitchenCloseTickTimer) {
      window.clearInterval(kitchenCloseTickTimer);
      kitchenCloseTickTimer = null;
    }
  }

  function startKitchenCloseTicker() {
    stopKitchenCloseTicker();
    if (!dineInCloseAtMs) return;
    kitchenCloseTickTimer = window.setInterval(() => {
      if (!dineInCloseAtMs) {
        stopKitchenCloseTicker();
        return;
      }
      const expired = Date.now() >= dineInCloseAtMs;
      refreshOrderingHoursUi();
      if (typeof renderCart === 'function') renderCart();
      if (expired) {
        stopKitchenCloseTicker();
        if (isDineInContext() && !kitchenClosedModalShown) {
          kitchenClosedModalShown = true;
          showKitchenClosedModal();
        }
      }
    }, 1000);
  }

  function stopKitchenClosePolling() {
    if (kitchenClosePollTimer) {
      window.clearInterval(kitchenClosePollTimer);
      kitchenClosePollTimer = null;
    }
  }

  function applyDineInCloseAt(isoOrNull, options = {}) {
    if (!isoOrNull) {
      dineInCloseAtMs = null;
      kitchenClosedModalShown = false;
      kitchenCountdownPromptedForMs = null;
      stopKitchenCloseTicker();
      closeKitchenCloseModal();
      refreshOrderingHoursUi();
      if (typeof renderCart === 'function') renderCart();
      return;
    }
    const ms = Date.parse(String(isoOrNull));
    const prevMs = dineInCloseAtMs;
    dineInCloseAtMs = Number.isFinite(ms) ? ms : null;
    if (!dineInCloseAtMs) {
      applyDineInCloseAt(null);
      return;
    }
    const expired = Date.now() >= dineInCloseAtMs;
    const justStarted = !prevMs || prevMs !== dineInCloseAtMs;
    if (!expired) kitchenClosedModalShown = false;
    if (justStarted) kitchenCountdownPromptedForMs = null;
    refreshOrderingHoursUi();
    if (typeof renderCart === 'function') renderCart();
    if (expired) {
      stopKitchenCloseTicker();
      if (options.showModal !== false) maybeShowKitchenModalForDineInEntry({ force: true });
    } else {
      startKitchenCloseTicker();
      /* Admin just pressed / deadline changed while guest is already in the menu */
      if (options.showModal !== false && (justStarted || options.force)) {
        maybeShowKitchenModalForDineInEntry({ force: true });
      }
    }
  }

  async function syncDineInCloseFromServer(options = {}) {
    const api = window.LechaimSupabaseOrders;
    if (!api?.getDineInCloseAt) return;
    try {
      const at = await api.getDineInCloseAt();
      const nextMs = at ? Date.parse(at) : null;
      const same =
        (!dineInCloseAtMs && !nextMs)
        || (Number.isFinite(dineInCloseAtMs)
          && Number.isFinite(nextMs)
          && Math.abs(dineInCloseAtMs - nextMs) < 1500);
      if (same && !options.force) {
        if (nextMs && Date.now() < nextMs) startKitchenCloseTicker();
        return;
      }
      applyDineInCloseAt(at, {
        showModal: options.showModal !== false,
        force: Boolean(options.force),
      });
    } catch (err) {
      console.warn('[kitchen-close] sync failed', err);
    }
  }

  function startKitchenClosePolling() {
    stopKitchenClosePolling();
    const api = window.LechaimSupabaseOrders;
    if (!api?.getDineInCloseAt) return;
    /* Realtime often misses; poll so admin click still reaches open dine-in tabs */
    kitchenClosePollTimer = window.setInterval(() => {
      syncDineInCloseFromServer({ showModal: true, force: false });
    }, 2000);
  }

  async function initDineInOrdersClosedWatch() {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.()) {
      console.warn('[kitchen-close] Supabase not configured — countdown modal disabled');
      return;
    }

    kitchenCloseOk?.addEventListener('click', closeKitchenCloseModal);
    kitchenCloseBackdrop?.addEventListener('click', closeKitchenCloseModal);

    try {
      await syncDineInCloseFromServer({ showModal: false, force: false });
      if (isDineInContext()) maybeShowKitchenModalForDineInEntry({ force: true });
    } catch (err) {
      console.warn('[kitchen-close] load deadline failed', err);
    }

    startKitchenClosePolling();

    try {
      api.subscribeRestaurantFlags?.((evt) => {
        if (evt?.flagKey !== 'dine_in_close_at') return;
        if (!evt.flagValue) {
          applyDineInCloseAt(null);
          return;
        }
        /* Prefer payload; if flag_text missing from realtime, re-fetch */
        if (evt.flagText) {
          applyDineInCloseAt(evt.flagText, { showModal: true, force: true });
        } else {
          syncDineInCloseFromServer({ showModal: true, force: true });
        }
      });
    } catch (err) {
      console.warn('[kitchen-close] subscribe failed', err);
    }
  }

  function isTakeawayContext() {
    const ctx = window.LechaimOrderContext || {};
    return ctx.orderType === 'takeaway' || ctx.orderType === 'take-away';
  }

  function normalizeFulfillmentType(value) {
    return String(value || '') === 'delivery' ? 'delivery' : 'pickup';
  }

  function isTakeawayOrderType(orderType) {
    const type = String(orderType || '').toLowerCase();
    return type === 'takeaway' || type === 'take-away' || type === 'take_away';
  }

  function getTakeawayLockKey(fulfillmentType) {
    return normalizeFulfillmentType(fulfillmentType) === 'delivery'
      ? TAKEAWAY_LOCK_KEY_DELIVERY
      : TAKEAWAY_LOCK_KEY_PICKUP;
  }

  function activeTakeawayLockKey() {
    return getTakeawayLockKey(window.LechaimOrderContext?.fulfillmentType);
  }

  function readTakeawayLock(fulfillmentType) {
    const key = fulfillmentType != null
      ? getTakeawayLockKey(fulfillmentType)
      : activeTakeawayLockKey();
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* ignore */
    }
    /* One-time migrate legacy shared lock → current fulfillment key */
    if (fulfillmentType == null || normalizeFulfillmentType(fulfillmentType)
      === normalizeFulfillmentType(window.LechaimOrderContext?.fulfillmentType)) {
      try {
        const legacyRaw = localStorage.getItem(TAKEAWAY_LOCK_KEY_LEGACY);
        const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
        if (legacy && typeof legacy === 'object') {
          localStorage.setItem(key, JSON.stringify(legacy));
          localStorage.removeItem(TAKEAWAY_LOCK_KEY_LEGACY);
          return legacy;
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  function writeTakeawayLock(payload, fulfillmentType) {
    const key = getTakeawayLockKey(
      fulfillmentType != null
        ? fulfillmentType
        : window.LechaimOrderContext?.fulfillmentType
    );
    try {
      localStorage.setItem(key, JSON.stringify(payload));
      localStorage.removeItem(TAKEAWAY_LOCK_KEY_LEGACY);
    } catch (err) {
      console.warn('[takeaway-lock] persist failed', err);
    }
  }

  function clearTakeawayLock(fulfillmentType) {
    takeawayReceiptItems = null;
    const keys = fulfillmentType != null
      ? [getTakeawayLockKey(fulfillmentType), TAKEAWAY_LOCK_KEY_LEGACY]
      : [
        TAKEAWAY_LOCK_KEY_PICKUP,
        TAKEAWAY_LOCK_KEY_DELIVERY,
        TAKEAWAY_LOCK_KEY_LEGACY,
      ];
    keys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (_) { /* ignore */ }
    });
    const ctx = window.LechaimOrderContext;
    if (ctx) ctx.takeawayLocked = false;
    document.body.classList.remove('takeaway-locked');
    updateCartToggleMode();
  }

  function isTakeawayOrderLocked() {
    if (!isTakeawayContext()) return false;
    const sessionId = window.LechaimOrderContext?.sessionId
      || window.LechaimOrderSession?.getSession?.()?.sessionId
      || null;
    const lock = readTakeawayLock();

    if (lock) {
      if (!sessionId || !lock.sessionId || String(lock.sessionId) !== String(sessionId)) {
        /* Stale lock from a previous takeaway on this phone */
        clearTakeawayLock(window.LechaimOrderContext?.fulfillmentType);
        return false;
      }
      return true;
    }

    return Boolean(window.LechaimOrderContext?.takeawayLocked);
  }

  function lockTakeawayAfterSend(waveItems) {
    if (!isTakeawayContext()) return;
    const wave = Array.isArray(waveItems)
      ? waveItems.filter((row) => row && Number(row.qty) > 0).map((row) => ({
        productId: row.productId || row.itemId || '',
        name: row.name || row.printName || row.productId || '',
        printName: row.printName || '',
        price: Number(row.price) || 0,
        qty: Number(row.qty) || 0,
      }))
      : [];

    const orderItems = (window.LechaimOrderEngine?.getOrder?.()?.items || [])
      .filter((item) => item && Number(item.qty) > 0)
      .map((item) => ({
        productId: item.productId || item.itemId || '',
        name: item.name || item.printName || item.productId || '',
        printName: item.printName || '',
        price: Number(item.price) || 0,
        qty: Number(item.qty) || 0,
      }));

    const items = orderItems.length ? orderItems : (() => {
      const prev = getTakeawayReceiptItems();
      return prev.length ? prev.concat(wave) : wave;
    })();

    takeawayReceiptItems = items;
    const sessionId = window.LechaimOrderContext?.sessionId
      || window.LechaimOrderSession?.getSession?.()?.sessionId
      || null;
    const fulfillmentType = normalizeFulfillmentType(
      window.LechaimOrderContext?.fulfillmentType
    );
    writeTakeawayLock({
      sessionId,
      fulfillmentType,
      items,
      publicOrderNo: window.LechaimOrderContext?.publicOrderNo ?? null,
      lockedAt: new Date().toISOString(),
    }, fulfillmentType);
    window.LechaimOrderContext = {
      ...(window.LechaimOrderContext || {}),
      takeawayLocked: true,
    };
    document.body.classList.add('takeaway-locked');
    updateCartToggleMode();
    updateTableHeader();
  }

  function restoreTakeawayLockIfNeeded() {
    if (!isTakeawayContext()) return;
    const fulfillmentType = normalizeFulfillmentType(
      window.LechaimOrderContext?.fulfillmentType
    );
    const lock = readTakeawayLock(fulfillmentType);
    if (!lock?.items?.length) return;
    const sessionId = window.LechaimOrderContext?.sessionId
      || window.LechaimOrderSession?.getSession?.()?.sessionId;
    if (!sessionId || !lock.sessionId || String(lock.sessionId) !== String(sessionId)) {
      clearTakeawayLock(fulfillmentType);
      return;
    }
    takeawayReceiptItems = lock.items;
    window.LechaimOrderContext = {
      ...(window.LechaimOrderContext || {}),
      takeawayLocked: true,
      publicOrderNo: lock.publicOrderNo != null
        ? Number(lock.publicOrderNo)
        : window.LechaimOrderContext?.publicOrderNo,
    };
    document.body.classList.add('takeaway-locked');
    updateCartToggleMode();
    updateTableHeader();
  }

  function getTakeawayReceiptItems() {
    /* Prefer live order engine (kept in sync with Admin add/remove via Supabase). */
    const order = window.LechaimOrderEngine?.getOrder?.();
    const engineItems = (order?.items || []).filter((item) => item && Number(item.qty) > 0);
    if (engineItems.length) return engineItems;

    if (Array.isArray(takeawayReceiptItems) && takeawayReceiptItems.length) {
      return takeawayReceiptItems;
    }
    const lock = readTakeawayLock();
    if (Array.isArray(lock?.items) && lock.items.length) return lock.items;
    return [];
  }

  function updateCartToggleMode() {
    if (!cartToggle) return;
    const locked = isTakeawayOrderLocked();
    const cartCount = getCartCount();
    const showOrderIcon = locked && cartCount === 0;
    const icon = $('#cart-toggle-icon');
    const label = $('#cart-toggle-label');
    cartToggle.classList.toggle('is-order-view', showOrderIcon);
    if (icon) {
      icon.src = showOrderIcon ? 'assets/icons/order.svg' : 'assets/icons/cart.svg';
    }
    if (label) {
      label.textContent = showOrderIcon ? t('myOrderView') : t('myCart');
      if (showOrderIcon) label.removeAttribute('data-i18n');
      else label.setAttribute('data-i18n', 'myCart');
    }
    cartToggle.setAttribute('aria-label', showOrderIcon ? t('openMyOrder') : t('openCart'));
    cartToggle.setAttribute('aria-controls', showOrderIcon ? 'order-receipt' : 'cart-panel');
    if (showOrderIcon && cartBadge) cartBadge.hidden = true;
    updateMyOrderToggle();
  }

  /** Dine-in: dedicated "ההזמנה שלי" next to cart — never replaces the cart. */
  function updateMyOrderToggle() {
    if (!myOrderToggle) return;
    const browseOnly = Boolean(window.LechaimOrderContext?.browseOnly);
    const show = !browseOnly
      && !isTakeawayContext()
      && hasActiveOrderItems();
    myOrderToggle.hidden = !show;
    if (show) {
      myOrderToggle.setAttribute('aria-label', t('openMyOrder'));
      const label = $('#my-order-toggle-label');
      if (label) label.textContent = t('myOrderView');
    }
  }

  function getActiveOrderReceiptItems() {
    const order = window.LechaimOrderEngine?.getOrder?.();
    return (order?.items || []).filter((item) => item && Number(item.qty) > 0);
  }

  /* Hero keeps brand atmosphere without dish photos (new menu has no images yet). */
  function headerFoto(filename) {
    return `assets/images/header%20foto/${filename}`;
  }

  function bifHeroFoto(filename) {
    return `assets/images/bif/${encodeURIComponent(filename)}`;
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

  const HERO_SLIDES_MENU = [
    headerFoto('1.webp'),
    headerFoto('chicken-salad.webp'),
    headerFoto('fries.webp'),
    headerFoto('fruit-plate.webp'),
    headerFoto('3.webp'),
    headerFoto('keter-david.webp'),
    headerFoto('hummus-egg.webp'),
    headerFoto('amburger.webp'),
    headerFoto('denis.webp'),
    headerFoto('4.webp'),
    headerFoto('5.webp'),
    headerFoto('asado.webp'),
    headerFoto('2.webp'),
    headerFoto('schnitzel.webp'),
    headerFoto('staik-antarkot.webp'),
    headerFoto('fanta.webp'),
    headerFoto('kerem-israel.webp'),
  ];

  const HERO_SLIDES_BUTCHER = [
    bifHeroFoto('asado.webp'),
    bifHeroFoto('antrikut.webp'),
    bifHeroFoto('golsh.webp'),
    bifHeroFoto('baked-potatoes.webp'),
    bifHeroFoto("kar'i'im.webp"),
    bifHeroFoto('pirgit.webp'),
    bifHeroFoto("knafi'im.webp"),
  ];

  function getHeroSlides() {
    return shuffleArray(isButcherContext() ? HERO_SLIDES_BUTCHER : HERO_SLIDES_MENU);
  }

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

  function isNonAlcoholicItem(item) {
    return Boolean(getResolvedItem(item)?.nonAlcoholic);
  }

  function formatDishNameHtml(item) {
    const nameHtml = escapeHtml(getItemName(item));
    if (!isNonAlcoholicItem(item)) return nameHtml;
    return `${nameHtml} <span class="food-na-badge">(${escapeHtml(t('nonAlcoholicLabel'))})</span>`;
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

  function isButcherOrderType(orderType) {
    const type = String(orderType || '').toLowerCase();
    return type === 'butcher' || type === 'butcher_shop' || type === 'butcher-shop' || type.includes('butcher');
  }

  /** Dine-in / pickup / delivery / butcher — separate localStorage carts. */
  function getCartStorageKey(orderType, fulfillmentType) {
    if (isButcherOrderType(orderType)) return CART_STORAGE_KEY_BUTCHER;
    if (isTakeawayOrderType(orderType)) {
      return normalizeFulfillmentType(fulfillmentType) === 'delivery'
        ? CART_STORAGE_KEY_DELIVERY
        : CART_STORAGE_KEY_PICKUP;
    }
    return CART_STORAGE_KEY_FOOD;
  }

  function activeCartStorageKey() {
    const ctx = window.LechaimOrderContext || {};
    return getCartStorageKey(ctx.orderType, ctx.fulfillmentType);
  }

  function writeCartToKey(storageKey, lines, order) {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        lines: Array.isArray(lines) ? lines : [],
        order: Array.isArray(order) ? order : [],
      }));
    } catch (err) {
      console.warn('[cart] persist failed', storageKey, err);
    }
  }

  function readCartFromKey(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
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

  function applyCartState(loaded) {
    cartLines = loaded?.lines || [];
    cartLineOrder = loaded?.order || cartLines.map((l) => l.lineId);
    lastMainLineId = null;
  }

  function clearActiveCartMemoryAndStorage() {
    cartLines = [];
    cartLineOrder = [];
    lastMainLineId = null;
    writeCartToKey(activeCartStorageKey(), [], []);
  }

  function isButcherContext() {
    return isButcherOrderType(window.LechaimOrderContext?.orderType);
  }

  function isSoldByWeight(item) {
    const resolved = getResolvedItem(item);
    return Boolean(resolved?.soldByWeight || resolved?.unitType === 'kg');
  }

  function isSoldByPack(itemOrId) {
    const item = typeof itemOrId === 'string' ? findItem(itemOrId) : itemOrId;
    const resolved = getResolvedItem(item);
    return Boolean(resolved && (resolved.soldByPack || resolved.unitType === 'pack'));
  }

  function getButcherPackWeightMin() {
    return Number(window.BUTCHER_PACK_WEIGHT_MIN_KG) || 0.98;
  }

  function getButcherPackWeightMax() {
    return Number(window.BUTCHER_PACK_WEIGHT_MAX_KG) || 1.2;
  }

  function getButcherDeliveryFee() {
    return Number(window.BUTCHER_DEFAULT_DELIVERY_FEE) || 10;
  }

  function getTakeawayDeliveryFee() {
    return Number(window.TAKEAWAY_DEFAULT_DELIVERY_FEE)
      || Number(window.BUTCHER_DEFAULT_DELIVERY_FEE)
      || 10;
  }

  function getDeliveryMinOrder() {
    return Number(window.TAKEAWAY_DELIVERY_MIN_ORDER) || 75;
  }

  function isTakeawayDeliveryContext() {
    return isTakeawayContext()
      && String(window.LechaimOrderContext?.fulfillmentType || '') === 'delivery';
  }

  function getActiveDeliveryFee() {
    const ctx = window.LechaimOrderContext || {};
    if (String(ctx.fulfillmentType || '') !== 'delivery') return 0;
    if (!isTakeawayContext() && !isButcherContext()) return 0;
    const fee = Number(ctx.deliveryFee);
    if (Number.isFinite(fee) && fee >= 0) return fee;
    return isButcherContext() ? getButcherDeliveryFee() : getTakeawayDeliveryFee();
  }

  function getCartItemsSubtotal() {
    return cartLines.reduce((sum, line) => {
      const item = findItem(line.itemId);
      if (!item) return sum;
      if (isCartPackLine(line) || isSoldByPack(item)) {
        const perKg = Number(line.pricePerKg) > 0
          ? Number(line.pricePerKg)
          : getItemPricePerKg(item);
        return sum + getPackEstRange(perKg, line.qty).max;
      }
      const price = getCartLineUnitPrice(line, item);
      return sum + ((price || 0) * (Number(line.qty) || 0));
    }, 0);
  }

  function formatEuroAmount(n) {
    return `${t('currency')}${(Number(n) || 0).toFixed(2)}`;
  }

  function getPackEstRange(pricePerKg, packs) {
    const p = Math.max(1, Number(packs) || 1);
    const perKg = Number(pricePerKg) || 0;
    return {
      min: perKg * getButcherPackWeightMin() * p,
      max: perKg * getButcherPackWeightMax() * p,
    };
  }

  function packQtyLabel(count) {
    const n = Math.max(0, Number(count) || 0);
    return n === 1
      ? t('packQtyLabelOne')
      : tReplace('packQtyLabel', { count: String(n) });
  }

  function getItemPricePerKg(item) {
    const resolved = getResolvedItem(item);
    /* Listed catalog price is the price per kg */
    const perKg = Number(resolved?.price ?? resolved?.pricePerKg);
    return Number.isFinite(perKg) ? perKg : 0;
  }

  function isCartPackLine(line) {
    if (!line) return false;
    if (line.unitType === 'pack') return true;
    return isSoldByPack(line.itemId);
  }

  function clampPackThawCount(line) {
    if (!isCartPackLine(line)) return;
    const qty = Math.max(0, Number(line.qty) || 0);
    const thaw = Math.min(Math.max(0, Number(line.thawCount) || 0), qty);
    line.thawCount = thaw;
  }

  function getVisibleCategories() {
    const cats = Array.isArray(MENU_DATA?.categories) ? MENU_DATA.categories : [];
    if (isButcherContext()) {
      return cats.filter((cat) => cat.id === 'butcher' || cat.id === 'poultry');
    }
    return cats.filter((cat) => cat.id !== 'butcher' && cat.id !== 'poultry');
  }

  let deliveryFeeFocusTrapRelease = null;
  let deliveryFeeShownThisVisit = false;
  let butcherCheckoutFocusTrapRelease = null;
  let butcherCheckoutBound = false;
  let dineInNotesFocusTrapRelease = null;
  let dineInNotesBound = false;

  function hasButcherCustomerDetails() {
    const ctx = window.LechaimOrderContext || {};
    const name = String(ctx.customerName || '').trim();
    const phone = String(ctx.customerPhone || '').trim();
    const gate = window.LechaimEntryGate;
    const phoneOk = typeof gate?.isValidPhone === 'function'
      ? gate.isValidPhone(phone)
      : /^\d{9,15}$/.test(phone.replace(/\D/g, ''));
    if (!name || !phone || !phoneOk) return false;
    if (ctx.pickupType === 'ASAP') return true;
    return Boolean(
      ctx.pickupType === 'TIME'
      && String(ctx.pickupDate || '').trim()
      && String(ctx.pickupTime || '').trim()
    );
  }

  function applyButcherCustomerDetails({
    customerName,
    customerPhone,
    customerNotes,
    pickupType,
    pickupTime,
    pickupDate,
  }) {
    const name = customerName || '';
    const phone = customerPhone || '';
    const notes = customerNotes || '';
    const fulfillment = 'pickup';
    const type = pickupType === 'TIME' ? 'TIME' : 'ASAP';
    const time = type === 'TIME' && pickupTime ? String(pickupTime) : null;
    const date = type === 'TIME' && pickupDate ? String(pickupDate) : null;
    const Session = window.LechaimOrderSession;
    if (Session?.patchSession) {
      Session.patchSession({
        customerName: name,
        customerPhone: phone,
        customerNotes: notes,
        customerAddress: '',
        fulfillmentType: fulfillment,
        deliveryFee: null,
        pickupType: type,
        pickupTime: time,
        pickupDate: date,
      });
    }
    const prev = window.LechaimOrderContext || {};
    window.LechaimOrderContext = {
      ...prev,
      customerName: name,
      customerPhone: phone,
      customerNotes: notes,
      customerAddress: '',
      fulfillmentType: fulfillment,
      deliveryFee: null,
      pickupType: type,
      pickupTime: time,
      pickupDate: date,
    };
  }

  function closeButcherCheckoutModal() {
    const modal = document.getElementById('butcher-checkout-modal');
    if (!modal) return;
    if (typeof butcherCheckoutFocusTrapRelease === 'function') butcherCheckoutFocusTrapRelease();
    butcherCheckoutFocusTrapRelease = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('app-confirm-open');
  }

  function showButcherCheckoutError(message) {
    const errEl = document.getElementById('butcher-checkout-error');
    if (!errEl) return;
    errEl.hidden = !message;
    errEl.textContent = message || '';
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatButcherPickupDateDisplay(isoDate) {
    const raw = String(isoDate || '').trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return raw;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  /** Butcher shop: always open — pickup slots every day, not restaurant hours. */
  const BUTCHER_PICKUP_OPEN_MINUTES = 8 * 60;
  const BUTCHER_PICKUP_CLOSE_MINUTES = 22 * 60;

  function toIsoDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function buildButcherPickupSlots(selectedDate) {
    const slots = [];
    const openMinutes = BUTCHER_PICKUP_OPEN_MINUTES;
    const closeMinutes = BUTCHER_PICKUP_CLOSE_MINUTES;
    const today = new Date();
    const todayIso = toIsoDate(today);
    let cursor = openMinutes;

    if (selectedDate && selectedDate === todayIso) {
      const nowMinutes = today.getHours() * 60 + today.getMinutes();
      cursor = Math.max(openMinutes, Math.ceil((nowMinutes + 1) / 30) * 30);
    }

    for (let m = cursor; m <= closeMinutes; m += 30) {
      slots.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
    }
    return slots;
  }

  function fillButcherPickupTimeSlots(preferredTime) {
    const timeSelect = document.getElementById('butcher-checkout-time');
    const dateInput = document.getElementById('butcher-checkout-date');
    if (!timeSelect) return;

    /* If today has no remaining slots, roll date forward (shop is always open). */
    if (dateInput?.value) {
      const maxIso = dateInput.max || '';
      let guard = 0;
      while (
        guard < 16
        && buildButcherPickupSlots(dateInput.value).length === 0
        && (!maxIso || dateInput.value < maxIso)
      ) {
        const d = new Date(`${dateInput.value}T12:00:00`);
        d.setDate(d.getDate() + 1);
        dateInput.value = toIsoDate(d);
        guard += 1;
      }
    }

    const slots = buildButcherPickupSlots(dateInput?.value || '');
    const keep = preferredTime && slots.includes(preferredTime) ? preferredTime : '';
    timeSelect.innerHTML = slots.map((slot) => (
      `<option value="${slot}">${slot}</option>`
    )).join('');
    if (keep) timeSelect.value = keep;
    else if (slots[0]) timeSelect.value = slots[0];
  }

  function syncButcherCheckoutFulfillmentUi() {
    const fulfillment = document.getElementById('butcher-checkout-fulfillment');
    const deliveryRadio = document.getElementById('butcher-checkout-fulfillment-delivery');
    const pickupRadio = document.getElementById('butcher-checkout-fulfillment-pickup');
    const addressField = document.getElementById('butcher-checkout-address-field');
    const addressInput = document.getElementById('butcher-checkout-address');
    const asapInput = document.getElementById('butcher-checkout-asap');
    const asapLabel = asapInput?.closest('.butcher-checkout__check');
    const dateLabel = document.getElementById('butcher-checkout-date-label');
    const timeLabel = document.getElementById('butcher-checkout-time-label');

    /* Butcher shop: pickup only — no delivery */
    if (fulfillment) fulfillment.hidden = true;
    if (pickupRadio) pickupRadio.checked = true;
    if (deliveryRadio) {
      deliveryRadio.checked = false;
      deliveryRadio.disabled = true;
    }
    if (addressField) addressField.hidden = true;
    if (addressInput) {
      addressInput.required = false;
      addressInput.value = '';
    }
    if (asapLabel) asapLabel.hidden = false;
    if (dateLabel) dateLabel.textContent = t('butcherCheckoutDate');
    if (timeLabel) timeLabel.textContent = t('butcherCheckoutTime');

    syncButcherCheckoutScheduleUi();
  }

  function syncButcherCheckoutScheduleUi() {
    const asap = document.getElementById('butcher-checkout-asap');
    const schedule = document.getElementById('butcher-checkout-schedule');
    const dateInput = document.getElementById('butcher-checkout-date');
    const timeSelect = document.getElementById('butcher-checkout-time');
    const asapOn = Boolean(asap?.checked);
    if (schedule) schedule.hidden = asapOn;
    if (dateInput) {
      dateInput.required = !asapOn;
      dateInput.disabled = asapOn;
    }
    if (timeSelect) {
      timeSelect.required = !asapOn;
      timeSelect.disabled = asapOn;
    }
  }

  async function openButcherCheckoutModal() {
    const modal = document.getElementById('butcher-checkout-modal');
    const form = document.getElementById('butcher-checkout-form');
    const nameInput = document.getElementById('butcher-checkout-name');
    const phoneInput = document.getElementById('butcher-checkout-phone');
    const notesInput = document.getElementById('butcher-checkout-notes');
    const addressInput = document.getElementById('butcher-checkout-address');
    const asapInput = document.getElementById('butcher-checkout-asap');
    const dateInput = document.getElementById('butcher-checkout-date');
    const pickupRadio = document.getElementById('butcher-checkout-fulfillment-pickup');
    const deliveryRadio = document.getElementById('butcher-checkout-fulfillment-delivery');
    if (!modal || !form) return;

    try {
      await window.LechaimEntryGate?.refreshDeliveriesClosedFlag?.();
    } catch (_) { /* ignore */ }

    const ctx = window.LechaimOrderContext || {};
    if (nameInput) nameInput.value = String(ctx.customerName || '');
    if (phoneInput) phoneInput.value = String(ctx.customerPhone || '');
    if (notesInput) notesInput.value = String(ctx.customerNotes || '');
    if (addressInput) addressInput.value = '';

    if (pickupRadio) pickupRadio.checked = true;
    if (deliveryRadio) {
      deliveryRadio.disabled = true;
      deliveryRadio.checked = false;
    }

    if (asapInput) {
      asapInput.checked = ctx.pickupType === 'ASAP';
    }

    const today = new Date();
    const todayIso = toIsoDate(today);
    const max = new Date(today);
    max.setDate(max.getDate() + 14);
    const maxIso = toIsoDate(max);
    if (dateInput) {
      dateInput.min = todayIso;
      dateInput.max = maxIso;
      dateInput.value = String(ctx.pickupDate || todayIso);
      if (dateInput.value < todayIso) dateInput.value = todayIso;
      if (dateInput.value > maxIso) dateInput.value = maxIso;
    }
    fillButcherPickupTimeSlots(String(ctx.pickupTime || ''));
    syncButcherCheckoutFulfillmentUi();
    showButcherCheckoutError('');

    const title = document.getElementById('butcher-checkout-title');
    const hint = document.getElementById('butcher-checkout-hint');
    const submit = document.getElementById('butcher-checkout-submit');
    const cancel = document.getElementById('butcher-checkout-cancel');
    if (title) title.textContent = t('butcherCheckoutTitle');
    if (hint) hint.textContent = t('butcherCheckoutHint');
    if (submit) submit.textContent = t('butcherCheckoutSubmit');
    if (cancel) cancel.textContent = t('clearCartCancel');
    modal.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key || !t(key)) return;
      if (key === 'butcherNoticeBody') {
        el.innerHTML = escapeHtml(t(key)).replace(/\n/g, '<br>');
        return;
      }
      el.textContent = t(key);
    });
    syncButcherCheckoutFulfillmentUi();

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-confirm-open');

    if (typeof butcherCheckoutFocusTrapRelease === 'function') butcherCheckoutFocusTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(modal);
    butcherCheckoutFocusTrapRelease = typeof release === 'function' ? release : null;
    nameInput?.focus();
  }

  function submitButcherCheckoutForm(event) {
    event?.preventDefault?.();
    const nameRaw = String(document.getElementById('butcher-checkout-name')?.value || '').trim();
    const phone = String(document.getElementById('butcher-checkout-phone')?.value || '').trim();
    const notes = String(document.getElementById('butcher-checkout-notes')?.value || '').trim();
    const fulfillment = 'pickup';
    const asapOn = Boolean(document.getElementById('butcher-checkout-asap')?.checked);
    const pickupDate = String(document.getElementById('butcher-checkout-date')?.value || '').trim();
    const pickupTime = String(document.getElementById('butcher-checkout-time')?.value || '').trim();
    const gate = window.LechaimEntryGate;
    const nameEn = typeof gate?.transliterateToEnglish === 'function'
      ? gate.transliterateToEnglish(nameRaw)
      : nameRaw;
    const phoneOk = typeof gate?.isValidPhone === 'function'
      ? gate.isValidPhone(phone)
      : /^\d{9,15}$/.test(phone.replace(/\D/g, ''));

    if (!nameRaw || !nameEn) {
      showButcherCheckoutError(t('butcherCheckoutNameRequired'));
      document.getElementById('butcher-checkout-name')?.focus();
      return;
    }
    if (!phone) {
      showButcherCheckoutError(t('butcherCheckoutPhoneRequired'));
      document.getElementById('butcher-checkout-phone')?.focus();
      return;
    }
    if (!phoneOk) {
      showButcherCheckoutError(t('butcherCheckoutPhoneInvalid'));
      document.getElementById('butcher-checkout-phone')?.focus();
      return;
    }
    if (!asapOn && !pickupDate) {
      showButcherCheckoutError(t('butcherCheckoutDateRequired'));
      document.getElementById('butcher-checkout-date')?.focus();
      return;
    }
    if (!asapOn && !pickupTime) {
      showButcherCheckoutError(t('butcherCheckoutTimeRequired'));
      document.getElementById('butcher-checkout-time')?.focus();
      return;
    }

    applyButcherCustomerDetails({
      customerName: nameEn,
      customerPhone: phone,
      customerNotes: notes,
      customerAddress: '',
      fulfillmentType: fulfillment,
      deliveryFee: null,
      pickupType: asapOn ? 'ASAP' : 'TIME',
      pickupDate: asapOn ? null : pickupDate,
      pickupTime: asapOn ? null : pickupTime,
    });
    closeButcherCheckoutModal();
    renderCart();
    handleSendOrder();
  }

  function initButcherCheckoutModal() {
    if (butcherCheckoutBound) return;
    butcherCheckoutBound = true;
    const form = document.getElementById('butcher-checkout-form');
    const cancel = document.getElementById('butcher-checkout-cancel');
    const backdrop = document.getElementById('butcher-checkout-backdrop');
    const asap = document.getElementById('butcher-checkout-asap');
    const dateInput = document.getElementById('butcher-checkout-date');
    form?.addEventListener('submit', submitButcherCheckoutForm);
    cancel?.addEventListener('click', closeButcherCheckoutModal);
    backdrop?.addEventListener('click', closeButcherCheckoutModal);
    asap?.addEventListener('change', syncButcherCheckoutScheduleUi);
    dateInput?.addEventListener('change', () => {
      fillButcherPickupTimeSlots(document.getElementById('butcher-checkout-time')?.value || '');
    });
    document.getElementById('butcher-checkout-fulfillment-pickup')
      ?.addEventListener('change', syncButcherCheckoutFulfillmentUi);
    document.getElementById('butcher-checkout-fulfillment-delivery')
      ?.addEventListener('change', syncButcherCheckoutFulfillmentUi);
  }

  let takeawayCheckoutFocusTrapRelease = null;
  let takeawayCheckoutBound = false;

  function isTakeawayContext() {
    const ctx = window.LechaimOrderContext || {};
    return ctx.orderType === 'takeaway' || ctx.orderType === 'take-away';
  }

  function hasTakeawayCustomerDetails() {
    const ctx = window.LechaimOrderContext || {};
    const name = String(ctx.customerName || '').trim();
    const phone = String(ctx.customerPhone || '').trim();
    const gate = window.LechaimEntryGate;
    const phoneOk = typeof gate?.isValidPhone === 'function'
      ? gate.isValidPhone(phone)
      : /^\d{9,15}$/.test(phone.replace(/\D/g, ''));
    if (!name || !phone || !phoneOk) return false;
    if (ctx.fulfillmentType === 'delivery' && !String(ctx.customerAddress || '').trim()) return false;
    if (ctx.pickupType === 'ASAP') return true;
    return Boolean(
      ctx.pickupType === 'TIME'
      && String(ctx.pickupDate || '').trim()
      && String(ctx.pickupTime || '').trim()
    );
  }

  function applyTakeawayCustomerDetails({
    customerName,
    customerPhone,
    customerNotes,
    customerAddress,
    fulfillmentType,
    deliveryFee,
    pickupType,
    pickupTime,
    pickupDate,
  }) {
    const name = customerName || '';
    const phone = customerPhone || '';
    const notes = customerNotes || '';
    const fulfillment = fulfillmentType === 'delivery' ? 'delivery' : 'pickup';
    const address = fulfillment === 'delivery' ? (customerAddress || '') : '';
    const type = pickupType === 'TIME' ? 'TIME' : 'ASAP';
    const time = type === 'TIME' && pickupTime ? String(pickupTime) : null;
    const date = type === 'TIME' && pickupDate ? String(pickupDate) : null;
    const fee = fulfillment === 'delivery'
      ? (Number.isFinite(Number(deliveryFee)) && Number(deliveryFee) >= 0
        ? Number(deliveryFee)
        : getTakeawayDeliveryFee())
      : null;
    const Session = window.LechaimOrderSession;
    if (Session?.patchSession) {
      Session.patchSession({
        customerName: name,
        customerPhone: phone,
        customerNotes: notes,
        customerAddress: address,
        fulfillmentType: fulfillment,
        deliveryFee: fee,
        pickupType: type,
        pickupTime: time,
        pickupDate: date,
      });
    }
    const prev = window.LechaimOrderContext || {};
    window.LechaimOrderContext = {
      ...prev,
      customerName: name,
      customerPhone: phone,
      customerNotes: notes,
      customerAddress: address,
      fulfillmentType: fulfillment,
      deliveryFee: fee,
      pickupType: type,
      pickupTime: time,
      pickupDate: date,
    };
  }

  function closeTakeawayCheckoutModal() {
    const modal = document.getElementById('takeaway-checkout-modal');
    if (!modal) return;
    if (typeof takeawayCheckoutFocusTrapRelease === 'function') takeawayCheckoutFocusTrapRelease();
    takeawayCheckoutFocusTrapRelease = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('app-confirm-open');
  }

  function showTakeawayCheckoutError(message) {
    const errEl = document.getElementById('takeaway-checkout-error');
    if (!errEl) return;
    errEl.hidden = !message;
    errEl.textContent = message || '';
  }

  function buildTakeawayPickupSlots(selectedDate) {
    const slots = [];
    const openMinutes = (Hours()?.OPEN_HOUR ?? 14) * 60;
    const closeMinutes = typeof Hours()?.takeawaySlotCloseMinutes === 'function'
      ? Hours().takeawaySlotCloseMinutes()
      : (21 * 60 + 45);
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    let cursor = openMinutes;
    if (selectedDate && selectedDate === todayIso) {
      const nowMinutes = today.getHours() * 60 + today.getMinutes();
      cursor = Math.max(openMinutes, Math.ceil((nowMinutes + 1) / 15) * 15);
    }
    for (let m = cursor; m <= closeMinutes; m += 15) {
      slots.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
    }
    return slots;
  }

  function fillTakeawayPickupTimeSlots(preferredTime) {
    const timeSelect = document.getElementById('takeaway-checkout-time');
    const dateInput = document.getElementById('takeaway-checkout-date');
    if (!timeSelect) return;
    const slots = buildTakeawayPickupSlots(dateInput?.value || '');
    const keep = preferredTime && slots.includes(preferredTime) ? preferredTime : '';
    timeSelect.innerHTML = slots.map((slot) => (
      `<option value="${slot}">${slot}</option>`
    )).join('');
    if (keep) timeSelect.value = keep;
    else if (slots[0]) timeSelect.value = slots[0];
  }

  function syncTakeawayCheckoutFulfillmentUi() {
    const ctx = window.LechaimOrderContext || {};
    const lockedDelivery = ctx.fulfillmentType === 'delivery';
    const lockedPickup = ctx.fulfillmentType === 'pickup';
    const allowDelivery = lockedDelivery
      || (window.LechaimEntryGate?.areDeliveriesOpen?.() !== false && !lockedPickup);
    const fulfillment = document.getElementById('takeaway-checkout-fulfillment');
    const deliveryRow = document.getElementById('takeaway-checkout-fulfillment-delivery-row');
    const deliveryRadio = document.getElementById('takeaway-checkout-fulfillment-delivery');
    const pickupRadio = document.getElementById('takeaway-checkout-fulfillment-pickup');
    const addressField = document.getElementById('takeaway-checkout-address-field');
    const addressInput = document.getElementById('takeaway-checkout-address');

    /* Entry already chose pickup or delivery — no need to re-pick type */
    if (fulfillment) fulfillment.hidden = lockedDelivery || lockedPickup || !allowDelivery;
    if (deliveryRow) deliveryRow.hidden = !allowDelivery || lockedPickup;
    if (deliveryRadio) {
      deliveryRadio.disabled = !allowDelivery || lockedPickup;
      if (lockedDelivery) deliveryRadio.checked = true;
    }
    if (pickupRadio) {
      if (lockedPickup || !allowDelivery) pickupRadio.checked = true;
    }

    const deliveryOn = lockedDelivery
      || (allowDelivery && Boolean(deliveryRadio?.checked));
    if (addressField) addressField.hidden = !deliveryOn;
    if (addressInput) {
      addressInput.required = deliveryOn;
      if (!deliveryOn) addressInput.value = '';
    }
  }

  function syncTakeawayCheckoutScheduleUi() {
    const asap = document.getElementById('takeaway-checkout-asap');
    const schedule = document.getElementById('takeaway-checkout-schedule');
    const dateInput = document.getElementById('takeaway-checkout-date');
    const timeSelect = document.getElementById('takeaway-checkout-time');
    const asapOn = Boolean(asap?.checked);
    if (schedule) schedule.hidden = asapOn;
    if (dateInput) {
      dateInput.required = !asapOn;
      dateInput.disabled = asapOn;
    }
    if (timeSelect) {
      timeSelect.required = !asapOn;
      timeSelect.disabled = asapOn;
    }
  }

  async function openTakeawayCheckoutModal() {
    const modal = document.getElementById('takeaway-checkout-modal');
    const form = document.getElementById('takeaway-checkout-form');
    if (!modal || !form) return;
    try {
      await window.LechaimEntryGate?.refreshDeliveriesClosedFlag?.();
    } catch (_) { /* ignore */ }

    const ctx = window.LechaimOrderContext || {};
    const nameInput = document.getElementById('takeaway-checkout-name');
    const phoneInput = document.getElementById('takeaway-checkout-phone');
    const notesInput = document.getElementById('takeaway-checkout-notes');
    const addressInput = document.getElementById('takeaway-checkout-address');
    const asapInput = document.getElementById('takeaway-checkout-asap');
    const dateInput = document.getElementById('takeaway-checkout-date');
    const pickupRadio = document.getElementById('takeaway-checkout-fulfillment-pickup');
    const deliveryRadio = document.getElementById('takeaway-checkout-fulfillment-delivery');
    const deliveryRow = document.getElementById('takeaway-checkout-fulfillment-delivery-row');

    if (nameInput) nameInput.value = String(ctx.customerName || '');
    if (phoneInput) phoneInput.value = String(ctx.customerPhone || '');
    if (notesInput) notesInput.value = String(ctx.customerNotes || '');
    if (addressInput) addressInput.value = String(ctx.customerAddress || '');
    if (asapInput) asapInput.checked = ctx.pickupType === 'ASAP';

    const allowDelivery = window.LechaimEntryGate?.areDeliveriesOpen?.() !== false;
    const wantDelivery = allowDelivery && ctx.fulfillmentType === 'delivery';
    if (pickupRadio) pickupRadio.checked = !wantDelivery;
    if (deliveryRadio) {
      deliveryRadio.disabled = !allowDelivery;
      deliveryRadio.checked = wantDelivery;
    }
    if (deliveryRow) deliveryRow.hidden = !allowDelivery;

    const today = new Date();
    const todayIso = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    const max = new Date(today);
    max.setDate(max.getDate() + 14);
    const maxIso = `${max.getFullYear()}-${pad2(max.getMonth() + 1)}-${pad2(max.getDate())}`;
    if (dateInput) {
      dateInput.min = todayIso;
      dateInput.max = maxIso;
      dateInput.value = String(ctx.pickupDate || todayIso);
    }
    fillTakeawayPickupTimeSlots(String(ctx.pickupTime || ''));
    syncTakeawayCheckoutFulfillmentUi();
    syncTakeawayCheckoutScheduleUi();
    showTakeawayCheckoutError('');

    const title = document.getElementById('takeaway-checkout-title');
    const hint = document.getElementById('takeaway-checkout-hint');
    const submit = document.getElementById('takeaway-checkout-submit');
    const cancel = document.getElementById('takeaway-checkout-cancel');
    if (title) title.textContent = t('takeawayCheckoutTitle');
    if (hint) hint.textContent = t('takeawayCheckoutHint');
    if (submit) submit.textContent = t('butcherCheckoutSubmit');
    if (cancel) cancel.textContent = t('clearCartCancel');
    modal.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key && t(key)) el.textContent = t(key);
    });

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-confirm-open');
    if (typeof takeawayCheckoutFocusTrapRelease === 'function') takeawayCheckoutFocusTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(modal);
    takeawayCheckoutFocusTrapRelease = typeof release === 'function' ? release : null;
    nameInput?.focus();
  }

  function submitTakeawayCheckoutForm(event) {
    event?.preventDefault?.();
    const nameRaw = String(document.getElementById('takeaway-checkout-name')?.value || '').trim();
    const phone = String(document.getElementById('takeaway-checkout-phone')?.value || '').trim();
    const notes = String(document.getElementById('takeaway-checkout-notes')?.value || '').trim();
    const address = String(document.getElementById('takeaway-checkout-address')?.value || '').trim();
    const asapOn = Boolean(document.getElementById('takeaway-checkout-asap')?.checked);
    const pickupDate = String(document.getElementById('takeaway-checkout-date')?.value || '').trim();
    const pickupTime = String(document.getElementById('takeaway-checkout-time')?.value || '').trim();
    const ctx = window.LechaimOrderContext || {};
    const locked = ctx.fulfillmentType === 'delivery' || ctx.fulfillmentType === 'pickup';
    const allowDelivery = window.LechaimEntryGate?.areDeliveriesOpen?.() !== false;
    const fulfillment = locked
      ? (ctx.fulfillmentType === 'delivery' ? 'delivery' : 'pickup')
      : (allowDelivery
        && document.getElementById('takeaway-checkout-fulfillment-delivery')?.checked
        ? 'delivery'
        : 'pickup');
    const gate = window.LechaimEntryGate;
    const nameEn = typeof gate?.transliterateToEnglish === 'function'
      ? gate.transliterateToEnglish(nameRaw)
      : nameRaw;
    const phoneOk = typeof gate?.isValidPhone === 'function'
      ? gate.isValidPhone(phone)
      : /^\d{9,15}$/.test(phone.replace(/\D/g, ''));

    if (!nameRaw || !nameEn) {
      showTakeawayCheckoutError(t('butcherCheckoutNameRequired'));
      document.getElementById('takeaway-checkout-name')?.focus();
      return;
    }
    if (fulfillment === 'delivery' && !address) {
      showTakeawayCheckoutError(t('customerAddressRequired'));
      document.getElementById('takeaway-checkout-address')?.focus();
      return;
    }
    if (!phone) {
      showTakeawayCheckoutError(t('butcherCheckoutPhoneRequired'));
      document.getElementById('takeaway-checkout-phone')?.focus();
      return;
    }
    if (!phoneOk) {
      showTakeawayCheckoutError(t('butcherCheckoutPhoneInvalid'));
      document.getElementById('takeaway-checkout-phone')?.focus();
      return;
    }
    if (!asapOn && !pickupDate) {
      showTakeawayCheckoutError(t('butcherCheckoutDateRequired'));
      document.getElementById('takeaway-checkout-date')?.focus();
      return;
    }
    if (!asapOn && !pickupTime) {
      showTakeawayCheckoutError(t('butcherCheckoutTimeRequired'));
      document.getElementById('takeaway-checkout-time')?.focus();
      return;
    }

    applyTakeawayCustomerDetails({
      customerName: nameEn,
      customerPhone: phone,
      customerNotes: notes,
      customerAddress: address,
      fulfillmentType: fulfillment,
      deliveryFee: fulfillment === 'delivery' ? getTakeawayDeliveryFee() : null,
      pickupType: asapOn ? 'ASAP' : 'TIME',
      pickupDate: asapOn ? null : pickupDate,
      pickupTime: asapOn ? null : pickupTime,
    });
    closeTakeawayCheckoutModal();
    if (fulfillment === 'delivery') maybeShowDeliveryFeeNotice();
    renderCart();
    handleSendOrder();
  }

  function initTakeawayCheckoutModal() {
    if (takeawayCheckoutBound) return;
    takeawayCheckoutBound = true;
    const form = document.getElementById('takeaway-checkout-form');
    const cancel = document.getElementById('takeaway-checkout-cancel');
    const backdrop = document.getElementById('takeaway-checkout-backdrop');
    const asap = document.getElementById('takeaway-checkout-asap');
    const dateInput = document.getElementById('takeaway-checkout-date');
    form?.addEventListener('submit', submitTakeawayCheckoutForm);
    cancel?.addEventListener('click', closeTakeawayCheckoutModal);
    backdrop?.addEventListener('click', closeTakeawayCheckoutModal);
    asap?.addEventListener('change', syncTakeawayCheckoutScheduleUi);
    dateInput?.addEventListener('change', () => {
      fillTakeawayPickupTimeSlots(document.getElementById('takeaway-checkout-time')?.value || '');
    });
    document.getElementById('takeaway-checkout-fulfillment-pickup')
      ?.addEventListener('change', syncTakeawayCheckoutFulfillmentUi);
    document.getElementById('takeaway-checkout-fulfillment-delivery')
      ?.addEventListener('change', syncTakeawayCheckoutFulfillmentUi);
  }

  function hasDineInNotesConfirmed() {
    if (window.LechaimOrderContext?.dineInNotesConfirmed) return true;
    return Boolean(window.LechaimOrderSession?.getSession?.()?.dineInNotesConfirmed);
  }

  function applyDineInOrderNotes(notes) {
    const text = String(notes || '').trim();
    updateOrderContext({
      customerNotes: text,
      dineInNotesConfirmed: true,
    });
    try {
      window.LechaimOrderSession?.patchSession?.({
        customerNotes: text,
        dineInNotesConfirmed: true,
      });
    } catch (err) {
      console.warn('[dine-in notes] failed to persist local session notes', err);
    }
  }

  function clearDineInNotesDraft() {
    const input = document.getElementById('dinein-notes-input');
    if (input) input.value = '';
    if (!isDineInContext()) return;
    updateOrderContext({
      customerNotes: '',
      dineInNotesConfirmed: false,
    });
    try {
      window.LechaimOrderSession?.patchSession?.({
        customerNotes: '',
        dineInNotesConfirmed: false,
      });
    } catch (err) {
      console.warn('[dine-in notes] failed to reset notes draft', err);
    }
  }

  function clearDineInNotesConfirmation() {
    clearDineInNotesDraft();
  }

  function closeDineInNotesModal() {
    const modal = document.getElementById('dinein-notes-modal');
    if (!modal) return;
    if (typeof dineInNotesFocusTrapRelease === 'function') dineInNotesFocusTrapRelease();
    dineInNotesFocusTrapRelease = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('app-confirm-open');
  }

  function openDineInNotesModal() {
    const modal = document.getElementById('dinein-notes-modal');
    if (!modal) {
      applyDineInOrderNotes('');
      handleSendOrder();
      return;
    }

    const input = document.getElementById('dinein-notes-input');
    const title = document.getElementById('dinein-notes-title');
    const hint = document.getElementById('dinein-notes-hint');
    const submit = document.getElementById('dinein-notes-submit');
    const cancel = document.getElementById('dinein-notes-cancel');
    if (title) title.textContent = t('dineInNotesTitle');
    if (hint) hint.textContent = t('dineInNotesHint');
    if (submit) submit.textContent = t('dineInNotesSubmit');
    if (cancel) cancel.textContent = t('clearCartCancel');
    if (input) input.value = '';

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-confirm-open');
    if (typeof dineInNotesFocusTrapRelease === 'function') dineInNotesFocusTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(modal);
    dineInNotesFocusTrapRelease = typeof release === 'function' ? release : null;
    input?.focus();
  }

  function confirmDineInNotesAndSend(notes) {
    applyDineInOrderNotes(notes);
    closeDineInNotesModal();
    handleSendOrder();
  }

  function initDineInNotesModal() {
    if (dineInNotesBound) return;
    dineInNotesBound = true;
    const form = document.getElementById('dinein-notes-form');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const notes = String(document.getElementById('dinein-notes-input')?.value || '').trim();
      confirmDineInNotesAndSend(notes);
    });
    document.getElementById('dinein-notes-cancel')?.addEventListener('click', closeDineInNotesModal);
    document.getElementById('dinein-notes-backdrop')?.addEventListener('click', closeDineInNotesModal);
  }

  function isDeliveryContext() {
    const ctx = window.LechaimOrderContext || {};
    return String(ctx.fulfillmentType || '') === 'delivery'
      && (ctx.orderType === 'takeaway' || isButcherContext());
  }

  let deliveryMinOrderFocusTrapRelease = null;

  function closeDeliveryMinOrderModal() {
    const modal = document.getElementById('delivery-min-order-modal');
    if (!modal) return;
    if (typeof deliveryMinOrderFocusTrapRelease === 'function') deliveryMinOrderFocusTrapRelease();
    deliveryMinOrderFocusTrapRelease = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('app-confirm-open');
  }

  function showDeliveryMinOrderModal() {
    const modal = document.getElementById('delivery-min-order-modal');
    const textEl = document.getElementById('delivery-min-order-text');
    const okBtn = document.getElementById('delivery-min-order-ok');
    if (!modal) {
      showOrderFeedback('err', t('deliveryMinOrder'));
      return;
    }
    if (textEl) textEl.textContent = t('deliveryMinOrder');
    if (okBtn) okBtn.textContent = t('gotIt');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-confirm-open');
    if (typeof deliveryMinOrderFocusTrapRelease === 'function') deliveryMinOrderFocusTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(modal);
    deliveryMinOrderFocusTrapRelease = typeof release === 'function' ? release : null;
    okBtn?.focus();
  }

  function initDeliveryMinOrderModal() {
    const okBtn = document.getElementById('delivery-min-order-ok');
    const backdrop = document.getElementById('delivery-min-order-backdrop');
    if (okBtn?.dataset.bound === '1') return;
    if (okBtn) okBtn.dataset.bound = '1';
    okBtn?.addEventListener('click', closeDeliveryMinOrderModal);
    backdrop?.addEventListener('click', closeDeliveryMinOrderModal);
  }

  function closeDeliveryFeeModal() {
    const modal = document.getElementById('delivery-fee-modal');
    if (!modal) return;
    if (typeof deliveryFeeFocusTrapRelease === 'function') deliveryFeeFocusTrapRelease();
    deliveryFeeFocusTrapRelease = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('app-confirm-open');
  }

  function showDeliveryFeeModal() {
    const modal = document.getElementById('delivery-fee-modal');
    const textEl = document.getElementById('delivery-fee-text');
    const okBtn = document.getElementById('delivery-fee-ok');
    if (!modal || !isDeliveryContext()) return;

    if (textEl) textEl.textContent = t('deliveryFeeNotice');
    if (okBtn) okBtn.textContent = t('gotIt');

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-confirm-open');

    if (typeof deliveryFeeFocusTrapRelease === 'function') deliveryFeeFocusTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(modal);
    deliveryFeeFocusTrapRelease = typeof release === 'function' ? release : null;
    okBtn?.focus();
  }

  function initDeliveryFeeModal() {
    const okBtn = document.getElementById('delivery-fee-ok');
    const backdrop = document.getElementById('delivery-fee-backdrop');
    if (okBtn?.dataset.bound === '1') return;
    if (okBtn) okBtn.dataset.bound = '1';
    okBtn?.addEventListener('click', closeDeliveryFeeModal);
    backdrop?.addEventListener('click', closeDeliveryFeeModal);
  }

  function maybeShowDeliveryFeeNotice() {
    if (!isDeliveryContext()) {
      closeDeliveryFeeModal();
      deliveryFeeShownThisVisit = false;
      return;
    }
    if (deliveryFeeShownThisVisit) return;
    deliveryFeeShownThisVisit = true;
    showDeliveryFeeModal();
  }

  function syncButcherModeUi() {
    const butcher = isButcherContext();
    document.body.classList.toggle('butcher-mode', butcher);

    const titleEl = document.querySelector('[data-i18n="heroTitle"]');
    const welcomeEl = document.querySelector('[data-i18n="heroWelcome"]');
    const kosherEl = document.querySelector('[data-i18n="heroKosher"]');
    const desc = document.getElementById('butcher-hero-desc');

    if (butcher) {
      /* Order: shop title → kashrut line → description */
      if (titleEl) titleEl.textContent = t('butcherHeroTitle');
      if (welcomeEl) {
        welcomeEl.textContent = '';
        welcomeEl.hidden = true;
      }
      if (kosherEl) {
        kosherEl.hidden = false;
        kosherEl.textContent = t('butcherHeroSubtitle');
      }
      if (desc) {
        desc.hidden = false;
        desc.innerHTML = String(t('butcherHeroDesc') || '')
          .split('\n')
          .filter(Boolean)
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join('');
      }
    } else {
      if (titleEl) titleEl.textContent = t('heroTitle');
      if (welcomeEl) {
        welcomeEl.hidden = false;
        welcomeEl.textContent = t('heroWelcome');
      }
      if (kosherEl) {
        kosherEl.hidden = false;
        kosherEl.textContent = t('heroKosher');
      }
      if (desc) {
        desc.hidden = true;
        desc.innerHTML = '';
      }
    }
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
    if (remoteSessionTotalOverride != null && Number.isFinite(remoteSessionTotalOverride)) {
      return Math.max(0, Number(remoteSessionTotalOverride));
    }
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
    refreshOrderingHoursUi();
    syncButcherModeUi();
    maybeShowDeliveryFeeNotice();
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

  function getShakeBaseItems() {
    return window.SHAKE_BASE_ITEMS || [];
  }

  function getLimonanaAlcoholItems() {
    return window.LIMONANA_ALCOHOL_ITEMS || [];
  }

  function getHamburgerDrinkItems() {
    const ids = window.HAMBURGER_DRINK_IDS;
    if (!ids || typeof ids.forEach !== 'function') return [];
    const out = [];
    ids.forEach((id) => {
      const item = findItem(id);
      if (item) out.push(item);
    });
    return out;
  }

  function findItem(itemId) {
    for (const category of MENU_DATA.categories) {
      const item = getCategoryItems(category).find((i) => i.id === itemId);
      if (item) return item;
    }
    const hot = HOT_SIDE_ITEMS.find((item) => item.id === itemId);
    if (hot) return hot;
    return getShakeBaseItems().find((item) => item.id === itemId)
      || getLimonanaAlcoholItems().find((item) => item.id === itemId)
      || null;
  }

  function getSideQtyForMain(mainLineId, sideItemId) {
    const line = cartLines.find(
      (l) => l.linkedToMainLineId === mainLineId && l.itemId === sideItemId
    );
    return line ? line.qty : 0;
  }

  function addSideToMainLine(mainLineId, sideItemId) {
    /* Shake bases / limonana alcohol are always available options (not inventory SKUs). */
    if (!isShakeBase(sideItemId) && !isLimonanaAlcoholOption(sideItemId) && !isProductAvailable(sideItemId)) {
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

  function isFruitShake(itemId) {
    return itemId === (window.FRUIT_SHAKE_ID || 'fruit-shake');
  }

  function isLimonana(itemId) {
    return itemId === (window.LIMONANA_ID || 'limonana');
  }

  function isHamburgerMeal(itemId) {
    return itemId === (window.HAMBURGER_MEAL_ID || 'hamburger-fries');
  }

  function isShakeBase(itemId) {
    return Boolean(window.SHAKE_BASE_IDS?.has?.(itemId));
  }

  function isLimonanaAlcoholOption(itemId) {
    return Boolean(window.LIMONANA_ALCOHOL_IDS?.has?.(itemId));
  }

  function isHamburgerDrinkOption(itemId) {
    return Boolean(window.HAMBURGER_DRINK_IDS?.has?.(itemId));
  }

  /** Linked option under a parent line (hot side, shake base, meal drink, or limonana alcohol). */
  function isLinkedOption(itemId) {
    return isHotSide(itemId) || isShakeBase(itemId) || isLimonanaAlcoholOption(itemId);
  }

  function isParentWithOptions(itemId) {
    return isMainCourse(itemId) || isFruitShake(itemId) || isHamburgerMeal(itemId) || isLimonana(itemId);
  }

  function isRequiredPickParent(itemId) {
    return isFruitShake(itemId) || isHamburgerMeal(itemId) || isLimonana(itemId);
  }

  function getPickerOptionsForParent(parentItemId) {
    if (isFruitShake(parentItemId)) return getShakeBaseItems();
    if (isHamburgerMeal(parentItemId)) return getHamburgerDrinkItems();
    if (isLimonana(parentItemId)) return getLimonanaAlcoholItems();
    return getHotSideItems();
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

    if (isParentWithOptions(line.itemId)) {
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

      if (isParentWithOptions(line.itemId)) {
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
    hideOrderFeedback();
    refreshOrderingHoursUi();
    initDineInOrdersClosedWatch();
    initDeliveryFeeModal();
    initDeliveryMinOrderModal();
    initButcherCheckoutModal();
    initTakeawayCheckoutModal();
    initDineInNotesModal();
    syncButcherModeUi();
    maybeShowDeliveryFeeNotice();
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

  let recommendedTodayShownForEntry = false;
  let recommendedTodayWaitTimer = null;
  let recommendedTodayPollTimer = null;

  function stopRecommendedTodayWait() {
    window.clearTimeout(recommendedTodayWaitTimer);
    recommendedTodayWaitTimer = null;
    window.clearInterval(recommendedTodayPollTimer);
    recommendedTodayPollTimer = null;
  }

  function isBlockingPromoModalOpen() {
    if (document.body.classList.contains('app-confirm-open')) return true;
    if (kitchenCloseModal && !kitchenCloseModal.hidden) return true;
    const notes = document.getElementById('dinein-notes-modal');
    if (notes && !notes.hidden) return true;
    return false;
  }

  async function maybeShowRecommendedToday() {
    stopRecommendedTodayWait();
    recommendedTodayShownForEntry = false;
    if (isButcherContext()) return;

    const api = window.LechaimSupabaseOrders;
    if (typeof api?.getRecommendedTodayProductId !== 'function') return;

    let productId = null;
    try {
      if (typeof window.LechaimInventory?.load === 'function') {
        await window.LechaimInventory.load();
      }
      productId = await api.getRecommendedTodayProductId();
    } catch (err) {
      console.warn('[recommended-today] load failed', err);
      return;
    }

    if (!productId) return;
    const item = findItem(productId);
    if (!item || !isMenuItemVisible(item)) return;

    const tryOpen = () => {
      if (recommendedTodayShownForEntry) return true;
      if (isBlockingPromoModalOpen()) return false;
      if (foodModal && !foodModal.hidden) return false;
      recommendedTodayShownForEntry = true;
      openFoodModalById(productId, { recommendedToday: true });
      return true;
    };

    recommendedTodayWaitTimer = window.setTimeout(() => {
      if (tryOpen()) return;
      const startedAt = Date.now();
      recommendedTodayPollTimer = window.setInterval(() => {
        if (tryOpen() || Date.now() - startedAt > 25000) {
          stopRecommendedTodayWait();
        }
      }, 400);
    }, 650);
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

    const browseOnly = Boolean(options.browseOnly);

    const startType = browseOnly ? null : (options.orderType || null);
    const startHasCustomer = startType === 'takeaway' || startType === 'butcher';

    window.LechaimOrderContext = {
      browseOnly,
      orderType: startType,
      tableNumber: browseOnly || startType === 'takeaway' || startType === 'butcher'
        ? null
        : (options.tableNumber != null ? Number(options.tableNumber) : null),
      lang: currentLang,
      sessionId: browseOnly ? null : (options.sessionId || null),
      openedAt: browseOnly ? null : (options.openedAt || null),
      status: browseOnly ? null : (options.status || null),
      customerName: !browseOnly && startHasCustomer ? (options.customerName || '') : null,
      customerPhone: !browseOnly && startHasCustomer ? (options.customerPhone || '') : null,
      customerNotes: !browseOnly && (startHasCustomer || startType === 'dine-in')
        ? (options.customerNotes || '')
        : null,
      dineInNotesConfirmed: !browseOnly && startType === 'dine-in'
        ? Boolean(options.dineInNotesConfirmed)
        : false,
      customerAddress: !browseOnly && (startType === 'takeaway' || startType === 'butcher')
        ? (options.customerAddress || '')
        : null,
      fulfillmentType: !browseOnly && (startType === 'takeaway' || startType === 'butcher')
        ? (options.fulfillmentType === 'delivery' ? 'delivery' : 'pickup')
        : null,
      deliveryFee: !browseOnly && (startType === 'takeaway' || startType === 'butcher')
        ? (options.fulfillmentType === 'delivery'
          ? (Number.isFinite(Number(options.deliveryFee)) && Number(options.deliveryFee) >= 0
            ? Number(options.deliveryFee)
            : (startType === 'butcher' ? getButcherDeliveryFee() : getTakeawayDeliveryFee()))
          : null)
        : null,
      pickupType: !browseOnly && (startType === 'takeaway' || startType === 'butcher')
        ? (options.pickupType || (startType === 'takeaway' ? 'ASAP' : null))
        : null,
      pickupTime: !browseOnly && (startType === 'takeaway' || startType === 'butcher')
        ? (options.pickupTime || null)
        : null,
      pickupDate: !browseOnly && (startType === 'takeaway' || startType === 'butcher')
        ? (options.pickupDate || null)
        : null,
      publicOrderNo: !browseOnly && startType === 'takeaway'
        ? (options.publicOrderNo != null ? Number(options.publicOrderNo) : null)
        : null,
    };

    /* Do not create an empty open order on table entry — only after first send. */

    init();
    scrollToHeroWelcome();
    restoreTakeawayLockIfNeeded();
    refreshOrderingHoursUi();
    /* Every dine-in menu entry while countdown/closed is active → customer modal */
    maybeShowKitchenModalForDineInEntry({ force: true });
    if (isDineInCountdownActive()) startKitchenCloseTicker();
    maybeShowRecommendedToday();

    if (browseOnly) return;

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
    const isButcher = orderType === 'butcher';
    const hasCustomer = isTakeaway || isButcher;
    const nextTable = isTakeaway || isButcher
      ? null
      : (options.tableNumber !== undefined
        ? (options.tableNumber != null ? Number(options.tableNumber) : null)
        : prev.tableNumber);

    const tableChanged = !isTakeaway && !isButcher &&
      options.tableNumber !== undefined &&
      Number(nextTable) !== Number(prev.tableNumber);
    const typeChanged = options.orderType != null && options.orderType !== prev.orderType;
    const nextFulfillment = (isTakeaway || isButcher)
      ? (options.fulfillmentType !== undefined
        ? normalizeFulfillmentType(options.fulfillmentType)
        : normalizeFulfillmentType(prev.fulfillmentType))
      : null;
    const fulfillmentChanged = Boolean(
      (isTakeaway || isButcher)
      && options.fulfillmentType !== undefined
      && nextFulfillment !== normalizeFulfillmentType(prev.fulfillmentType)
    );
    const nextSessionId = options.sessionId !== undefined ? options.sessionId : prev.sessionId;
    const sessionChanged = options.sessionId !== undefined
      && String(options.sessionId || '') !== String(prev.sessionId || '');

    window.LechaimOrderContext = {
      browseOnly: options.browseOnly !== undefined ? Boolean(options.browseOnly) : Boolean(prev.browseOnly),
      orderType,
      tableNumber: nextTable,
      lang: options.lang || prev.lang || currentLang,
      sessionId: nextSessionId,
      openedAt: options.openedAt !== undefined ? options.openedAt : prev.openedAt,
      status: options.status !== undefined ? options.status : prev.status,
      customerName: hasCustomer
        ? (options.customerName !== undefined ? options.customerName : prev.customerName)
        : null,
      customerPhone: hasCustomer
        ? (options.customerPhone !== undefined ? options.customerPhone : prev.customerPhone)
        : null,
      customerNotes: (hasCustomer || (!isTakeaway && !isButcher))
        ? (tableChanged && !hasCustomer
          ? ''
          : (options.customerNotes !== undefined ? options.customerNotes : (prev.customerNotes || '')))
        : null,
      dineInNotesConfirmed: (!isTakeaway && !isButcher)
        ? (tableChanged
          ? false
          : (options.dineInNotesConfirmed !== undefined
            ? Boolean(options.dineInNotesConfirmed)
            : Boolean(prev.dineInNotesConfirmed)))
        : false,
      customerAddress: (isTakeaway || isButcher)
        ? (options.customerAddress !== undefined ? options.customerAddress : (prev.customerAddress || ''))
        : null,
      fulfillmentType: nextFulfillment,
      deliveryFee: (isTakeaway || isButcher)
        ? (options.deliveryFee !== undefined
          ? (Number.isFinite(Number(options.deliveryFee)) && Number(options.deliveryFee) >= 0
            ? Number(options.deliveryFee)
            : null)
          : (prev.deliveryFee != null ? Number(prev.deliveryFee) : null))
        : null,
      pickupType: isTakeaway
        ? (options.pickupType !== undefined
          ? options.pickupType
          : (prev.pickupType || 'ASAP'))
        : (isButcher
          ? (options.pickupType !== undefined ? options.pickupType : prev.pickupType)
          : null),
      pickupTime: (isTakeaway || isButcher)
        ? (options.pickupTime !== undefined ? options.pickupTime : prev.pickupTime)
        : null,
      pickupDate: (isTakeaway || isButcher)
        ? (options.pickupDate !== undefined ? options.pickupDate : prev.pickupDate)
        : null,
      publicOrderNo: isTakeaway
        ? (options.publicOrderNo !== undefined
          ? (options.publicOrderNo != null ? Number(options.publicOrderNo) : null)
          : (sessionChanged ? null : prev.publicOrderNo))
        : null,
      takeawayLocked: false,
    };

    if (sessionChanged || typeChanged) {
      clearTakeawayLock();
    }

    if (typeChanged || fulfillmentChanged) {
      /*
       * Switch cart context without deleting the other cart:
       * dine-in / pickup / delivery / butcher each keep their own key.
       */
      const prevKey = getCartStorageKey(prev.orderType, prev.fulfillmentType);
      const nextKey = getCartStorageKey(orderType, nextFulfillment);
      if (prevKey !== nextKey) {
        if (cartLines.length || cartLineOrder.length) {
          writeCartToKey(prevKey, cartLines, cartLineOrder);
        }
        applyCartState(readCartFromKey(nextKey));
      }
      /* Brand-new session for this fulfillment → empty cart (keep the other key). */
      if (sessionChanged) {
        clearActiveCartMemoryAndStorage();
      }
    } else if (tableChanged || sessionChanged) {
      /* Same order family — clear only the active cart (e.g. new dine-in table). */
      clearActiveCartMemoryAndStorage();
    }

    /* Do not create empty open orders when browsing / switching tables. */

    updateTableHeader();
    restoreTakeawayLockIfNeeded();
    refreshOrderingHoursUi();
    syncButcherModeUi();
    maybeShowDeliveryFeeNotice();
    if (appStarted) {
      if (typeChanged) {
        rebuildNavigation();
        rebuildMenu(true);
      }
      renderCart();
    }
    scrollToHeroWelcome();
    /* Re-entering dine-in menu → show remaining-time modal again */
    if (isDineInContext()) {
      maybeShowKitchenModalForDineInEntry({ force: true });
      if (isDineInCountdownActive()) startKitchenCloseTicker();
    }
  }

  function updateTableHeader() {
    const tableBtn = $('#table-toggle');
    const numEl = $('#table-number');
    const backBtn = $('#order-back-toggle');
    if (!tableBtn || !numEl) return;

    const ctx = window.LechaimOrderContext || {};
    if (ctx.browseOnly) {
      tableBtn.hidden = true;
      numEl.textContent = '—';
      if (backBtn) {
        backBtn.hidden = false;
        backBtn.setAttribute('aria-label', t('backToOrderTypeAria'));
      }
      return;
    }

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
      /* After first takeaway send — stay on menu until Admin closes the order. */
      const isButcher = isButcherContext();
      const showBack = isButcher || (isTakeaway && !isTakeawayOrderLocked());
      backBtn.hidden = !showBack;
      if (showBack) {
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
        if (isTakeawayOrderLocked()) {
          showCartToast(t('takeawayLockedToast'));
          return;
        }
        if (typeof window.LechaimEntryGate?.reopenOrderTypePicker === 'function') {
          window.LechaimEntryGate.reopenOrderTypePicker();
        }
      });
    }
  }

  window.LechaimMenu = {
    start: startApp,
    updateOrderContext,
    isOrderingAllowed,
    maybeShowRecommendedToday,
    notifyTableLocked() {
      showOrderFeedback('err', t('tableChangeLocked'));
    },
    returnToEntry: returnCustomerToEntryGate,
  };

  function isProductAvailable(itemId) {
    if (!window.LechaimInventory) return true;
    return LechaimInventory.isAvailable(itemId);
  }

  function isProductRecommended(itemId) {
    if (!window.LechaimInventory?.isRecommended) return false;
    return LechaimInventory.isRecommended(itemId) === true;
  }

  function recommendedRibbonHtml() {
    return `<span class="food-ribbon">${escapeHtml(t('recommended'))}</span>`;
  }

  function syncFoodCardRecommended(article, itemId) {
    if (!article) return;
    const on = isProductRecommended(itemId);
    article.classList.toggle('food-card--recommended', on);
    const existing = article.querySelector('.food-ribbon');
    if (on && !existing) {
      article.insertAdjacentHTML('afterbegin', recommendedRibbonHtml());
    } else if (!on && existing) {
      existing.remove();
    } else if (on && existing) {
      existing.textContent = t('recommended');
    }
  }

  function syncAllRecommendedBadges() {
    $$('.food-card[data-item-id]').forEach((article) => {
      syncFoodCardRecommended(article, article.dataset.itemId);
    });
  }

  /** Customer menu: hide out-of-stock dishes entirely (admin toggle brings them back in place). */
  function isMenuItemVisible(item) {
    if (!item || item.adminOnly) return false;
    if (item.dineInOnly && (isTakeawayContext() || isButcherContext())) return false;
    return isProductAvailable(item.id);
  }

  function findCatalogListForItem(itemId) {
    const id = String(itemId || '');
    if (!id) return null;
    for (const cat of MENU_DATA.categories) {
      if ((cat.items || []).some((item) => String(item.id) === id)) {
        return {
          categoryId: cat.id,
          items: cat.items || [],
          isSubsection: false,
          subIndex: -1,
        };
      }
      const subs = cat.subsections || [];
      for (let i = 0; i < subs.length; i += 1) {
        if ((subs[i].items || []).some((item) => String(item.id) === id)) {
          return {
            categoryId: cat.id,
            items: subs[i].items || [],
            isSubsection: true,
            subIndex: i,
          };
        }
      }
    }
    return null;
  }

  function findFoodListElement(ctx) {
    if (!ctx?.categoryId) return null;
    const section = document.getElementById(ctx.categoryId);
    if (!section) return null;
    if (!ctx.isSubsection) {
      return section.querySelector(':scope > ul.food-list');
    }
    const subs = section.querySelectorAll(':scope > .menu-subsection');
    const sub = subs[ctx.subIndex];
    return sub ? sub.querySelector(':scope > ul.food-list') : null;
  }

  function rebuildFoodListContaining(itemId) {
    const ctx = findCatalogListForItem(itemId);
    if (!ctx) return;

    let listEl = findFoodListElement(ctx);
    const section = document.getElementById(ctx.categoryId);
    if (!listEl) {
      /* List was empty (all hidden) — recreate it in the right place */
      if (!section) {
        rebuildMenu(true);
        return;
      }
      listEl = document.createElement('ul');
      listEl.className = 'food-list';
      listEl.setAttribute('role', 'list');
      if (!ctx.isSubsection) {
        const header = section.querySelector(':scope > .category-header');
        if (header?.nextSibling) section.insertBefore(listEl, header.nextSibling);
        else section.appendChild(listEl);
      } else {
        const sub = section.querySelectorAll(':scope > .menu-subsection')[ctx.subIndex];
        if (!sub) {
          rebuildMenu(true);
          return;
        }
        sub.appendChild(listEl);
      }
    }

    const frag = document.createDocumentFragment();
    ctx.items.forEach((item) => {
      if (!isMenuItemVisible(item)) return;
      frag.appendChild(createFoodCard(item));
    });
    listEl.replaceChildren(frag);

    const sectionVisible = section?.classList.contains('is-visible');
    listEl.querySelectorAll('.food-card').forEach((card) => {
      if (sectionVisible) card.classList.add('is-visible');
      else if (revealObserver) revealObserver.observe(card);
    });
  }

  function syncMenuItemVisibility(itemId) {
    if (!itemId) return;
    const item = findItem(itemId);
    if (!item || item.adminOnly) return;

    if (!isProductAvailable(itemId)) {
      document.querySelectorAll(`.food-card[data-item-id="${CSS.escape(itemId)}"]`).forEach((article) => {
        article.closest('.food-item')?.remove();
      });
      if (openModalItemId === itemId) closeFoodModal();
      if (isHotSide(itemId)) refreshSidesModal();
      return;
    }

    rebuildFoodListContaining(itemId);
    if (isHotSide(itemId)) refreshSidesModal();
  }

  function syncAllMenuItemVisibility() {
    MENU_DATA.categories.forEach((cat) => {
      (cat.items || []).forEach((item) => {
        if (item?.adminOnly) return;
        /* Rebuild once per list via first item id — handled below by category lists */
      });
      if ((cat.items || []).length) {
        const first = (cat.items || []).find((item) => item && !item.adminOnly);
        if (first) rebuildFoodListContaining(first.id);
      }
      (cat.subsections || []).forEach((sub) => {
        const first = (sub.items || []).find((item) => item && !item.adminOnly);
        if (first) rebuildFoodListContaining(first.id);
      });
    });
  }

  function initInventory() {
    if (!window.LechaimInventory) return;

    const applyChange = (payload) => {
      const productId = typeof payload === 'string' ? payload : payload?.productId;
      const change = typeof payload === 'object' && payload?.change ? payload.change : 'availability';

      if (productId) {
        if (change === 'availability') {
          syncMenuItemVisibility(productId);
          if (openModalItemId === productId && isProductAvailable(productId)) {
            updateOpenFoodModal();
          }
          return;
        }
        if (change === 'recommended') {
          $$(`.food-card[data-item-id="${CSS.escape(productId)}"]`).forEach((article) => {
            syncFoodCardRecommended(article, productId);
          });
          return;
        }
        refreshFoodCardById(productId, { full: true });
        if (openModalItemId === productId) openFoodModalById(productId);
        if (isHotSide(productId)) refreshSidesModal();
        return;
      }

      syncAllMenuItemVisibility();
      syncAllRecommendedBadges();
      updateOpenFoodModal();
      refreshSidesModal();
    };

    LechaimInventory.load()
      .then(() => {
        syncAllMenuItemVisibility();
        syncAllRecommendedBadges();
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

    getVisibleCategories().forEach((cat) => {
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

    getVisibleCategories().forEach((cat) => {
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

    (items || []).forEach((item) => {
      if (!isMenuItemVisible(item)) return;
      list.appendChild(createFoodCard(item));
    });

    parent.appendChild(list);
  }

  function renderPackThawControls(item, { modal = false } = {}) {
    if (!isSoldByPack(item)) return '';
    const line = cartLines.find((l) => l.itemId === item.id && !l.linkedToMainLineId);
    if (!line || !(Number(line.qty) > 0)) return '';

    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    const thawCount = Math.min(Math.max(0, Math.floor(Number(line.thawCount) || 0)), qty);
    const wrapClass = modal ? 'food-pack-thaw food-pack-thaw--modal' : 'food-pack-thaw';

    if (qty <= 1) {
      const frozenChecked = thawCount < 1 ? ' checked' : '';
      const thawedChecked = thawCount >= 1 ? ' checked' : '';
      return `
        <div class="${wrapClass}" data-stop-modal="true">
          <label class="food-pack-thaw__check">
            <input
              type="checkbox"
              data-action="set-thaw"
              data-item-id="${escapeAttr(item.id)}"
              data-thaw-value="0"
              ${frozenChecked}
            >
            <span>${escapeHtml(t('frozenStateLabel'))}</span>
          </label>
          <label class="food-pack-thaw__check">
            <input
              type="checkbox"
              data-action="set-thaw"
              data-item-id="${escapeAttr(item.id)}"
              data-thaw-value="1"
              ${thawedChecked}
            >
            <span>${escapeHtml(t('thawedStateLabel'))}</span>
          </label>
        </div>
      `;
    }

    return `
      <div class="${wrapClass}" data-stop-modal="true">
        <p class="food-pack-thaw__label">${escapeHtml(t('thawPacksLabel'))}</p>
        <div class="food-qty-control food-qty-control--thaw">
          <button type="button" class="food-qty-btn" data-action="thaw-dec" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
          <span class="food-qty-value" aria-live="polite">${thawCount}</span>
          <button type="button" class="food-qty-btn" data-action="thaw-inc" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('increase'))}">+</button>
        </div>
      </div>
    `;
  }

  function renderCardActions(item) {
    const qty = getCartQtyForItem(item.id);
    const name = getItemName(item);
    const price = getItemPrice(item);

    /* Browse-only: name + price only — no cart actions / closed notes */
    if (window.LechaimOrderContext?.browseOnly) return '';

    if (!isOrderingAllowed()) {
      if (price == null) return '';
      return `
        <span class="food-order-closed-note" role="status">${escapeHtml(t('orderingClosedAction'))}</span>
      `;
    }

    if (qty > 0) {
      const byPack = isSoldByPack(item);
      return `
        <div class="food-card-actions__stack" data-stop-modal="true">
          <div class="food-pack-qty">
            ${byPack ? `<p class="food-pack-qty__label">${escapeHtml(t('packQtyControlLabel'))}</p>` : ''}
            <div class="food-qty-control">
          <button type="button" class="food-qty-btn" data-action="dec-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
          <span class="food-qty-value" aria-live="polite">${qty}</span>
          <button type="button" class="food-qty-btn" data-action="inc-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('increase'))}">+</button>
            </div>
          </div>
          ${renderPackThawControls(item)}
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
    const byWeight = isSoldByWeight(item);
    const byPack = !byWeight && isSoldByPack(item);
    const pricePerKg = getItemPricePerKg(item);
    const canAddToCart = price != null;
    const packRange = byPack ? getPackEstRange(pricePerKg, 1) : null;
    const priceHtml = canAddToCart && price > 0
      ? ((byWeight || byPack)
        ? `<span class="food-price food-price--per-kg">${escapeHtml(tReplace('perKg', { price: formatEuroTotal(pricePerKg) }))}</span>`
        : `<span class="food-price">${formatDishPrice(price)}</span>`)
      : '';
    const packMetaHtml = byPack
      ? `<div class="food-pack-meta">
           <span class="food-pack-weight">
             <span class="food-pack-weight__label">${escapeHtml(t('packWeightLabel'))}</span>
             <span class="food-pack-weight__value">${escapeHtml(t('packWeightValue'))}</span>
           </span>
           <span class="food-pack-est">
             <span class="food-pack-est__label">${escapeHtml(t('packEstPriceLabel'))}</span>
             <span class="food-pack-est__value">${escapeHtml(tReplace('packEstPrice', {
               min: formatEuroAmount(packRange.min),
               max: formatEuroAmount(packRange.max),
             }))}</span>
           </span>
         </div>`
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
         </div>`
      : '';

    const desc = getItemDesc(item);
    const descHtml = desc
      ? `<p class="food-desc">${escapeHtml(desc)}</p>`
      : '';

    const qty = getCartQtyForItem(item.id);
    const recommended = isProductRecommended(item.id);
    const cardClass = [
      'food-card',
      byWeight ? 'food-card--by-weight' : '',
      byPack ? 'food-card--by-pack' : '',
      hasImage ? '' : 'food-card--no-image',
      qty > 0 ? 'food-card--in-cart' : '',
      recommended ? 'food-card--recommended' : '',
    ].filter(Boolean).join(' ');

    return {
      cardClass,
      itemId: item.id,
      innerHtml: `
        ${recommended ? recommendedRibbonHtml() : ''}
        <div class="food-content">
          <div class="food-text">
            <div class="food-text-body">
              <h3 class="food-name">${formatDishNameHtml(item)}</h3>
              ${descHtml}
              <div class="food-meta">
                ${priceHtml}
                ${packMetaHtml}
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

      const actionBtn = event.target.closest('[data-action]')
        || event.target.closest('.food-pack-thaw__check')?.querySelector('[data-action]');
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
      const actionBtn = event.target.closest('[data-action]')
        || event.target.closest('.food-pack-thaw__check')?.querySelector('[data-action]');
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

    if ((action === 'add-to-cart' || action === 'inc-qty') && !isOrderingAllowed()) {
      showCartToast(t('orderingClosedToast'));
      return;
    }

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
      return;
    }

    if ((action === 'thaw-inc' || action === 'thaw-dec' || action === 'set-thaw') && itemId) {
      const line = cartLines.find((l) => l.itemId === itemId && !l.linkedToMainLineId);
      if (!line || !isCartPackLine(line)) return;
      if (action === 'set-thaw') {
        setItemThawCount(itemId, Number(btn.dataset.thawValue) || 0);
      } else {
        changeItemThawCount(itemId, action === 'thaw-inc' ? 1 : -1);
      }
    }
  }

  function renderModalActions(item) {
    const price = getItemPrice(item);
    if (price == null) return '';

    if (window.LechaimOrderContext?.browseOnly) return '';

    if (!isOrderingAllowed()) {
      return `
        <div class="food-modal-actions" data-stop-modal="true">
          <p class="food-modal-closed-note" role="status">${escapeHtml(t('orderingClosedAction'))}</p>
        </div>
      `;
    }

    const qty = getCartQtyForItem(item.id);

    if (qty > 0) {
      const byPack = isSoldByPack(item);
      return `
        <div class="food-modal-actions" data-stop-modal="true">
          <div class="food-pack-qty">
            ${byPack ? `<p class="food-pack-qty__label">${escapeHtml(t('packQtyControlLabel'))}</p>` : ''}
          <div class="food-qty-control food-qty-control--modal">
            <button type="button" class="food-qty-btn" data-action="dec-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('decrease'))}">−</button>
            <span class="food-qty-value" aria-live="polite">${qty}</span>
            <button type="button" class="food-qty-btn" data-action="inc-qty" data-item-id="${escapeAttr(item.id)}" aria-label="${escapeAttr(t('increase'))}">+</button>
          </div>
          </div>
          ${renderPackThawControls(item, { modal: true })}
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

  function openFoodModalById(itemId, options = {}) {
    const item = findItem(itemId);
    if (!item) return;
    if (!isProductAvailable(item.id)) {
      closeFoodModal();
      return;
    }

    openModalItemId = itemId;

    const desc = getItemDesc(item);
    const imageSrc = getItemImage(item);
    const price = getItemPrice(item);
    const spotlight = Boolean(options.recommendedToday);
    foodModal.classList.toggle('food-modal--today', spotlight);
    const imageHtml = imageSrc
      ? `<div class="food-modal-hero">
           <img
             class="food-modal-image"
             src="${escapeAttr(imageSrc)}"
             alt="${escapeAttr(getItemName(item))}"
             width="540"
             height="540"
             decoding="async"
             onerror="this.closest('.food-modal-hero')?.remove();"
           >
           ${spotlight ? `<p class="food-modal-kicker">${escapeHtml(t('recommendedToday'))}</p>` : ''}
         </div>`
      : '';

    const priceHtml = price != null
      ? `<p class="food-modal-price">${formatDishPrice(price)}</p>`
      : '';
    const kickerHtml = spotlight && !imageSrc
      ? `<p class="food-modal-kicker">${escapeHtml(t('recommendedToday'))}</p>`
      : '';

    foodModalBody.innerHTML = `
      <div class="food-modal-content" data-item-id="${escapeAttr(itemId)}">
        <article class="food-modal-card${spotlight ? ' food-modal-card--today' : ''}">
          ${imageHtml}
          <div class="food-modal-info">
            ${kickerHtml}
            <h2 id="food-modal-title" class="food-modal-title">${formatDishNameHtml(item)}</h2>
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
    setFocusTrap('food', foodModal);

    requestAnimationFrame(() => {
      foodModal.classList.add('is-open');
      foodModalClose.focus();
    });
  }

  function updateOpenFoodModal() {
    if (!openModalItemId || !foodModal || foodModal.hidden) return;

    const item = findItem(openModalItemId);
    if (!item) return;
    if (!isProductAvailable(item.id)) {
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
    if (existingActions) {
      existingActions.outerHTML = nextActions;
    } else if (nextActions) {
      card.insertAdjacentHTML('beforeend', nextActions);
    }
  }

  function closeFoodModal() {
    if (foodModal.hidden) return;

    openModalItemId = null;
    clearFocusTrap('food');
    foodModal.classList.remove('is-open', 'food-modal--today');
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

    const shakeMode = isFruitShake(mainLine.itemId);
    const drinkMode = isHamburgerMeal(mainLine.itemId);
    const limonanaMode = isLimonana(mainLine.itemId);
    const compactPicker = shakeMode || drinkMode || limonanaMode;
    const titleKey = shakeMode
      ? 'chooseShakeBaseTitle'
      : (drinkMode
        ? 'chooseDrinkTitle'
        : (limonanaMode ? 'chooseLimonanaAlcoholTitle' : 'chooseSidesTitle'));
    const subtitleKey = shakeMode
      ? 'chooseShakeBaseSubtitle'
      : (drinkMode
        ? 'chooseDrinkSubtitle'
        : (limonanaMode ? 'chooseLimonanaAlcoholSubtitle' : 'chooseSidesSubtitle'));
    const selectedCount = countSidesForMain(openSidesMainLineId);
    const cellsHtml = getPickerOptionsForParent(mainLine.itemId).map((side) => {
      const qty = getSideQtyForMain(openSidesMainLineId, side.id);
      const selected = qty > 0;
      const available = isProductAvailable(side.id);
      if (!available && !selected) return '';
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
          class="sides-picker-cell${selected ? ' is-selected' : ''}${hasImage ? '' : ' sides-picker-cell--no-image'}"
          data-action="toggle-side"
          data-item-id="${escapeAttr(side.id)}"
          aria-pressed="${selected ? 'true' : 'false'}"
        >
          ${imageHtml}
          <span class="sides-picker-name">${escapeHtml(getItemName(side))}</span>
          ${limonanaMode ? `<span class="sides-picker-price">${escapeHtml(formatPrice((getItemPrice(mainItem) || 0) + (Number(side.price) || 0)))}</span>` : ''}
          <span class="sides-picker-check" aria-hidden="true"></span>
        </button>
      `;
    }).join('');

    const continueDisabled = compactPicker && selectedCount < 1;
    sidesModalBody.innerHTML = `
      <div class="sides-modal-content${compactPicker ? ' sides-modal-content--shake' : ''}">
        <header class="sides-modal-header">
          <h2 id="sides-modal-title" class="sides-modal-title">${escapeHtml(t(titleKey))}</h2>
          <p class="sides-modal-subtitle">${escapeHtml(tReplace(subtitleKey, { name: getItemName(mainItem) }))}</p>
          <p class="sides-modal-count" aria-live="polite">${escapeHtml(tReplace('sidesSelected', { count: String(selectedCount) }))}</p>
        </header>
        <div class="sides-picker-table${compactPicker ? ' sides-picker-table--shake' : ''}" role="group" aria-label="${escapeAttr(t(titleKey))}">
          ${cellsHtml}
        </div>
        <footer class="sides-modal-footer">
          <button
            type="button"
            class="btn btn-primary sides-modal-continue"
            data-action="sides-continue"
            ${continueDisabled ? 'disabled' : ''}
          >
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
    setFocusTrap('sides', sidesModal);

    requestAnimationFrame(() => {
      sidesModal.classList.add('is-open');
      sidesModalClose?.focus();
    });
  }

  function closeSidesModal() {
    if (!sidesModal || sidesModal.hidden) return;

    const parentLineId = openSidesMainLineId;
    const parentLine = parentLineId ? findCartLine(parentLineId) : null;
    const mustPickOption = parentLine && isRequiredPickParent(parentLine.itemId);
    const hasPick = parentLineId ? countSidesForMain(parentLineId) > 0 : true;

    openSidesMainLineId = null;
    clearFocusTrap('sides');
    sidesModal.classList.remove('is-open');
    sidesModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    if (mustPickOption && !hasPick && parentLineId) {
      const parentItemId = parentLine.itemId;
      removeCartLine(parentLineId);
      saveCart();
      renderCart();
      refreshFoodCards(parentItemId);
      updateOpenFoodModal();
    }

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

    getHeroSlides().forEach((src, index) => {
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
      if (orderReceipt && !orderReceipt.hidden) {
        closeOrderReceipt();
        return;
      }
      if (appConfirm && !appConfirm.hidden) {
        closeAppConfirm();
        return;
      }
      const dineInNotesModal = document.getElementById('dinein-notes-modal');
      if (dineInNotesModal && !dineInNotesModal.hidden) {
        closeDineInNotesModal();
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
    myOrderToggle?.addEventListener('click', () => {
      const items = getActiveOrderReceiptItems();
      if (!items.length) return;
      showOrderReceipt(items, { viewing: true });
    });
    cartClose.addEventListener('click', closeCartPanel);
    cartBackdrop.addEventListener('click', closeCartPanel);
    cartClear?.addEventListener('click', handleClearCart);
    cartSend?.addEventListener('click', () => {
      handleSendOrder();
    });
    cartRequestBill?.addEventListener('click', openBillConfirm);
    appConfirmYes?.addEventListener('click', () => {
      const kind = appConfirmKind;
      const coupon = pendingBillCoupon;
      closeAppConfirm();
      if (kind === 'bill') handleRequestBill(coupon);
      if (kind === 'clear') confirmClearCart();
    });
    appConfirmCancel?.addEventListener('click', closeAppConfirm);
    appConfirmBackdrop?.addEventListener('click', closeAppConfirm);
    appConfirmCouponApply?.addEventListener('click', () => {
      applyCouponFromConfirm().catch((err) => {
        console.warn('[coupon] apply failed', err);
      });
    });
    appConfirmCouponInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      applyCouponFromConfirm().catch((err) => {
        console.warn('[coupon] apply failed', err);
      });
    });

    orderReceiptContinue?.addEventListener('click', closeOrderReceipt);
    orderReceiptNew?.addEventListener('click', startSeparateNewOrder);
    orderReceiptClose?.addEventListener('click', closeOrderReceipt);
    orderReceiptBackdrop?.addEventListener('click', closeOrderReceipt);

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
      } else if (btn.dataset.action === 'thaw-inc') {
        changeThawCount(lineId, 1);
      } else if (btn.dataset.action === 'thaw-dec') {
        changeThawCount(lineId, -1);
      }
    });
  }

  function hasActiveOrderItems() {
    const order = window.LechaimOrderEngine?.getOrder?.();
    return Boolean(order?.items?.some((item) => item && Number(item.qty) > 0));
  }

  function formatEuro(amount) {
    const n = Number(amount) || 0;
    return `€${n.toFixed(2)}`;
  }

  function getSessionSubtotal() {
    const order = window.LechaimOrderEngine?.getOrder?.();
    if (order && typeof window.LechaimOrderEngine.getOrderTotal === 'function') {
      return Number(window.LechaimOrderEngine.getOrderTotal(order)) || 0;
    }
    return (order?.items || []).reduce((sum, item) => (
      sum + (Number(item.price) || 0) * (Number(item.qty) || 0)
    ), 0);
  }

  function resetCouponConfirmUi() {
    pendingBillCoupon = null;
    if (appConfirmCouponInput) appConfirmCouponInput.value = '';
    if (appConfirmCouponStatus) {
      appConfirmCouponStatus.hidden = true;
      appConfirmCouponStatus.textContent = '';
      appConfirmCouponStatus.classList.remove('is-error');
    }
    if (appConfirmCouponTotals) {
      appConfirmCouponTotals.hidden = true;
      appConfirmCouponTotals.innerHTML = '';
    }
    if (appConfirmCouponApply) appConfirmCouponApply.disabled = false;
  }

  function setCouponConfirmVisible(show) {
    if (!appConfirmCoupon) return;
    appConfirmCoupon.hidden = !show;
    if (show) {
      if (appConfirmCouponLabel) appConfirmCouponLabel.textContent = t('couponAsk');
      if (appConfirmCouponApply) appConfirmCouponApply.textContent = t('couponApply');
      if (appConfirmCouponInput) {
        appConfirmCouponInput.placeholder = t('couponPlaceholder');
        appConfirmCouponInput.value = '';
      }
    }
  }

  function renderCouponTotals(coupon) {
    if (!appConfirmCouponTotals || !coupon) return;
    const discountLabel = t('couponDiscount').replace('{percent}', String(coupon.discountPercent));
    appConfirmCouponTotals.hidden = false;
    appConfirmCouponTotals.innerHTML = `
      <div>${escapeHtml(t('couponSubtotal'))}: ${escapeHtml(formatEuro(coupon.subtotal))}</div>
      <div>${escapeHtml(discountLabel)}: −${escapeHtml(formatEuro(coupon.discountAmount))}</div>
      <div><strong>${escapeHtml(t('couponPay'))}: ${escapeHtml(formatEuro(coupon.total))}</strong></div>
    `;
  }

  async function applyCouponFromConfirm() {
    if (appConfirmKind !== 'bill') return;
    const api = window.LechaimSupabaseOrders;
    const code = String(appConfirmCouponInput?.value || '').trim();
    if (!code) {
      pendingBillCoupon = null;
      if (appConfirmCouponStatus) {
        appConfirmCouponStatus.hidden = false;
        appConfirmCouponStatus.classList.add('is-error');
        appConfirmCouponStatus.textContent = t('couponFail');
      }
      if (appConfirmCouponTotals) {
        appConfirmCouponTotals.hidden = true;
        appConfirmCouponTotals.innerHTML = '';
      }
      return;
    }

    if (!api?.isConfigured?.() || typeof api.validateCoupon !== 'function') {
      if (appConfirmCouponStatus) {
        appConfirmCouponStatus.hidden = false;
        appConfirmCouponStatus.classList.add('is-error');
        appConfirmCouponStatus.textContent = t('couponFail');
      }
      return;
    }

    if (appConfirmCouponApply) appConfirmCouponApply.disabled = true;
    try {
      const validated = await api.validateCoupon(code);
      if (!validated?.discount_percent) {
        pendingBillCoupon = null;
        if (appConfirmCouponStatus) {
          appConfirmCouponStatus.hidden = false;
          appConfirmCouponStatus.classList.add('is-error');
          appConfirmCouponStatus.textContent = t('couponFail');
        }
        if (appConfirmCouponTotals) {
          appConfirmCouponTotals.hidden = true;
          appConfirmCouponTotals.innerHTML = '';
        }
        return;
      }

      const subtotal = getSessionSubtotal();
      const discountPercent = Number(validated.discount_percent) || 0;
      const discountAmount = Math.round((subtotal * discountPercent / 100) * 100) / 100;
      const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

      pendingBillCoupon = {
        code: String(validated.code || code),
        discountPercent,
        discountAmount,
        subtotal,
        total,
      };

      if (appConfirmCouponStatus) {
        appConfirmCouponStatus.hidden = false;
        appConfirmCouponStatus.classList.remove('is-error');
        appConfirmCouponStatus.textContent = t('couponOk').replace('{percent}', String(discountPercent));
      }
      renderCouponTotals(pendingBillCoupon);
    } catch (err) {
      console.warn('[coupon] validate failed', err);
      pendingBillCoupon = null;
      if (appConfirmCouponStatus) {
        appConfirmCouponStatus.hidden = false;
        appConfirmCouponStatus.classList.add('is-error');
        appConfirmCouponStatus.textContent = t('couponFail');
      }
    } finally {
      if (appConfirmCouponApply) appConfirmCouponApply.disabled = false;
    }
  }

  function openAppConfirm(kind, message, yesLabel, cancelLabel) {
    if (!appConfirm) return;
    appConfirmKind = kind;
    resetCouponConfirmUi();
    setCouponConfirmVisible(kind === 'bill');
    if (appConfirmText) appConfirmText.textContent = message;
    if (appConfirmYes) appConfirmYes.textContent = yesLabel;
    if (appConfirmCancel) appConfirmCancel.textContent = cancelLabel;
    appConfirm.hidden = false;
    appConfirm.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-confirm-open');
    setFocusTrap('confirm', appConfirm);
    requestAnimationFrame(() => {
      if (kind === 'bill' && appConfirmCouponInput && appConfirmCoupon && !appConfirmCoupon.hidden) {
        appConfirmCouponInput.focus();
      } else {
        appConfirmYes?.focus();
      }
    });
  }

  function closeAppConfirm() {
    if (!appConfirm) return;
    appConfirmKind = null;
    clearFocusTrap('confirm');
    appConfirm.hidden = true;
    appConfirm.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('app-confirm-open');
    resetCouponConfirmUi();
    setCouponConfirmVisible(false);
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
   * Dual-writes bill_requested (+ optional coupon) to Supabase.
   * @param {null|{ code: string, discountPercent: number, discountAmount: number, subtotal: number, total: number }} [coupon]
   */
  function handleRequestBill(coupon = null) {
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

      if (coupon?.code) {
        updated.couponCode = coupon.code;
        updated.discountPercent = coupon.discountPercent;
        updated.discountAmount = coupon.discountAmount;
        updated.subtotal = coupon.subtotal;
        updated.billTotal = coupon.total;
      }

      syncBillRequestedToSupabaseQuietly(session, order, coupon);
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
    writeCartToKey(activeCartStorageKey(), cartLines, cartLineOrder);
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

  function formatReceiptMoney(amount) {
    const n = Number(amount) || 0;
    return `€${n.toFixed(2)}`;
  }

  let receiptViewingMode = false;

  function closeOrderReceipt() {
    if (!orderReceipt) return;
    clearFocusTrap('receipt');
    orderReceipt.hidden = true;
    orderReceipt.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('order-receipt-open');
    receiptViewingMode = false;
  }

  function showOrderReceipt(waveItems, options = {}) {
    if (!orderReceipt) {
      showOrderFeedback('ok', t('orderSentSuccess'));
      return;
    }

    const ctx = window.LechaimOrderContext || {};
    const isTakeaway = ctx.orderType === 'takeaway' || ctx.orderType === 'take-away';
    const isButcher = ctx.orderType === 'butcher';
    receiptViewingMode = Boolean(options.viewing);
    const viewing = receiptViewingMode;
    const items = Array.isArray(waveItems) ? waveItems.filter((row) => row && Number(row.qty) > 0) : [];
    const total = items.reduce((sum, row) => (
      sum + (Number(row.price) || 0) * (Number(row.qty) || 0)
    ), 0);
    const publicOrderNo = Number(ctx.publicOrderNo);
    const hasOrderNo = isTakeaway && Number.isFinite(publicOrderNo) && publicOrderNo > 0;

    if (orderReceiptEyebrow) orderReceiptEyebrow.textContent = t('receiptEyebrow');
    if (orderReceiptTitle) {
      orderReceiptTitle.textContent = viewing ? t('myOrderView') : t('receiptTitle');
    }
    if (orderReceiptTotalLabel) orderReceiptTotalLabel.textContent = t('receiptTotal');
    if (orderReceiptContinue) {
      orderReceiptContinue.textContent = t('receiptContinue');
      /* Takeaway + dine-in: add to existing. Never offer a separate new takeaway order. */
      orderReceiptContinue.hidden = false;
    }
    if (orderReceiptNew) {
      orderReceiptNew.textContent = t('receiptNewOrder');
      orderReceiptNew.hidden = true;
    }
    if (orderReceiptClose) {
      orderReceiptClose.hidden = false;
      orderReceiptClose.setAttribute('aria-label', t('receiptClose'));
    }

    if (orderReceiptOrderNo) {
      if (hasOrderNo) {
        orderReceiptOrderNo.hidden = false;
        orderReceiptOrderNo.textContent = `${t('receiptOrderNo')} #${publicOrderNo}`;
      } else {
        orderReceiptOrderNo.hidden = true;
        orderReceiptOrderNo.textContent = '';
      }
    }

    if (orderReceiptRemember) {
      if (isTakeaway) {
        orderReceiptRemember.hidden = false;
        orderReceiptRemember.textContent = t('receiptRememberNo');
      } else {
        orderReceiptRemember.hidden = true;
        orderReceiptRemember.textContent = '';
      }
    }

    if (orderReceiptMeta) {
      if (isButcher) {
        const isDelivery = ctx.fulfillmentType === 'delivery';
        const bits = [t('receiptButcher')];
        if (ctx.customerName) bits.push(ctx.customerName);
        if (isDelivery) {
          bits.push(t('receiptButcherDelivery'));
          if (ctx.customerAddress) bits.push(String(ctx.customerAddress));
          const fee = Number.isFinite(Number(ctx.deliveryFee)) && Number(ctx.deliveryFee) >= 0
            ? Number(ctx.deliveryFee)
            : getButcherDeliveryFee();
          bits.push(t('receiptButcherDeliveryFee').replace('{price}', formatEuroAmount(fee)));
          if (ctx.pickupType === 'TIME' && ctx.pickupDate) {
            bits.push(t('receiptButcherPickupDate').replace(
              '{date}',
              formatButcherPickupDateDisplay(ctx.pickupDate)
            ));
            if (ctx.pickupTime) {
              bits.push(t('receiptButcherPickupTime').replace('{time}', String(ctx.pickupTime)));
            }
          }
        } else if (ctx.pickupType === 'TIME' && ctx.pickupDate) {
          bits.push(t('receiptButcherPickupDate').replace(
            '{date}',
            formatButcherPickupDateDisplay(ctx.pickupDate)
          ));
          if (ctx.pickupTime) {
            bits.push(t('receiptButcherPickupTime').replace('{time}', String(ctx.pickupTime)));
          }
        } else {
          bits.push(t('receiptButcherPickupAsap'));
        }
        orderReceiptMeta.textContent = bits.join(' · ');
      } else if (isTakeaway) {
        const pickup = ctx.pickupType === 'TIME' && ctx.pickupTime
          ? (
            ctx.pickupDate
              ? `${t('receiptButcherPickupDate').replace('{date}', formatButcherPickupDateDisplay(ctx.pickupDate))} · ${t('receiptButcherPickupTime').replace('{time}', String(ctx.pickupTime))}`
              : t('receiptPickupAt').replace('{time}', String(ctx.pickupTime))
          )
          : t('receiptPickupAsap');
        const bits = [t('receiptTakeaway')];
        if (ctx.customerName) bits.push(ctx.customerName);
        bits.push(pickup);
        orderReceiptMeta.textContent = bits.join(' · ');
      } else {
        orderReceiptMeta.textContent = t('receiptTable').replace(
          '{n}',
          ctx.tableNumber != null ? String(ctx.tableNumber) : '—'
        );
      }
    }

    if (orderReceiptBody) {
      if (!items.length) {
        orderReceiptBody.innerHTML = `<p class="order-receipt__empty">${escapeHtml(t('receiptEmpty'))}</p>`;
      } else {
        orderReceiptBody.innerHTML = `
          <ul class="order-receipt__list">
            ${items.map((item) => {
              const name = item.name || item.printName || item.productId || '';
              const lineTotal = (Number(item.price) || 0) * (Number(item.qty) || 0);
              return `
                <li class="order-receipt__line">
                  <span class="order-receipt__qty">${escapeHtml(String(item.qty))}×</span>
                  <span class="order-receipt__name">${escapeHtml(name)}</span>
                  <span class="order-receipt__price">${escapeHtml(formatReceiptMoney(lineTotal))}</span>
                </li>
              `;
            }).join('')}
          </ul>
        `;
      }
    }

    if (orderReceiptTotal) orderReceiptTotal.textContent = formatReceiptMoney(total);

    closeCartPanel();
    hideOrderFeedback();
    orderReceipt.hidden = false;
    orderReceipt.setAttribute('aria-hidden', 'false');
    document.body.classList.add('order-receipt-open');
    setFocusTrap('receipt', orderReceipt);
    orderReceiptContinue?.focus();
  }

  /**
   * Start a brand-new customer order without waiting for Admin to close the previous one.
   * Previous order stays open in Supabase / Admin.
   */
  function startSeparateNewOrder() {
    const ctx = window.LechaimOrderContext || {};
    const isTakeaway = ctx.orderType === 'takeaway' || ctx.orderType === 'take-away';
    /* Takeaway: one open order per phone until Admin closes it. */
    if (isTakeaway && isTakeawayOrderLocked()) {
      closeOrderReceipt();
      showCartToast(t('takeawayLockedToast'));
      return;
    }

    const localId = ctx.sessionId || window.LechaimOrderSession?.getSession?.()?.sessionId;
    const tableNumber = ctx.tableNumber != null ? Number(ctx.tableNumber) : null;

    closeOrderReceipt();
    closeCartPanel();

    try {
      if (localId) {
        const map = readSupabaseSessionMap();
        delete map[String(localId)];
        writeSupabaseSessionMap(map);
      }
    } catch (err) {
      console.warn('[new-order] session map clear failed', err);
    }

    try {
      const order = window.LechaimOrderEngine?.getOrder?.();
      if (order?.orderId) {
        window.LechaimOrderEngine.closeOrder?.({ orderId: order.orderId });
      } else if (!isTakeaway && tableNumber != null) {
        window.LechaimOrderEngine.closeTable?.(tableNumber);
      } else {
        window.LechaimOrderEngine.clearOrder?.();
      }
    } catch (err) {
      console.warn('[new-order] local order close failed', err);
    }

    try {
      window.LechaimOrderSession?.clearSession?.();
    } catch (err) {
      console.warn('[new-order] clearSession failed', err);
    }

    cartLines = [];
    cartLineOrder = [];
    lastMainLineId = null;
    remoteSessionTotalOverride = null;
    clearTakeawayLock();
    if (remoteTotalSyncTimer) {
      window.clearInterval(remoteTotalSyncTimer);
      remoteTotalSyncTimer = null;
    }
    writeCartToKey(activeCartStorageKey(), [], []);

    window.LechaimOrderContext = {
      orderType: null,
      tableNumber: null,
      lang: currentLang,
      sessionId: null,
      openedAt: null,
      status: null,
      customerName: null,
      customerPhone: null,
      customerNotes: null,
      pickupType: null,
      pickupTime: null,
      publicOrderNo: null,
    };

    updateTableHeader();
    renderCart();
    refreshFoodCards();

    if (typeof window.LechaimEntryGate?.resetToEntry === 'function') {
      window.LechaimEntryGate.resetToEntry();
    } else if (typeof window.LechaimEntryGate?.reopenOrderTypePicker === 'function') {
      window.LechaimEntryGate.reopenOrderTypePicker();
    }
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

  function hideOrderFeedback() {
    if (!orderFeedback) return;
    orderFeedback.classList.remove('is-visible', 'order-feedback--ok', 'order-feedback--err');
    orderFeedback.hidden = true;
    orderFeedback.innerHTML = '';
  }

  function showOrderFeedback(kind, message) {
    if (!orderFeedback || !message) return;

    orderFeedback.classList.remove('order-feedback--ok', 'order-feedback--err', 'is-visible');
    orderFeedback.classList.add(kind === 'ok' ? 'order-feedback--ok' : 'order-feedback--err');
    orderFeedback.innerHTML = `<span class="order-feedback__text">${escapeHtml(message)}</span>`;
    orderFeedback.hidden = false;

    requestAnimationFrame(() => {
      orderFeedback.classList.add('is-visible');
    });

    window.clearTimeout(orderFeedbackTimer);
    orderFeedbackTimer = window.setTimeout(() => {
      orderFeedback.classList.remove('is-visible');
      window.setTimeout(hideOrderFeedback, 280);
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
    const orderType = ctx.orderType === 'butcher'
      ? 'butcher'
      : (ctx.orderType === 'takeaway' || ctx.orderType === 'take-away'
        ? 'takeaway'
        : (ctx.orderType === 'dine-in' || ctx.orderType === 'dinein' || ctx.tableNumber != null
          ? 'dinein'
          : null));
    const lang = ctx.lang === 'en' || ctx.lang === 'he' ? ctx.lang : currentLang;

    if (orderType === 'butcher' && Session.startButcher) {
      session = Session.startButcher({
        lang,
        customerName: ctx.customerName || '',
        customerPhone: ctx.customerPhone || '',
        customerNotes: ctx.customerNotes || '',
        customerAddress: ctx.customerAddress || '',
        fulfillmentType: ctx.fulfillmentType === 'delivery' ? 'delivery' : 'pickup',
        deliveryFee: ctx.fulfillmentType === 'delivery'
          ? (Number.isFinite(Number(ctx.deliveryFee)) && Number(ctx.deliveryFee) >= 0
            ? Number(ctx.deliveryFee)
            : getButcherDeliveryFee())
          : null,
        pickupType: ctx.pickupType || null,
        pickupTime: ctx.pickupTime || null,
        pickupDate: ctx.pickupDate || null,
      });
    } else if (orderType === 'takeaway') {
      session = Session.startTakeaway({
        lang,
        customerName: ctx.customerName || '',
        customerPhone: ctx.customerPhone || '',
        customerNotes: ctx.customerNotes || '',
        customerAddress: ctx.customerAddress || '',
        fulfillmentType: ctx.fulfillmentType === 'delivery' ? 'delivery' : 'pickup',
        pickupType: ctx.pickupType || 'ASAP',
        pickupTime: ctx.pickupTime || null,
        pickupDate: ctx.pickupDate || null,
      });
    } else if (orderType === 'dinein' && Session.isValidTable?.(ctx.tableNumber)) {
      session = Session.startDineIn(Number(ctx.tableNumber), {
        lang,
        customerNotes: ctx.customerNotes || '',
        dineInNotesConfirmed: Boolean(ctx.dineInNotesConfirmed),
      });
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
    const isButcher = session.orderType === 'butcher' ||
      session.orderType === window.LechaimOrderSession?.ORDER_TYPE?.BUTCHER;

    updateOrderContext({
      orderType: isButcher ? 'butcher' : (isTakeaway ? 'takeaway' : 'dine-in'),
      tableNumber: isTakeaway || isButcher ? null : session.tableNumber,
      sessionId: session.sessionId,
      openedAt: session.openedAt,
      status: session.status,
      lang: session.lang || currentLang,
      customerName: isTakeaway || isButcher ? (session.customerName || '') : null,
      customerPhone: isTakeaway || isButcher ? (session.customerPhone || '') : null,
      customerNotes: session.customerNotes || '',
      dineInNotesConfirmed: !isTakeaway && !isButcher
        ? Boolean(session.dineInNotesConfirmed)
        : false,
      customerAddress: isTakeaway || isButcher ? (session.customerAddress || '') : null,
      fulfillmentType: isTakeaway || isButcher
        ? (session.fulfillmentType === 'delivery' ? 'delivery' : 'pickup')
        : null,
      deliveryFee: isTakeaway || isButcher
        ? (session.deliveryFee != null ? Number(session.deliveryFee) : null)
        : null,
      pickupType: isTakeaway
        ? (session.pickupType || 'ASAP')
        : (isButcher ? (session.pickupType || null) : null),
      pickupTime: isTakeaway || isButcher ? (session.pickupTime || null) : null,
      pickupDate: isTakeaway || isButcher ? (session.pickupDate || null) : null,
      publicOrderNo: isTakeaway
        ? (session.publicOrderNo != null ? Number(session.publicOrderNo) : null)
        : null,
    });
  }

  async function handleSendOrder() {
    if (isSendingOrder) return;

    if (!isOrderingAllowed()) {
      showOrderFeedback('err', t('orderingClosedToast'));
      return;
    }

    if (!cartLines.length) {
      showOrderFeedback('err', t('cartEmpty'));
      return;
    }

    if (!window.LechaimOrderEngine?.ensureActiveOrder) {
      console.error('[cart] Order engine missing');
      showOrderFeedback('err', t('orderSentFail'));
      return;
    }

    /* Delivery min order before customer details — products only, excl. €10 fee */
    if (isTakeawayDeliveryContext()) {
      const itemsTotal = getCartItemsSubtotal();
      const minOrder = getDeliveryMinOrder();
      if (itemsTotal + 1e-9 < minOrder) {
        showDeliveryMinOrderModal();
        return;
      }
    }

    /* Butcher / takeaway: collect details at checkout (after browsing the catalog). */
    if (isButcherContext() && !hasButcherCustomerDetails()) {
      openButcherCheckoutModal();
      return;
    }
    if (isTakeawayContext() && !hasTakeawayCustomerDetails()) {
      openTakeawayCheckoutModal();
      return;
    }
    if (isDineInContext() && !hasDineInNotesConfirmed()) {
      openDineInNotesModal();
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
              selectedWeight: product.selectedWeight,
              pricePerKg: product.pricePerKg,
              unitType: product.unitType,
              thawCount: product.thawCount,
            },
            Number(line.qty) || 1,
            product.notes || '',
            {
              /* Merge drinks/starters/butcher qty; keep mains separate. */
              allowMerge: !linkedToMainItemId
                && !isMainCourse(line.itemId)
                && !isRequiredPickParent(line.itemId),
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

      if (!waveItems.length) {
        console.error('[cart] no wave items to sync');
        showOrderFeedback('err', t('orderSentFail'));
        return;
      }

      /* Customer devices sync to Supabase only — restaurant PC prints. */
      await syncOrderToSupabase({
        localSession: session,
        localOrder: LechaimOrderEngine.getOrder?.() || order,
        waveItems,
      });

      const waveIds = waveItems.map((item) => item.itemId).filter(Boolean);
      if (waveIds.length && typeof LechaimOrderEngine.markPrinted === 'function') {
        LechaimOrderEngine.markPrinted(waveIds);
      }

      clearCartAfterSuccessfulSend();
      lockTakeawayAfterSend(waveItems);
      clearDineInNotesConfirmation();
      showOrderReceipt(waveItems);
      initRemoteSessionClosedWatcher();
      syncRemoteSessionTotal().catch(() => {});
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
    const ctxEarly = window.LechaimOrderContext || {};
    const rawTypeEarly = localOrder?.orderType || localSession?.orderType || ctxEarly.orderType;
    const typesApi = window.LechaimOrderTypes;
    const normalizedEarly = typesApi?.normalizeOrderType?.(rawTypeEarly, { warn: false })
      || (String(rawTypeEarly).toLowerCase().includes('take')
        ? 'takeaway'
        : (String(rawTypeEarly).toLowerCase().includes('butcher')
          ? 'butcher'
          : (String(rawTypeEarly).toLowerCase().includes('dine') ? 'dine_in' : null)));
    const isTakeawayEarly = normalizedEarly === 'takeaway';
    const isButcherEarly = normalizedEarly === 'butcher';
    if (map[localId]) {
      await ensurePublicOrderNoRemembered(map[localId], isTakeawayEarly);
      if (normalizedEarly === 'dine_in') {
        await syncDineInSessionNotes(map[localId]);
      }
      return map[localId];
    }

    const ctx = ctxEarly;
    const orderType = normalizedEarly === 'butcher'
      ? 'butcher'
      : (normalizedEarly === 'takeaway' ? 'takeaway' : 'dine_in');
    const isTakeawayResolved = orderType === 'takeaway';
    const isButcherResolved = orderType === 'butcher';
    const hasCustomer = isTakeawayResolved || isButcherResolved;
    const tableNumber = hasCustomer
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
        await syncDineInSessionNotes(existing.session_id);
        return existing.session_id;
      }
    }

    let created;
    try {
      created = await api.createSession({
        orderType,
        tableNumber: orderType === 'dine_in' ? tableNumber : null,
        language: currentLang,
        customerName: hasCustomer
          ? (localSession?.customerName || ctx.customerName || null)
          : null,
        customerPhone: hasCustomer
          ? (localSession?.customerPhone || ctx.customerPhone || null)
          : null,
        notes: hasCustomer
          ? (localSession?.customerNotes || ctx.customerNotes || null)
          : (orderType === 'dine_in'
            ? (String(localSession?.customerNotes || ctx.customerNotes || '').trim() || null)
            : null),
        customerAddress: (isTakeawayResolved || isButcherResolved)
          ? (localSession?.customerAddress || ctx.customerAddress || null)
          : null,
        fulfillmentType: (isTakeawayResolved || isButcherResolved)
          ? (
            (localSession?.fulfillmentType || ctx.fulfillmentType) === 'delivery'
              ? 'delivery'
              : 'pickup'
          )
          : null,
        deliveryFee: (isTakeawayResolved || isButcherResolved)
          ? (
            (localSession?.fulfillmentType || ctx.fulfillmentType) === 'delivery'
              ? (
                Number.isFinite(Number(localSession?.deliveryFee ?? ctx.deliveryFee))
                  && Number(localSession?.deliveryFee ?? ctx.deliveryFee) >= 0
                  ? Number(localSession?.deliveryFee ?? ctx.deliveryFee)
                  : (isButcherResolved ? getButcherDeliveryFee() : getTakeawayDeliveryFee())
              )
              : null
          )
          : undefined,
        pickupType: (isTakeawayResolved || isButcherResolved)
          ? (localSession?.pickupType || ctx.pickupType || (isTakeawayResolved ? 'ASAP' : null))
          : null,
        pickupTime: (isTakeawayResolved || isButcherResolved)
          ? (localSession?.pickupTime || ctx.pickupTime || null)
          : null,
        pickupDate: (isTakeawayResolved || isButcherResolved)
          ? (localSession?.pickupDate || ctx.pickupDate || null)
          : null,
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
          await syncDineInSessionNotes(existing.session_id);
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
    rememberPublicOrderNo(created.public_order_no);
    return created.session_id;
  }

  async function syncDineInSessionNotes(remoteSessionId) {
    if (!remoteSessionId) return;
    const ctx = window.LechaimOrderContext || {};
    const session = window.LechaimOrderSession?.getSession?.();
    const type = String(ctx.orderType || session?.orderType || '').toLowerCase();
    if (type !== 'dine-in' && type !== 'dinein' && type !== 'dine_in') return;
    if (!ctx.dineInNotesConfirmed && !session?.dineInNotesConfirmed) return;
    const api = window.LechaimSupabaseOrders;
    if (typeof api?.updateSessionStatus !== 'function') return;
    const notes = String(ctx.customerNotes || session?.customerNotes || '').trim();
    if (!notes) return;
    await api.updateSessionStatus(remoteSessionId, { notes });
  }

  function rememberPublicOrderNo(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;

    const prev = window.LechaimOrderContext || {};
    window.LechaimOrderContext = {
      ...prev,
      publicOrderNo: n,
    };

    try {
      window.LechaimOrderSession?.patchSession?.({ publicOrderNo: n });
    } catch (err) {
      console.warn('[order-no] failed to persist local session number', err);
    }
  }

  async function ensurePublicOrderNoRemembered(remoteSessionId, isTakeaway) {
    if (!isTakeaway || !remoteSessionId) return;
    const existing = Number(window.LechaimOrderContext?.publicOrderNo);
    if (Number.isFinite(existing) && existing > 0) return;

    const localNo = Number(window.LechaimOrderSession?.getSession?.()?.publicOrderNo);
    if (Number.isFinite(localNo) && localNo > 0) {
      rememberPublicOrderNo(localNo);
      return;
    }

    try {
      const api = window.LechaimSupabaseOrders;
      const remote = await api?.getSession?.(remoteSessionId);
      if (remote?.public_order_no != null) {
        rememberPublicOrderNo(remote.public_order_no);
      }
    } catch (err) {
      console.warn('[order-no] failed to load public_order_no', err);
    }
  }

  async function createSupabaseOrderItems(orderId, waveItems) {
    const api = window.LechaimSupabaseOrders;
    const list = Array.isArray(waveItems) ? waveItems : [];
    if (!list.length) return [];

    const mains = list.filter((item) => !item.linkedToMainItemId);
    const sides = list.filter((item) => item.linkedToMainItemId);
    const localToRemote = new Map();

    function resolveItemPrintName(item) {
      if (item?.printName != null && String(item.printName).trim()) {
        return String(item.printName).trim();
      }
      const catalog = findItem(item?.productId);
      if (catalog?.printName != null && String(catalog.printName).trim()) {
        return String(catalog.printName).trim();
      }
      return String(item?.name || item?.productId || '').trim() || 'Item';
    }

    function toPayload(item, parentRemoteId) {
      const payload = {
        productId: item.productId,
        productName: item.name || '',
        printName: resolveItemPrintName(item),
        quantity: Number(item.qty) || 1,
        price: Number(item.price) || 0,
        category: findProductCategoryId(item.productId)
          || (item.unitType === 'kg' || item.unitType === 'pack' ? 'butcher' : null),
        notes: item.notes || null,
        sideDish: null,
        parentItemId: parentRemoteId || null,
      };
      if (item.unitType === 'pack') {
        payload.unitType = 'pack';
        payload.price = 0;
        payload.pricePerKg = item.pricePerKg;
        payload.thawCount = Number.isFinite(Number(item.thawCount))
          ? Math.max(0, Math.floor(Number(item.thawCount)))
          : 0;
      } else if (item.unitType || item.selectedWeight != null || item.pricePerKg != null) {
        payload.unitType = item.unitType || 'kg';
        payload.selectedWeight = item.selectedWeight != null ? item.selectedWeight : 1;
        payload.pricePerKg = item.pricePerKg;
      }
      return payload;
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
    const normalized = window.LechaimOrderTypes?.normalizeOrderType?.(rawType, { warn: false });
    const isTakeaway = normalized === 'takeaway' || String(rawType).toLowerCase().includes('take');
    const isButcher = normalized === 'butcher' || String(rawType).toLowerCase().includes('butcher');
    if (isTakeaway || isButcher) return null;

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

  function syncBillRequestedToSupabaseQuietly(localSession, localOrder, coupon = null) {
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

        const patch = { status: 'bill_requested' };
        if (coupon?.code) {
          patch.couponCode = coupon.code;
          patch.discountPercent = coupon.discountPercent;
          patch.discountAmount = coupon.discountAmount;
          patch.subtotal = coupon.subtotal;
        }

        await api.updateSessionStatus(sessionId, patch);
        if (coupon?.code && typeof api.incrementCouponUse === 'function') {
          try {
            await api.incrementCouponUse(coupon.code);
          } catch (incErr) {
            console.warn('[dual-write] coupon use increment failed', incErr);
          }
        }
        console.log('Bill requested synced to Supabase', { sessionId, coupon: coupon?.code || null });
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
    const sessionOrderType = ctx.orderType
      || window.LechaimOrderSession?.getOrderType?.()
      || '';
    const wasTakeaway = sessionOrderType === 'takeaway'
      || sessionOrderType === 'take-away'
      || sessionOrderType === window.LechaimOrderSession?.ORDER_TYPE?.TAKEAWAY;
    const wasButcher = sessionOrderType === 'butcher'
      || String(sessionOrderType).toLowerCase().includes('butcher')
      || sessionOrderType === window.LechaimOrderSession?.ORDER_TYPE?.BUTCHER;

    remoteSessionTotalOverride = null;
    if (remoteTotalSyncTimer) {
      window.clearInterval(remoteTotalSyncTimer);
      remoteTotalSyncTimer = null;
    }
    clearTakeawayLock();

    try {
      if (wasTakeaway && window.LechaimOrderEngine?.closeTakeaway) {
        window.LechaimOrderEngine.closeTakeaway();
      } else if (wasButcher) {
        window.LechaimOrderEngine?.clearOrder?.();
      } else if (tableNumber != null && window.LechaimOrderEngine?.closeTable) {
        window.LechaimOrderEngine.closeTable(tableNumber);
      }
    } catch (err) {
      console.warn('[session-watch] local order close failed', err);
    }

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
      writeCartToKey(activeCartStorageKey(), [], []);
    } catch (err) {
      console.warn('[session-watch] cart clear failed', err);
    }

    window.LechaimOrderContext = {
      orderType: null,
      tableNumber: null,
      sessionId: null,
      openedAt: null,
      status: null,
      lang: currentLang,
      takeawayLocked: false,
      publicOrderNo: null,
      customerName: null,
      customerPhone: null,
      customerNotes: null,
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

    if (remoteTotalSyncTimer) {
      window.clearInterval(remoteTotalSyncTimer);
      remoteTotalSyncTimer = null;
    }

    const syncTotals = () => {
      syncRemoteSessionTotal(remoteId).catch((err) => {
        console.warn('[session-watch] total sync failed', err);
      });
    };

    syncTotals();
    remoteTotalSyncTimer = window.setInterval(syncTotals, 4000);

    try {
      sessionWatchUnsub = api.subscribeToOrders((payload) => {
        const table = payload?.table;
        if (table === 'order_sessions') {
          const row = payload.new || payload.payload?.new;
          if (!row || String(row.session_id) !== String(remoteId)) return;
          if (row.status === 'closed') {
            console.log('[session-watch] Realtime closed — returning to entry');
            returnCustomerToEntryGate();
          }
          return;
        }

        if (table === 'orders') {
          const row = payload.new || payload.old || payload.payload?.new || payload.payload?.old;
          if (row?.session_id != null && String(row.session_id) !== String(remoteId)) return;
          syncTotals();
          return;
        }

        if (table === 'order_items') {
          /* Item rows may lack session_id — refresh this session's full order. */
          syncTotals();
        }
      });
    } catch (err) {
      console.warn('[session-watch] subscribe failed', err);
    }
  }

  async function syncRemoteSessionTotal(remoteSessionId) {
    const api = window.LechaimSupabaseOrders;
    const localSessionId = window.LechaimOrderContext?.sessionId
      || window.LechaimOrderSession?.getSession?.()?.sessionId;
    const sessionId = remoteSessionId || lookupMappedSupabaseSessionId(localSessionId);
    if (!sessionId || !api?.getSessionOrders) return;

    const orders = await api.getSessionOrders(sessionId);
    let total = 0;
    const remoteItems = [];

    (orders || []).forEach((order) => {
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      lines.forEach((row) => {
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) return;
        total += (Number(row.price) || 0) * qty;
        remoteItems.push({
          itemId: String(row.id),
          remoteItemId: String(row.id),
          productId: String(row.product_id || ''),
          name: row.product_name || row.print_name || row.product_id || '',
          printName: row.print_name || '',
          price: Number(row.price) || 0,
          qty,
          notes: row.notes == null ? '' : String(row.notes),
          printed: true,
          linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
          createdAt: row.created_at || null,
        });
      });
    });

    remoteSessionTotalOverride = Math.round(total * 100) / 100;

    try {
      const ctx = window.LechaimOrderContext || {};
      if (typeof window.LechaimOrderEngine?.ensureActiveOrder === 'function') {
        window.LechaimOrderEngine.ensureActiveOrder({
          orderType: ctx.orderType,
          tableNumber: ctx.tableNumber,
          sessionId: ctx.sessionId || localSessionId,
        });
      }
      if (typeof window.LechaimOrderEngine?.setOrderItems === 'function') {
        window.LechaimOrderEngine.setOrderItems(remoteItems);
      }
    } catch (err) {
      console.warn('[session-watch] setOrderItems failed', err);
    }

    /* Keep takeaway "ההזמנה שלי" receipt in sync with Admin edits. */
    if (isTakeawayContext()) {
      takeawayReceiptItems = remoteItems;
      if (isTakeawayOrderLocked() || readTakeawayLock()) {
        writeTakeawayLock({
          sessionId: localSessionId || window.LechaimOrderContext?.sessionId || null,
          items: remoteItems,
          publicOrderNo: window.LechaimOrderContext?.publicOrderNo ?? null,
          lockedAt: readTakeawayLock()?.lockedAt || new Date().toISOString(),
        });
      }
    }

    renderCart();

    if (orderReceipt && !orderReceipt.hidden) {
      showOrderReceipt(remoteItems, { viewing: receiptViewingMode });
    }
  }

  /**
   * Sync local wave to Supabase. Resolves on success; rejects on failure.
   * Restaurant PC prints via Admin — customer never calls print-engine.
   */
  async function syncOrderToSupabase({ localSession, localOrder, waveItems }) {
    const api = window.LechaimSupabaseOrders;
    if (!api || typeof api.isConfigured !== 'function' || !api.isConfigured()) {
      throw new Error('[dual-write] Supabase order service not configured');
    }

    const items = Array.isArray(waveItems) ? waveItems : [];
    if (!items.length) {
      throw new Error('[dual-write] no wave items to sync');
    }

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
    return remoteOrder;
  }

  /** @deprecated fire-and-forget wrapper kept for any residual callers */
  function syncOrderToSupabaseQuietly(args) {
    syncOrderToSupabase(args).catch((err) => {
      console.warn('[dual-write] Supabase sync failed — local order still OK', err);
    });
  }

  function loadCart() {
    return readCartFromKey(activeCartStorageKey());
  }

  function resolveCartProductForOrder(productId, line) {
    const item = findItem(productId);
    if (!item) return null;
    const resolved = getResolvedItem(item);
    const baseName = resolved?.name || item.name || '';
    if (line?.unitType === 'pack' || isSoldByPack(item)) {
      const pricePerKg = Number(line.pricePerKg) > 0
        ? Number(line.pricePerKg)
        : getItemPricePerKg(item);
      return {
        name: baseName,
        price: 0,
        notes: line?.notes == null ? '' : String(line.notes),
        pricePerKg,
        unitType: 'pack',
        thawCount: Math.min(
          Math.max(0, Number(line?.thawCount) || 0),
          Math.max(1, Number(line?.qty) || 1)
        ),
      };
    }
    if (line?.unitType === 'kg' || isSoldByWeight(item)) {
      const pricePerKg = Number(line.pricePerKg) > 0
        ? Number(line.pricePerKg)
        : getItemPricePerKg(item);
      return {
        name: baseName,
        price: Number(pricePerKg.toFixed(2)),
        notes: line?.notes == null ? '' : String(line.notes),
        selectedWeight: 1,
        pricePerKg,
        unitType: 'kg',
      };
    }
    let price = resolved?.price != null ? resolved.price : (item.price != null ? item.price : 0);
    if (line?.linkedToMainLineId && isIncludedMealOption(line)) {
      if (isHotSide(line.itemId) || isShakeBase(line.itemId) || isHamburgerDrinkOption(line.itemId)) {
        price = 0;
      }
    }
    return {
      name: baseName,
      price,
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
    writeCartToKey(activeCartStorageKey(), cartLines, cartLineOrder);
    /* Stage 7: order is committed on "שלח הזמנה", not on every cart edit. */
  }

  function addToCart(itemId, options = {}) {
    if (!isOrderingAllowed()) {
      showCartToast(t('orderingClosedToast'));
      return;
    }

    const catalogItem = findItem(itemId);
    if (catalogItem?.adminOnly) return;
    if (catalogItem?.dineInOnly && (isTakeawayContext() || isButcherContext())) return;

    if (!isProductAvailable(itemId)) {
      showCartToast(t('outOfStock'));
      return;
    }

    let newMainLineId = null;

    if (isMainCourse(itemId) || isRequiredPickParent(itemId)) {
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
    } else if (isShakeBase(itemId) || isLimonanaAlcoholOption(itemId)) {
      /* Shake bases / limonana alcohol are only added via the picker. */
      return;
    } else if (isSoldByPack(catalogItem) || isSoldByPack(itemId)) {
      const existing = cartLines.find(
        (l) => l.itemId === itemId && !l.linkedToMainLineId
      );
      if (existing) {
        existing.qty += 1;
        existing.thawCount = Math.min(Number(existing.thawCount) || 0, existing.qty);
        moveCartLineToTop(existing.lineId);
    } else {
        const lineId = createCartLineId();
        cartLines.push({
          lineId,
          itemId,
          qty: 1,
          thawCount: 0,
          unitType: 'pack',
          pricePerKg: getItemPricePerKg(catalogItem),
          linkedToMainLineId: null,
        });
        moveCartLineToTop(lineId);
      }
    } else {
      /* Standalone drink/item — do not merge into an open hamburger meal line */
      const existing = cartLines.find(
        (l) => l.itemId === itemId
          && !l.linkedToMainLineId
          && !isMainCourse(l.itemId)
          && !isRequiredPickParent(l.itemId)
      );

      if (existing) {
        existing.qty += 1;
        moveCartLineToTop(existing.lineId);
      } else {
        const lineId = createCartLineId();
        const line = { lineId, itemId, qty: 1, linkedToMainLineId: null };
        if (isSoldByWeight(catalogItem)) {
          line.selectedWeight = 1;
          line.unitType = 'kg';
          line.pricePerKg = getItemPricePerKg(catalogItem);
        }
        cartLines.push(line);
        moveCartLineToTop(lineId);
      }
    }

    saveCart();
    renderCart();
    if (!isHotSide(itemId) && !isShakeBase(itemId) && !isLimonanaAlcoholOption(itemId)) {
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
    if (!isOrderingAllowed() && delta > 0) {
      showCartToast(t('orderingClosedToast'));
      return;
    }

    const line = findCartLine(lineId);
    if (!line) return;

    const itemId = line.itemId;
    const newQty = line.qty + delta;
    if (newQty <= 0) {
      const wasLinkedOption = Boolean(line.linkedToMainLineId);
      const mainLineId = wasLinkedOption ? line.linkedToMainLineId : null;

      removeCartLine(lineId);
      saveCart();
      renderCart();
      if (!wasLinkedOption) {
        refreshFoodCards(itemId);
      updateOpenFoodModal();
      }

      if (wasLinkedOption && mainLineId && findCartLine(mainLineId)) {
        closeCartPanel();
        openSidesModal(mainLineId);
      }
      return;
    }

    if (delta > 0 && line.linkedToMainLineId) {
      if (!canAddSideToMain(line.linkedToMainLineId)) {
        showCartToast(t('maxSidesPerMain'));
        return;
      }
      line.qty = newQty;
    } else {
      line.qty = newQty;
      if (isLimonana(line.itemId)) {
        getSideLinesForMain(lineId).forEach((side) => {
          side.qty = newQty;
        });
    }
    }
    clampPackThawCount(line);

    saveCart();
    renderCart();
    if (!isHotSide(itemId)) {
      refreshFoodCards(itemId);
      updateOpenFoodModal();
    }
  }

  function changeThawCount(lineId, delta) {
    const line = findCartLine(lineId);
    if (!line || !isCartPackLine(line)) return;
    changeItemThawCount(line.itemId, delta);
  }

  function changeItemThawCount(itemId, delta) {
    const line = cartLines.find((l) => l.itemId === itemId && !l.linkedToMainLineId);
    if (!line || !isCartPackLine(line)) return;
    const next = (Number(line.thawCount) || 0) + Number(delta || 0);
    line.thawCount = Math.min(Math.max(0, next), Number(line.qty) || 0);
    saveCart();
    renderCart();
    refreshFoodCards(itemId);
    updateOpenFoodModal();
  }

  function setItemThawCount(itemId, thawValue) {
    const line = cartLines.find((l) => l.itemId === itemId && !l.linkedToMainLineId);
    if (!line || !isCartPackLine(line)) return;
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    const next = Math.min(Math.max(0, Math.floor(Number(thawValue) || 0)), qty);
    line.thawCount = next;
    saveCart();
    renderCart();
    refreshFoodCards(itemId);
    updateOpenFoodModal();
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
      if (isCartPackLine(line) || isSoldByPack(line.itemId)) {
        if (line.unitType !== 'pack') {
          line.unitType = 'pack';
          changed = true;
        }
        if (!(Number(line.pricePerKg) > 0)) {
          line.pricePerKg = getItemPricePerKg(findItem(line.itemId));
          changed = true;
        }
        const prevThaw = line.thawCount;
        clampPackThawCount(line);
        if (line.thawCount !== prevThaw) changed = true;
      }
    });

    if (changed) saveCart();
  }

  function getCartCount() {
    return cartLines
      .filter((line) => !line.linkedToMainLineId && !isLinkedOption(line.itemId))
      .reduce((sum, line) => sum + line.qty, 0);
  }

  function isIncludedMealOption(line) {
    if (!line?.linkedToMainLineId) return false;
    const parent = findCartLine(line.linkedToMainLineId);
    if (!parent) return false;
    return isRequiredPickParent(parent.itemId) || isMainCourse(parent.itemId);
  }

  function getCartLineUnitPrice(line, item) {
    /* Hot sides / meal drinks / shake bases included with parent — €0 */
    if (line?.linkedToMainLineId && isIncludedMealOption(line)) {
      if (isHotSide(line.itemId) || isShakeBase(line.itemId) || isHamburgerDrinkOption(line.itemId)) {
        return 0;
      }
    }
    /* Pack lines: estimated only — charged price is 0 until weighed */
    if (isCartPackLine(line) || isSoldByPack(item)) {
      return 0;
    }
    if (line?.unitType === 'kg' || isSoldByWeight(item)) {
      const perKg = Number(line.pricePerKg) > 0 ? Number(line.pricePerKg) : getItemPricePerKg(item);
      return perKg;
    }
    return getItemPrice(item) || 0;
  }

  function getCartEstRange() {
    let min = 0;
    let max = 0;
    cartLines.forEach((line) => {
      const item = findItem(line.itemId);
      if (!item) return;
      if (isCartPackLine(line) || isSoldByPack(item)) {
        const perKg = Number(line.pricePerKg) > 0
          ? Number(line.pricePerKg)
          : getItemPricePerKg(item);
        const range = getPackEstRange(perKg, line.qty);
        min += range.min;
        max += range.max;
        return;
      }
      const price = getCartLineUnitPrice(line, item);
      const lineTotal = (price || 0) * (Number(line.qty) || 0);
      min += lineTotal;
      max += lineTotal;
    });
    /* Delivery fee is shown under סה״כ — keep range for products only */
    return { min, max };
  }

  function cartHasPackLines() {
    return cartLines.some((line) => isCartPackLine(line) || isSoldByPack(line.itemId));
  }

  function getCartTotal() {
    if (isButcherContext() && cartHasPackLines()) {
      return getCartEstRange().max;
    }
    /* Products only — delivery fee is listed under the total row */
    return getCartItemsSubtotal();
  }

  function renderCartLineHtml(line, variant = 'single') {
    const item = findItem(line.itemId);
    if (!item) return '';

    const mainLine = line.linkedToMainLineId ? findCartLine(line.linkedToMainLineId) : null;
    const mainItem = mainLine ? findItem(mainLine.itemId) : null;

    let metaHtml = '';
    if (line.linkedToMainLineId && mainItem && variant !== 'child') {
      metaHtml = isFruitShake(mainItem.id)
        ? `<p class="cart-item-meta">${escapeHtml(t('shakeBaseLabel'))}</p>`
        : (isHamburgerMeal(mainItem.id)
          ? `<p class="cart-item-meta">${escapeHtml(t('drinkIncludedLabel'))}</p>`
          : (isLimonana(mainItem.id)
            ? `<p class="cart-item-meta">${escapeHtml(t('limonanaAlcoholLabel'))}</p>`
            : `<p class="cart-item-meta">${escapeHtml(tReplace('sideForMain', { name: getItemName(mainItem) }))}</p>`));
    } else if (isParentWithOptions(line.itemId)) {
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
    const byPack = isCartPackLine(line) || isSoldByPack(item);
    const byWeight = !byPack && (line.unitType === 'kg' || isSoldByWeight(item));
    const price = getCartLineUnitPrice(line, item);
    const noImageClass = imageSrc ? '' : ' cart-item--no-image';
    const packRange = byPack
      ? getPackEstRange(
        Number(line.pricePerKg) > 0 ? Number(line.pricePerKg) : getItemPricePerKg(item),
        line.qty
      )
      : null;
    const lineTotal = byPack ? null : price * line.qty;
    const imageHtml = imageSrc
      ? `<div class="cart-item-thumb${variant === 'child' ? ' cart-item-thumb--side' : ''}">
           <img src="${escapeAttr(imageSrc)}" alt="" loading="lazy" decoding="async" width="52" height="52" onerror="this.closest('.cart-item')?.classList.add('cart-item--no-image');this.closest('.cart-item-thumb')?.remove();">
         </div>`
      : '';

    const childBadge = mainItem && isFruitShake(mainItem.id)
      ? t('shakeBaseLabel')
      : (mainItem && isHamburgerMeal(mainItem.id)
        ? t('drinkIncludedLabel')
        : (mainItem && isLimonana(mainItem.id)
          ? t('limonanaAlcoholLabel')
          : t('sideLabel')));
    const unitHtml = variant === 'child'
      ? `<p class="cart-item-badge">${escapeHtml(childBadge)}</p>`
      : (byPack
        ? `<p class="cart-item-unit">${escapeHtml(packQtyLabel(line.qty))}</p>
           <p class="cart-item-unit">${escapeHtml(tReplace('perKg', { price: formatEuroTotal(Number(line.pricePerKg) || getItemPricePerKg(item)) }))}</p>`
        : (byWeight
          ? `<p class="cart-item-unit">${escapeHtml(tReplace('perKg', { price: formatEuroTotal(Number(line.pricePerKg) || getItemPricePerKg(item)) }))}</p>`
          : `<p class="cart-item-unit">${escapeHtml(tReplace('perUnit', { price: formatPrice(getItemPrice(item) || 0) }))}</p>`));

    const controlsHtml = variant === 'child'
      ? ''
      : (byPack
        ? `<div class="cart-item-controls cart-item-controls--pack">
             <p class="cart-item-qty-label">${escapeHtml(t('packQtyControlLabel'))}</p>
             <div class="cart-item-controls__row">
               <button type="button" class="cart-qty-btn" data-action="cart-dec" aria-label="${escapeAttr(t('decrease'))}">−</button>
               <span class="cart-item-qty">${line.qty}</span>
               <button type="button" class="cart-qty-btn" data-action="cart-inc" aria-label="${escapeAttr(t('increase'))}">+</button>
             </div>
           </div>`
        : `<div class="cart-item-controls">
            <button type="button" class="cart-qty-btn" data-action="cart-dec" aria-label="${escapeAttr(t('decrease'))}">−</button>
            <span class="cart-item-qty">${line.qty}</span>
            <button type="button" class="cart-qty-btn" data-action="cart-inc" aria-label="${escapeAttr(t('increase'))}">+</button>
          </div>`);

    const totalHtml = byPack
      ? `<div class="cart-item-total cart-item-total--est">${escapeHtml(tReplace('packEstLine', {
        min: formatEuroAmount(packRange.min),
        max: formatEuroAmount(packRange.max),
      }))}</div>`
      : `<div class="cart-item-total">${price > 0 ? formatEuroTotal(lineTotal) : ''}</div>`;

    return `
      <article class="cart-item${mainClass}${sideClass}${noImageClass}${byPack ? ' cart-item--by-pack' : ''}" data-cart-line-id="${escapeAttr(line.lineId)}">
        ${imageHtml}
        <div class="cart-item-body">
          <div class="cart-item-main">
            <h3 class="cart-item-name">${escapeHtml(getItemName(item))}</h3>
            ${metaHtml}
            ${unitHtml}
          </div>
          ${controlsHtml}
          </div>
        ${totalHtml}
      </article>
    `;
  }

  function renderCart() {
    const count = getCartCount();
    const empty = count === 0;

    updateCartToggleMode();

    if (cartBadge) {
      cartBadge.textContent = String(count);
      cartBadge.setAttribute('data-count', String(count));
      cartBadge.hidden = empty;
    }

    if (cartFooter) cartFooter.hidden = false;
    if (cartPendingTotalRow) cartPendingTotalRow.hidden = empty;
    const cartTotalLabel = cartPendingTotalRow?.querySelector('.cart-total-label');
    if (cartTotalPrice) {
      if (!empty && isButcherContext() && cartHasPackLines()) {
        const range = getCartEstRange();
        const estText = tReplace('cartEstTotal', {
          min: formatEuroAmount(range.min),
          max: formatEuroAmount(range.max),
        });
        cartTotalPrice.classList.add('cart-total-price--est');
        cartTotalPrice.textContent = estText;
        if (cartTotalLabel) cartTotalLabel.textContent = t('cartEstTotalLabel');
      } else {
        cartTotalPrice.classList.remove('cart-total-price--est');
        cartTotalPrice.textContent = formatPrice(getCartTotal());
        if (cartTotalLabel) cartTotalLabel.textContent = t('total');
      }
    }
    const deliveryFee = !empty ? getActiveDeliveryFee() : 0;
    if (cartDeliveryFeeRow) {
      if (deliveryFee > 0) {
        cartDeliveryFeeRow.hidden = false;
        if (cartDeliveryFeeLabel) {
          cartDeliveryFeeLabel.textContent = t('fulfillmentDelivery') || 'משלוח';
        }
        if (cartDeliveryFeePrice) {
          cartDeliveryFeePrice.textContent = formatPrice(deliveryFee);
        }
      } else {
        cartDeliveryFeeRow.hidden = true;
      }
    }
    if (cartSessionTotalPrice) {
      cartSessionTotalPrice.textContent = formatEuroTotal(getSessionOrderTotal());
    }

    /* Bill depends on sent order items — update even while send is in progress */
    if (cartRequestBill) {
      const showBill = !isTakeawayContext()
        && !isButcherContext()
        && !Boolean(window.LechaimOrderContext?.browseOnly)
        && isOrderingAllowed();
      cartRequestBill.hidden = !showBill;
      cartRequestBill.disabled = !showBill || !hasActiveOrderItems();
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
    if (isTakeawayOrderLocked() && getCartCount() === 0) {
      showOrderReceipt(getTakeawayReceiptItems());
      return;
    }

    if (!cartPanel) return;

    cartLastFocusedElement = document.activeElement;
    cartPanel.hidden = false;
    cartPanel.setAttribute('aria-hidden', 'false');
    cartToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('cart-open');
    setFocusTrap('cart', cartPanel);

    requestAnimationFrame(() => {
      cartPanel.classList.add('is-open');
      cartClose.focus();
    });
  }

  function closeCartPanel() {
    if (!cartPanel || cartPanel.hidden) return;

    clearFocusTrap('cart');
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
