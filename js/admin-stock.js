/**
 * LECHAIM — Warehouse catalog view (admin).
 * Isolated from dish inventory cards / yes-no toggles.
 */
(function (global) {
  'use strict';

  const panelEl = document.getElementById('admin-stock-panel');

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;');
  }

  function renderRow(item) {
    return `
      <article class="stock-row" data-stock-id="${escapeHtml(item.id)}">
        <div class="stock-row__name">${escapeHtml(item.name)}</div>
        <div class="stock-row__slot stock-row__slot--qty" hidden></div>
        <div class="stock-row__slot stock-row__slot--unit" hidden></div>
        <div class="stock-row__slot stock-row__slot--min" hidden></div>
        <div class="stock-row__slot stock-row__slot--alert" hidden></div>
        <div class="stock-row__slot stock-row__slot--actions" hidden></div>
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
            ${group.items.map(renderRow).join('')}
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

  function render() {
    if (!panelEl) return;
    const categories = global.LechaimStockCatalog?.getCatalog?.() || [];
    const total = categories.reduce((sum, cat) => sum + cat.items.length, 0);
    panelEl.innerHTML = `
      <p class="stock-catalog__lead">קטלוג מחסן · ${total} מוצרים · ${categories.length} קטגוריות</p>
      <div class="stock-catalog">
        ${categories.map(renderCategory).join('')}
      </div>
    `;
  }

  global.LechaimAdminStock = {
    render,
  };
})(window);
