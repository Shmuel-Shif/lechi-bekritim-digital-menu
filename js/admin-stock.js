/**
 * LECHAIM — Warehouse catalog with quantities + add custom products.
 * Isolated from dish inventory cards / yes-no toggles.
 */
(function (global) {
  'use strict';

  const panelEl = document.getElementById('admin-stock-panel');
  const modal = document.getElementById('stock-add-modal');
  const modalBackdrop = document.getElementById('stock-add-backdrop');
  const modalClose = document.getElementById('stock-add-close');
  const formEl = document.getElementById('stock-add-form');
  const nameInput = document.getElementById('stock-add-name');
  const categorySelect = document.getElementById('stock-add-category');
  const qtyInput = document.getElementById('stock-add-qty');
  const formErrorEl = document.getElementById('stock-add-error');
  const cancelBtn = document.getElementById('stock-add-cancel');

  let client = null;
  let qtyById = new Map();
  let customById = new Map();
  let busyId = '';
  let bound = false;
  let focusTrapRelease = null;
  let loadPromise = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;');
  }

  function getClient() {
    if (client) return client;
    if (typeof global.LechaimInventory?.getClient === 'function') {
      client = global.LechaimInventory.getClient();
      if (client) return client;
    }
    const cfg = global.LECHAIM_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey || !global.supabase?.createClient) return null;
    client = global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  function showConfirm(message, yesLabel) {
    if (typeof global.LechaimAdminTables?.showConfirmModal === 'function') {
      return global.LechaimAdminTables.showConfirmModal(message, { yesLabel: yesLabel || 'כן' });
    }
    return Promise.resolve(window.confirm(String(message || '')));
  }

  function normalizeQty(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
  }

  function formatQty(value) {
    const n = normalizeQty(value);
    return Number.isInteger(n) ? String(n) : String(n);
  }

  function catalogCategories() {
    return global.LechaimStockCatalog?.getCatalog?.() || [];
  }

  function findCatalogMeta(productId) {
    for (const cat of catalogCategories()) {
      if (cat.groups?.length) {
        for (const group of cat.groups) {
          const hit = (group.items || []).find((item) => item.id === productId);
          if (hit) {
            return {
              id: hit.id,
              name: hit.name,
              category_id: cat.id,
              group_id: group.id,
              is_custom: false,
            };
          }
        }
      }
      const hit = (cat.items || []).find((item) => item.id === productId);
      if (hit) {
        return {
          id: hit.id,
          name: hit.name,
          category_id: cat.id,
          group_id: null,
          is_custom: false,
        };
      }
    }
    return null;
  }

  function mergedCategories() {
    const cats = catalogCategories().map((cat) => {
      const groups = (cat.groups || []).map((group) => ({
        id: group.id,
        title: group.title,
        items: (group.items || []).map((item) => ({
          id: item.id,
          name: item.name,
          qty: qtyById.has(item.id) ? qtyById.get(item.id) : 0,
          isCustom: false,
          categoryId: cat.id,
          groupId: group.id,
        })),
      }));
      const baseItems = groups.length
        ? groups.flatMap((group) => group.items)
        : (cat.items || []).map((item) => ({
          id: item.id,
          name: item.name,
          qty: qtyById.has(item.id) ? qtyById.get(item.id) : 0,
          isCustom: false,
          categoryId: cat.id,
          groupId: null,
        }));
      return {
        id: cat.id,
        emoji: cat.emoji,
        title: cat.title,
        groups,
        items: baseItems.slice(),
      };
    });

    customById.forEach((row) => {
      const cat = cats.find((item) => item.id === row.category_id);
      if (!cat) return;
      const item = {
        id: row.product_id,
        name: row.name,
        qty: normalizeQty(row.qty),
        isCustom: true,
        categoryId: row.category_id,
        groupId: row.group_id || null,
      };
      if (row.group_id && cat.groups?.length) {
        const group = cat.groups.find((g) => g.id === row.group_id);
        if (group) {
          group.items.push(item);
          cat.items.push(item);
          return;
        }
      }
      if (cat.groups?.length) {
        let customGroup = cat.groups.find((g) => g.id === `${cat.id}-custom`);
        if (!customGroup) {
          customGroup = { id: `${cat.id}-custom`, title: 'נוספו ידנית', items: [] };
          cat.groups.push(customGroup);
        }
        customGroup.items.push(item);
      }
      cat.items.push(item);
    });

    return cats;
  }

  function renderQtyControls(item) {
    return `
      <div class="stock-row__qty" data-stock-qty-wrap="${escapeHtml(item.id)}">
        <button type="button" class="stock-qty-btn" data-stock-delta="-1" data-stock-id="${escapeHtml(item.id)}" aria-label="הפחת">−</button>
        <input
          type="number"
          class="stock-qty-input"
          data-stock-qty="${escapeHtml(item.id)}"
          min="0"
          step="1"
          inputmode="decimal"
          dir="ltr"
          value="${escapeHtml(formatQty(item.qty))}"
          aria-label="כמות ${escapeHtml(item.name)}"
        >
        <button type="button" class="stock-qty-btn" data-stock-delta="1" data-stock-id="${escapeHtml(item.id)}" aria-label="הוסף">+</button>
      </div>
    `;
  }

  function renderRow(item) {
    return `
      <article class="stock-row" data-stock-id="${escapeHtml(item.id)}">
        <div class="stock-row__main">
          <div class="stock-row__name">${escapeHtml(item.name)}</div>
          ${item.isCustom ? '<span class="stock-row__tag">נוסף</span>' : ''}
        </div>
        ${renderQtyControls(item)}
        ${item.isCustom
          ? `<button type="button" class="admin-btn admin-btn--danger stock-row__delete" data-stock-delete="${escapeHtml(item.id)}" aria-label="מחק מוצר">מחק</button>`
          : ''}
      </article>
    `;
  }

  function renderCategory(cat) {
    const count = cat.items.length;
    let body;
    if (cat.groups && cat.groups.length) {
      body = cat.groups.map((group) => `
        <div class="stock-group" data-stock-group="${escapeHtml(group.id)}">
          <h3 class="stock-group__title">${escapeHtml(group.title)}</h3>
          <div class="stock-category__list">
            ${group.items.map(renderRow).join('') || '<p class="stock-category__empty">אין מוצרים</p>'}
          </div>
        </div>
      `).join('');
    } else if (count) {
      body = `<div class="stock-category__list">${cat.items.map(renderRow).join('')}</div>`;
    } else {
      body = '<p class="stock-category__empty">אין מוצרים עדיין</p>';
    }

    return `
      <section class="stock-category" data-stock-category="${escapeHtml(cat.id)}">
        <header class="stock-category__header">
          <h2 class="stock-category__title">
            <span class="stock-category__emoji" aria-hidden="true">${escapeHtml(cat.emoji)}</span>
            ${escapeHtml(cat.title)}
          </h2>
          <span class="stock-category__count">${count ? `${count} מוצרים` : 'ריק'}</span>
        </header>
        ${body}
      </section>
    `;
  }

  function fillCategorySelect() {
    if (!categorySelect) return;
    const cats = catalogCategories();
    categorySelect.innerHTML = cats.map((cat) => (
      `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.title)}</option>`
    )).join('');
  }

  function render() {
    if (!panelEl) return;
    const categories = mergedCategories();
    const total = categories.reduce((sum, cat) => sum + cat.items.length, 0);
    panelEl.innerHTML = `
      <div class="stock-toolbar">
        <p class="stock-catalog__lead">מחסן · ${total} מוצרים · עדכנו כמות לכל פריט</p>
        <button type="button" class="admin-btn admin-btn--primary" id="stock-add-btn">הוסף מוצר</button>
      </div>
      <p class="admin-error" id="stock-error" role="alert" hidden></p>
      <div class="stock-catalog">
        ${categories.map(renderCategory).join('')}
      </div>
    `;
    panelEl.querySelector('#stock-add-btn')?.addEventListener('click', openAddModal);
  }

  function showPanelError(message) {
    const el = panelEl?.querySelector('#stock-error');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  }

  function showFormError(message) {
    if (!formErrorEl) return;
    formErrorEl.hidden = !message;
    formErrorEl.textContent = message || '';
  }

  async function loadRows() {
    const sb = getClient();
    if (!sb) {
      qtyById = new Map();
      customById = new Map();
      return;
    }
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const { data, error } = await sb
        .from('warehouse_stock')
        .select('product_id, name, category_id, group_id, qty, is_custom');
      if (error) {
        console.error('[admin-stock] load', error);
        showPanelError('לא ניתן לטעון כמויות מחסן כרגע');
        qtyById = new Map();
        customById = new Map();
        return;
      }
      const nextQty = new Map();
      const nextCustom = new Map();
      (Array.isArray(data) ? data : []).forEach((row) => {
        const id = String(row.product_id || '');
        if (!id) return;
        nextQty.set(id, normalizeQty(row.qty));
        if (row.is_custom) nextCustom.set(id, row);
      });
      qtyById = nextQty;
      customById = nextCustom;
      showPanelError('');
    })();
    try {
      await loadPromise;
    } finally {
      loadPromise = null;
    }
  }

  async function upsertQty(productId, qty, meta) {
    const sb = getClient();
    if (!sb) {
      showPanelError('לא ניתן לשמור כרגע');
      return false;
    }
    const info = meta || findCatalogMeta(productId) || customById.get(productId);
    if (!info) {
      showPanelError('המוצר לא נמצא');
      return false;
    }
    const row = {
      product_id: productId,
      name: info.name,
      category_id: info.category_id || info.categoryId,
      group_id: info.group_id || info.groupId || null,
      qty: normalizeQty(qty),
      is_custom: Boolean(info.is_custom || info.isCustom),
    };
    const { error } = await sb.from('warehouse_stock').upsert(row, { onConflict: 'product_id' });
    if (error) {
      console.error('[admin-stock] upsert', error);
      showPanelError('שמירת הכמות נכשלה');
      return false;
    }
    qtyById.set(productId, row.qty);
    if (row.is_custom) customById.set(productId, row);
    showPanelError('');
    return true;
  }

  async function setQty(productId, nextQty) {
    if (busyId === productId) return;
    const qty = normalizeQty(nextQty);
    busyId = productId;
    const input = panelEl?.querySelector(`[data-stock-qty="${String(productId).replace(/"/g, '')}"]`);
    if (input) input.value = formatQty(qty);
    try {
      await upsertQty(productId, qty);
    } finally {
      busyId = '';
    }
  }

  function openAddModal() {
    if (!modal) return;
    fillCategorySelect();
    if (nameInput) nameInput.value = '';
    if (qtyInput) qtyInput.value = '0';
    showFormError('');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    if (typeof focusTrapRelease === 'function') focusTrapRelease();
    focusTrapRelease = global.LechaimFocusTrap?.activate?.(modal) || null;
    window.setTimeout(() => nameInput?.focus?.(), 40);
  }

  function closeAddModal() {
    if (!modal) return;
    if (typeof focusTrapRelease === 'function') focusTrapRelease();
    focusTrapRelease = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    const open = document.querySelector('.admin-modal:not([hidden])');
    if (!open) document.body.classList.remove('admin-modal-open');
    showFormError('');
  }

  function slugifyName(name) {
    const base = String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\u0590-\u05FFa-z0-9-]/gi, '')
      .slice(0, 40);
    return base || 'item';
  }

  async function saveNewProduct(event) {
    event.preventDefault();
    const name = String(nameInput?.value || '').trim();
    const categoryId = String(categorySelect?.value || '').trim();
    const qty = normalizeQty(qtyInput?.value);
    if (!name) {
      showFormError('כתבו שם מוצר');
      return;
    }
    if (!categoryId) {
      showFormError('בחרו קטגוריה');
      return;
    }
    const exists = mergedCategories()
      .flatMap((cat) => cat.items)
      .some((item) => item.name === name && item.categoryId === categoryId);
    if (exists) {
      showFormError('המוצר כבר קיים בקטגוריה הזו');
      return;
    }
    const productId = `stock-custom-${Date.now().toString(36)}-${slugifyName(name)}`;
    const ok = await upsertQty(productId, qty, {
      name,
      category_id: categoryId,
      group_id: null,
      is_custom: true,
    });
    if (!ok) {
      showFormError('לא ניתן להוסיף את המוצר כרגע');
      return;
    }
    closeAddModal();
    render();
  }

  async function deleteCustom(productId) {
    const row = customById.get(productId);
    if (!row) return;
    const ok = await showConfirm(`למחוק את "${row.name}"?`, 'מחק');
    if (!ok) return;
    const sb = getClient();
    if (!sb) {
      showPanelError('לא ניתן למחוק כרגע');
      return;
    }
    const { error } = await sb.from('warehouse_stock').delete().eq('product_id', productId);
    if (error) {
      console.error('[admin-stock] delete', error);
      showPanelError('המחיקה נכשלה');
      return;
    }
    customById.delete(productId);
    qtyById.delete(productId);
    render();
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    panelEl?.addEventListener('click', (event) => {
      const deltaBtn = event.target.closest('[data-stock-delta]');
      if (deltaBtn) {
        const id = deltaBtn.dataset.stockId;
        const delta = Number(deltaBtn.dataset.stockDelta) || 0;
        const current = qtyById.has(id) ? qtyById.get(id) : 0;
        setQty(id, Math.max(0, normalizeQty(current) + delta));
        return;
      }
      const delBtn = event.target.closest('[data-stock-delete]');
      if (delBtn) {
        deleteCustom(delBtn.dataset.stockDelete);
      }
    });

    panelEl?.addEventListener('change', (event) => {
      const input = event.target.closest('[data-stock-qty]');
      if (!input) return;
      setQty(input.dataset.stockQty, input.value);
    });

    formEl?.addEventListener('submit', saveNewProduct);
    cancelBtn?.addEventListener('click', closeAddModal);
    modalClose?.addEventListener('click', closeAddModal);
    modalBackdrop?.addEventListener('click', closeAddModal);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal && !modal.hidden) closeAddModal();
    });
  }

  async function start() {
    bindOnce();
    await loadRows();
    render();
  }

  global.LechaimAdminStock = {
    render: start,
    refresh: start,
  };
})(window);
