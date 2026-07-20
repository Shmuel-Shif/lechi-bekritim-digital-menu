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
  const toastEl = document.getElementById('admin-toast');
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

  let inventorySubscribed = false;
  let toastTimer = null;
  let currentFilter = 'all';
  let currentQuery = '';
  let catalogCache = [];

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

  function setView(view) {
    if (bootEl) bootEl.hidden = view !== 'boot';
    if (loginEl) loginEl.hidden = view !== 'login';
    if (panelEl) panelEl.hidden = view !== 'panel';
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

  async function showPanel() {
    setView('panel');
    showError(panelError, '');
    if (statusEl) statusEl.textContent = 'טוען מלאי…';

    try {
      await LechaimInventory.load();
      renderList();

      window.setTimeout(() => {
        const rt = LechaimInventory.getRealtimeStatus?.() || {};
        console.log('[admin] realtime status', rt);
        if (statusEl) {
          const inv = rt.inventory || 'IDLE';
          statusEl.textContent = `${catalogCache.length} מנות · Realtime inventory=${inv}`;
        }
      }, 1200);

      if (!inventorySubscribed) {
        inventorySubscribed = true;
        LechaimInventory.subscribe((payload) => {
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

  listEl?.addEventListener('click', (event) => {
    const stockBtn = event.target.closest('[data-action="toggle-stock"]');
    if (stockBtn) {
      handleToggle(stockBtn);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
