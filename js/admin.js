/**
 * LECHAIM — Admin inventory & menu management UI
 * Catalog always comes from MENU_DATA / HOT_SIDE_ITEMS via LechaimInventory.getCatalog().
 */
(function () {
  'use strict';

  const bootEl = document.getElementById('admin-boot');
  const loginEl = document.getElementById('admin-login');
  const panelEl = document.getElementById('admin-panel');
  const loginForm = document.getElementById('admin-login-form');
  const loginError = document.getElementById('admin-login-error');
  const panelError = document.getElementById('admin-panel-error');
  const statusEl = document.getElementById('admin-status');
  const successModal = document.getElementById('admin-success-modal');
  const successText = document.getElementById('admin-success-text');
  const successOk = document.getElementById('admin-success-ok');
  const successBackdrop = document.getElementById('admin-success-backdrop');
  const listEl = document.getElementById('admin-list');
  const logoutBtn = document.getElementById('admin-logout');
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');
  const loginSubmit = document.getElementById('admin-login-submit');
  const searchInput = document.getElementById('admin-search');
  const filtersEl = document.querySelector('.admin-filters');
  const statTotal = document.getElementById('stat-total');
  const statAvailable = document.getElementById('stat-available');
  const statUnavailable = document.getElementById('stat-unavailable');
  const tabsEl = document.getElementById('admin-tabs');
  const viewTables = document.getElementById('admin-view-tables');
  const viewShabbat = document.getElementById('admin-view-shabbat');
  const viewReservations = document.getElementById('admin-view-reservations');
  const viewHistory = document.getElementById('admin-view-history');
  const viewInventory = document.getElementById('admin-view-inventory');
  const viewStats = document.getElementById('admin-view-stats');
  const kitchenCloseBtn = document.getElementById('admin-kitchen-close-btn');

  let inventorySubscribed = false;
  let currentFilter = 'all';
  let currentQuery = '';
  let catalogCache = [];
  let currentTab = 'tables';
  let dineInCloseAtMs = null;
  let kitchenCloseAdminTick = null;

  function showError(el, message) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  let successFocusTrapRelease = null;
  let successAutoCloseTimer = null;

  function closeAdminModal() {
    if (!successModal) return;
    window.clearTimeout(successAutoCloseTimer);
    successAutoCloseTimer = null;
    if (typeof successFocusTrapRelease === 'function') successFocusTrapRelease();
    successFocusTrapRelease = null;
    successModal.hidden = true;
    successModal.setAttribute('aria-hidden', 'true');
    successModal.querySelector('.admin-modal__panel')?.classList.remove('is-check-only');
    document.body.classList.remove('admin-modal-open');
  }

  function showToast(message, options = {}) {
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

    const svg = successModal.querySelector('.admin-success-check__svg');
    if (svg) {
      const clone = svg.cloneNode(true);
      svg.replaceWith(clone);
    }

    successModal.hidden = false;
    successModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    if (typeof successFocusTrapRelease === 'function') successFocusTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(successModal);
    successFocusTrapRelease = typeof release === 'function' ? release : null;

    successAutoCloseTimer = window.setTimeout(() => {
      successAutoCloseTimer = null;
      closeAdminModal();
    }, autoCloseMs);
  }

  function setView(view) {
    if (bootEl) bootEl.hidden = view !== 'boot';
    if (loginEl) loginEl.hidden = view !== 'login';
    if (panelEl) panelEl.hidden = view !== 'panel';

    if (view !== 'panel') {
      window.LechaimAdminTables?.stop?.();
      window.LechaimAdminTables?.closeDrawer?.();
      window.LechaimAdminShabbat?.stop?.();
      window.LechaimAdminReservations?.stop?.();
    }
  }

  function setTab(tab) {
    if (tab === 'inventory') currentTab = 'inventory';
    else if (tab === 'stats') currentTab = 'stats';
    else if (tab === 'takeaway') currentTab = 'takeaway';
    else if (tab === 'shabbat') currentTab = 'shabbat';
    else if (tab === 'reservations') currentTab = 'reservations';
    else if (tab === 'history') currentTab = 'history';
    else currentTab = 'tables';

    tabsEl?.querySelectorAll('.admin-tab').forEach((btn) => {
      const isActive = btn.dataset.tab === currentTab;
      btn.classList.toggle('is-active', isActive);
    });

    const onBoard = currentTab === 'tables' || currentTab === 'takeaway';
    if (viewTables) viewTables.hidden = !onBoard;
    if (viewShabbat) viewShabbat.hidden = currentTab !== 'shabbat';
    if (viewReservations) viewReservations.hidden = currentTab !== 'reservations';
    if (viewHistory) viewHistory.hidden = currentTab !== 'history';
    if (viewInventory) viewInventory.hidden = currentTab !== 'inventory';
    if (viewStats) viewStats.hidden = currentTab !== 'stats';

    /*
     * Keep order watchers (Realtime + chime) alive on every Admin tab.
     * Only the visible board UI changes — never stop listening while logged in.
     */
    window.LechaimAdminTables?.start?.();
    window.LechaimAdminShabbat?.start?.();
    if (onBoard) {
      window.LechaimAdminTables?.setBoardFilter?.(currentTab === 'takeaway' ? 'takeaway' : 'tables');
    } else {
      window.LechaimAdminTables?.closeDrawer?.();
    }
    if (currentTab !== 'shabbat') {
      window.LechaimAdminShabbat?.closeDrawer?.();
    }

    if (currentTab === 'reservations') {
      window.LechaimAdminReservations?.start?.();
    } else {
      window.LechaimAdminReservations?.stop?.();
    }

    if (currentTab === 'history') {
      window.LechaimAdminHistory?.start?.();
    }

    if (currentTab === 'stats') {
      window.LechaimAdminCoupons?.start?.();
    }
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

  function formatPrice(price) {
    if (price == null) return '—';
    if (Number(price) === 0) return 'כלול במנה';
    return `€${price}`;
  }

  function refreshCatalogCache() {
    catalogCache = LechaimInventory.getCatalog();
    if (!catalogCache.length) {
      const report = LechaimInventory.diagnoseMenuGlobals?.() || {
        MENU_DATA: typeof window.MENU_DATA !== 'undefined',
        HOT_SIDE_ITEMS: typeof window.HOT_SIDE_ITEMS !== 'undefined',
      };
      console.error('[admin] getCatalog() returned []. Missing globals / scripts:', report);
      showError(
        panelError,
        'לא נטענו מוצרים מ-MENU_DATA.\n' +
        JSON.stringify(report, null, 2) +
        '\nודאו ש-admin.html טוען js/menu-data.js לפני js/inventory.js ו-js/admin.js'
      );
    }
    return catalogCache;
  }

  function updateStats() {
    const stats = LechaimInventory.getStats(catalogCache);
    if (statTotal) statTotal.textContent = String(stats.total);
    if (statAvailable) statAvailable.textContent = String(stats.available);
    if (statUnavailable) statUnavailable.textContent = String(stats.unavailable);
  }

  function matchesQuery(item, query) {
    if (!query) return true;
    const haystack = [
      item.name,
      item.description,
      item.categoryTitle,
      item.categoryId,
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function matchesFilter(item) {
    if (currentFilter === 'available') return item.available;
    if (currentFilter === 'unavailable') return !item.available;
    return true;
  }

  function getVisibleCatalog() {
    const query = currentQuery.trim().toLowerCase();
    return catalogCache.filter((item) => matchesFilter(item) && matchesQuery(item, query));
  }

  function groupCatalog(items) {
    const groups = new Map();
    items.forEach((item) => {
      const key = item.categoryId || 'other';
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          title: item.categoryTitle || key,
          items: [],
        });
      }
      groups.get(key).items.push(item);
    });
    return [...groups.values()];
  }

  function renderCard(item) {
    const available = LechaimInventory.isAvailable(item.id);
    const name = item.name || '';
    const image = item.image || '';
    const priceLabel = formatPrice(item.price);

    const thumb = image
      ? `<img class="admin-card__img" src="${escapeAttr(image)}" alt="" width="480" height="300" loading="lazy" decoding="async">`
      : `<div class="admin-card__img admin-card__img--empty">אין תמונה</div>`;

    return `
      <article class="admin-card${available ? '' : ' is-unavailable'}" data-product-id="${escapeAttr(item.id)}">
        <div class="admin-card__media">
          ${thumb}
          <span class="admin-card__badge ${available ? 'is-on' : 'is-off'}">${available ? 'יש במלאי' : 'אין במלאי'}</span>
        </div>
        <div class="admin-card__body">
          <p class="admin-card__meta">${escapeHtml(item.categoryTitle || '')}</p>
          <h3 class="admin-card__name">${escapeHtml(name)}</h3>
          <p class="admin-card__price">${escapeHtml(priceLabel)}</p>

          <button
            type="button"
            class="admin-btn admin-btn--stock ${available ? 'is-on' : 'is-off'}"
            data-action="toggle-stock"
            data-product-id="${escapeAttr(item.id)}"
            aria-pressed="${available ? 'true' : 'false'}"
          >
            ${available ? 'יש במלאי' : 'אין במלאי'}
          </button>
        </div>
      </article>
    `;
  }

  function renderList() {
    if (!listEl) return;

    refreshCatalogCache();
    updateStats();

    const visible = getVisibleCatalog();
    const groups = groupCatalog(visible);

    if (!groups.length) {
      listEl.innerHTML = `<p class="admin-empty">לא נמצאו מנות לפי הסינון הנוכחי</p>`;
      if (statusEl) {
        statusEl.textContent = `${catalogCache.length} מנות במערכת · מוצגות 0`;
      }
      return;
    }

    listEl.innerHTML = groups.map((group) => `
      <section class="admin-category" data-category-id="${escapeAttr(group.id)}">
        <h2 class="admin-category__title">${escapeHtml(group.title)}</h2>
        <div class="admin-category__grid">
          ${group.items.map(renderCard).join('')}
        </div>
      </section>
    `).join('');

    if (statusEl) {
      statusEl.textContent = `${catalogCache.length} מנות במערכת · מוצגות ${visible.length}`;
    }
  }

  function updateCard(productId) {
    refreshCatalogCache();
    updateStats();

    const item = catalogCache.find((entry) => entry.id === productId);
    const existing = listEl?.querySelector(`[data-product-id="${CSS.escape(productId)}"]`);

    if (!item || !matchesFilter(item) || !matchesQuery(item, currentQuery.trim().toLowerCase())) {
      if (existing) existing.remove();
      const grids = listEl?.querySelectorAll('.admin-category');
      grids?.forEach((section) => {
        if (!section.querySelector('.admin-card')) section.remove();
      });
      if (statusEl) {
        const visible = getVisibleCatalog();
        statusEl.textContent = `${catalogCache.length} מנות במערכת · מוצגות ${visible.length}`;
      }
      return;
    }

    const html = renderCard(item);
    if (existing) {
      existing.outerHTML = html;
    } else {
      renderList();
    }
  }

  async function handleToggle(button) {
    const productId = button.dataset.productId;
    if (!productId) return;

    const currentlyAvailable = button.getAttribute('aria-pressed') === 'true';
    const next = !currentlyAvailable;
    button.disabled = true;
    showError(panelError, '');

    try {
      await LechaimInventory.setAvailable(productId, next);
      updateCard(productId);
      showToast(next ? 'עודכן: יש במלאי' : 'עודכן: אין במלאי');
    } catch (err) {
      console.error('[admin] toggle failed', err);
      showError(panelError, err?.message || String(err));
      button.disabled = false;
    }
  }

  function formatAdminRemain(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function stopAdminKitchenTick() {
    if (kitchenCloseAdminTick) {
      window.clearInterval(kitchenCloseAdminTick);
      kitchenCloseAdminTick = null;
    }
  }

  function updateKitchenCloseButton() {
    if (!kitchenCloseBtn) return;
    if (!dineInCloseAtMs) {
      stopAdminKitchenTick();
      kitchenCloseBtn.textContent = 'סגירת מטבח (ישיבה במקום)';
      kitchenCloseBtn.classList.add('admin-btn--danger');
      kitchenCloseBtn.classList.remove('admin-btn--primary');
      return;
    }
    const remain = dineInCloseAtMs - Date.now();
    if (remain > 0) {
      kitchenCloseBtn.textContent = `בטל סגירה (${formatAdminRemain(remain)})`;
      kitchenCloseBtn.classList.add('admin-btn--danger');
      kitchenCloseBtn.classList.remove('admin-btn--primary');
      if (!kitchenCloseAdminTick) {
        kitchenCloseAdminTick = window.setInterval(updateKitchenCloseButton, 1000);
      }
    } else {
      stopAdminKitchenTick();
      kitchenCloseBtn.textContent = 'פתח הזמנות ישיבה במקום';
      kitchenCloseBtn.classList.remove('admin-btn--danger');
      kitchenCloseBtn.classList.add('admin-btn--primary');
    }
  }

  async function refreshKitchenCloseFlag() {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.getDineInCloseAt !== 'function') return;
    try {
      const at = await api.getDineInCloseAt();
      dineInCloseAtMs = at ? Date.parse(at) : null;
      if (!Number.isFinite(dineInCloseAtMs)) dineInCloseAtMs = null;
      updateKitchenCloseButton();
    } catch (err) {
      console.warn('[admin] kitchen close deadline load failed', err);
    }
  }

  async function handleKitchenCloseClick() {
    const api = window.LechaimSupabaseOrders;
    if (!api?.startDineInCloseCountdown || !api?.clearDineInCloseCountdown) {
      showError(panelError, 'סגירת מטבח לא זמינה — הריצו supabase-restaurant-flags.sql');
      return;
    }

    if (dineInCloseAtMs) {
      const remain = dineInCloseAtMs - Date.now();
      const msg = remain > 0
        ? `לבטל את ספירת הסגירה? (נותרו ${formatAdminRemain(remain)})`
        : 'לפתוח מחדש הזמנות ישיבה במקום?';
      const ok = typeof window.LechaimAdminTables?.showConfirmModal === 'function'
        ? await window.LechaimAdminTables.showConfirmModal(msg, {
          yesLabel: remain > 0 ? 'בטל סגירה' : 'פתח הזמנות',
        })
        : window.confirm(msg);
      if (!ok) return;
      try {
        await api.clearDineInCloseCountdown();
        dineInCloseAtMs = null;
        updateKitchenCloseButton();
        showToast('הזמנות ישיבה במקום פתוחות');
      } catch (err) {
        showError(panelError, err?.message || 'הפתיחה נכשלה');
      }
      return;
    }

    const ok = typeof window.LechaimAdminTables?.showConfirmModal === 'function'
      ? await window.LechaimAdminTables.showConfirmModal(
        'להתחיל ספירה של 30 דקות לסגירת הזמנות ישיבה במקום?\nכל לקוח יראה את הזמן שנותר. אחרי 30 דקות יופיע מודל שהמטבח סגור ולא ניתן להוסיף מנות.',
        { yesLabel: 'התחל 30 דקות' }
      )
      : window.confirm('להתחיל ספירה של 30 דקות?');
    if (!ok) return;

    try {
      const iso = await api.startDineInCloseCountdown(30);
      dineInCloseAtMs = Date.parse(iso);
      updateKitchenCloseButton();
      showToast('התחילה ספירה — 30 דקות לסגירה');
    } catch (err) {
      showError(panelError, err?.message || 'הסגירה נכשלה');
    }
  }

  async function showPanel() {
    setView('panel');
    showError(panelError, '');
    setTab('tables');

    try {
      await LechaimInventory.load();
      refreshCatalogCache();
      updateStats();
      await refreshKitchenCloseFlag();

      if (currentTab === 'inventory') {
        renderList();
      }

      window.setTimeout(() => {
        const rt = LechaimInventory.getRealtimeStatus?.() || {};
        console.log('[admin] realtime status', rt);
        if (statusEl && currentTab === 'inventory') {
          const inv = rt.inventory || 'IDLE';
          statusEl.textContent = `${catalogCache.length} מנות · Realtime inventory=${inv}`;
        }
      }, 1200);

      if (!inventorySubscribed) {
        inventorySubscribed = true;
        LechaimInventory.subscribe((payload) => {
          if (currentTab !== 'inventory') {
            refreshCatalogCache();
            updateStats();
            return;
          }
          const productId = typeof payload === 'string' ? payload : payload?.productId;
          if (productId) updateCard(productId);
          else renderList();
        });
      }
    } catch (err) {
      console.error('[admin] panel load error', err);
      showError(panelError, err?.message || String(err));
      if (statusEl) statusEl.textContent = '';
    }
  }

  function showLogin(message) {
    setView('login');
    showError(loginError, message || '');
    if (passwordInput) passwordInput.value = '';
  }

  async function init() {
    setView('boot');

    if (!window.LechaimInventory?.isConfigured()) {
      showLogin('חסרים פרטי חיבור ל-Supabase. יש למלא url ו-anonKey ב־js/supabase-config.js');
      return;
    }

    LechaimInventory.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && panelEl?.hidden) {
        showPanel();
      }
      if (event === 'SIGNED_OUT') {
        showLogin();
      }
    });

    try {
      const session = await LechaimInventory.getSession();
      if (session) await showPanel();
      else showLogin();
    } catch (err) {
      console.error('[admin] session check failed', err);
      showLogin(err?.message || 'שגיאה בבדיקת ההתחברות');
    }
  }

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError(loginError, '');
    if (loginSubmit) loginSubmit.disabled = true;

    try {
      await LechaimInventory.signIn(emailInput.value.trim(), passwordInput.value);
      if (passwordInput) passwordInput.value = '';
      await showPanel();
    } catch (err) {
      console.error('[admin] login failed', err);
      showError(loginError, err?.message || 'ההתחברות נכשלה');
    } finally {
      if (loginSubmit) loginSubmit.disabled = false;
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    showError(panelError, '');
    try {
      await LechaimInventory.signOut();
      showLogin();
    } catch (err) {
      showError(panelError, err?.message || 'ההתנתקות נכשלה');
    }
  });

  searchInput?.addEventListener('input', () => {
    currentQuery = searchInput.value || '';
    renderList();
  });

  filtersEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-filter]');
    if (!btn) return;
    currentFilter = btn.dataset.filter || 'all';
    filtersEl.querySelectorAll('.admin-filter').forEach((el) => {
      el.classList.toggle('is-active', el === btn);
    });
    renderList();
  });

  tabsEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('.admin-tab');
    if (!btn || btn.disabled) return;
    const tab = btn.dataset.tab;
    if (
      tab !== 'tables'
      && tab !== 'takeaway'
      && tab !== 'shabbat'
      && tab !== 'reservations'
      && tab !== 'history'
      && tab !== 'inventory'
      && tab !== 'stats'
    ) return;
    setTab(tab);
    if (tab === 'inventory') {
      if (statusEl) statusEl.textContent = 'טוען מלאי…';
      renderList();
      refreshKitchenCloseFlag();
    }
  });

  listEl?.addEventListener('click', (event) => {
    const stockBtn = event.target.closest('[data-action="toggle-stock"]');
    if (stockBtn) {
      handleToggle(stockBtn);
    }
  });

  kitchenCloseBtn?.addEventListener('click', () => {
    handleKitchenCloseClick();
  });

  successOk?.addEventListener('click', closeAdminModal);
  successBackdrop?.addEventListener('click', closeAdminModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && successModal && !successModal.hidden) {
      closeAdminModal();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
