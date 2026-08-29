/**
 * LECHAIM — Shared kitchen unit counts (tablet cards, prep board, admin).
 * Always SUM(quantity). Sides inherit the parent main's ready state.
 */
(function (global) {
  'use strict';

  const BAR_ONLY_IDS = new Set(['fruit-plate', 'shabbat-fruit-plate']);

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function qtyOf(item) {
    return Math.max(0, Number(item?.qty ?? item?.quantity) || 0);
  }

  function productId(item) {
    return String(item?.productId || item?.product_id || '');
  }

  function parentId(item) {
    return item?.linkedToMainItemId || item?.parent_item_id
      ? String(item.linkedToMainItemId || item.parent_item_id)
      : '';
  }

  function isModifier(item) {
    const id = productId(item);
    return Boolean(
      global.DONENESS_IDS?.has?.(id)
      || global.SHAKE_BASE_IDS?.has?.(id)
      || global.LIMONANA_ALCOHOL_IDS?.has?.(id)
      || id.startsWith('doneness-')
      || id.startsWith('shake-base-')
      || id.startsWith('limonana-alcohol')
    );
  }

  function isStandaloneStarter(item) {
    const id = productId(item);
    return id === 'fries-classic' || id.startsWith('starter-');
  }

  function isSideItem(item) {
    if (!item || isStandaloneStarter(item) || isModifier(item)) return false;
    return Boolean(parentId(item));
  }

  function isMainItem(item) {
    if (!item || isModifier(item) || isSideItem(item)) return false;
    return true;
  }

  function barProductIds() {
    const ids = new Set(BAR_ONLY_IDS);
    const wanted = new Set(['coldDrinks', 'hotDrinks', 'cocktails']);
    (global.MENU_DATA?.categories || []).forEach((cat) => {
      if (!wanted.has(String(cat?.id || ''))) return;
      (cat.items || []).forEach((row) => {
        if (row?.id) ids.add(String(row.id));
      });
      (cat.subsections || []).forEach((sub) => {
        (sub.items || []).forEach((row) => {
          if (row?.id) ids.add(String(row.id));
        });
      });
    });
    (global.SHAKE_BASE_ITEMS || []).forEach((row) => {
      if (row?.id) ids.add(String(row.id));
    });
    (global.LIMONANA_ALCOHOL_ITEMS || []).forEach((row) => {
      if (row?.id) ids.add(String(row.id));
    });
    if (global.HAMBURGER_DRINK_IDS && typeof global.HAMBURGER_DRINK_IDS.forEach === 'function') {
      global.HAMBURGER_DRINK_IDS.forEach((id) => ids.add(String(id)));
    }
    return ids;
  }

  function isBarBonItem(item, byId, barIds, seen) {
    if (!item) return false;
    const pid = productId(item);
    if (global.DONENESS_IDS?.has?.(pid)) return false;
    if (pid && barIds.has(pid)) return true;
    const walk = seen || new Set();
    const id = String(item.itemId || item.id || '');
    if (id) {
      if (walk.has(id)) return Boolean(pid && barIds.has(pid));
      walk.add(id);
    }
    const link = parentId(item);
    if (!link) return false;
    const parent = byId.get(link);
    if (!parent) return false;
    if (String(parent.productId || parent.product_id) === String(global.HAMBURGER_MEAL_ID || 'hamburger-fries')) {
      return true;
    }
    return isBarBonItem(parent, byId, barIds, walk);
  }

  function indexById(items) {
    const byId = new Map();
    (items || []).forEach((item) => {
      const id = String(item?.itemId || item?.id || '');
      if (id) byId.set(id, item);
    });
    return byId;
  }

  function kitchenItems(items) {
    const list = items || [];
    const barIds = barProductIds();
    const byId = indexById(list);
    return list.filter((item) => !isBarBonItem(item, byId, barIds));
  }

  function isPrintedKitchenItem(item) {
    if (item?.wavePrinted === false || item?.printed === false) return false;
    return true;
  }

  function isDishReady(item) {
    return String(item?.kitchenStatus || item?.kitchen_status || '') === 'ready';
  }

  function isProgressUnit(item, byId) {
    if (!item || qtyOf(item) <= 0) return false;
    if (!isPrintedKitchenItem(item)) return false;
    if (isModifier(item)) return false;
    if (isSideItem(item)) return true;
    if (isMainItem(item)) return true;
    return false;
  }

  function isUnitReady(item, byId) {
    if (!item) return false;
    if (isSideItem(item)) {
      const parent = byId.get(parentId(item));
      if (parent) return isDishReady(parent);
      return isDishReady(item);
    }
    return isDishReady(item);
  }

  function isRemainingUnit(item, byId) {
    return isProgressUnit(item, byId) && !isUnitReady(item, byId);
  }

  function emptyProgress() {
    return {
      totalKitchenUnits: 0,
      readyKitchenUnits: 0,
      waitingKitchenUnits: 0,
      progressPercent: 0,
      allReady: false,
      ready: 0,
      total: 0,
      waiting: 0,
      percent: 0,
    };
  }

  function fromItems(items) {
    const list = kitchenItems(items);
    const byId = indexById(list);
    let total = 0;
    let ready = 0;
    list.forEach((item) => {
      if (!isProgressUnit(item, byId)) return;
      const qty = qtyOf(item);
      total += qty;
      if (isUnitReady(item, byId)) ready += qty;
    });
    const waiting = Math.max(0, total - ready);
    const percent = total > 0 ? Math.round((ready / total) * 100) : 0;
    return {
      totalKitchenUnits: total,
      readyKitchenUnits: ready,
      waitingKitchenUnits: waiting,
      progressPercent: percent,
      allReady: total > 0 && waiting === 0,
      ready,
      total,
      waiting,
      percent,
    };
  }

  function remainingItems(items) {
    const list = kitchenItems(items);
    const byId = indexById(list);
    return list.filter((item) => isRemainingUnit(item, byId));
  }

  function barHtml(progress, options) {
    const opts = options || {};
    const total = Number(progress?.totalKitchenUnits) || 0;
    if (total <= 0) return '';
    const ready = Number(progress.readyKitchenUnits) || 0;
    const pct = Math.max(0, Math.min(100, Number(progress.progressPercent) || 0));
    const compact = Boolean(opts.compact);
    const readyWord = opts.readyWord == null ? '' : String(opts.readyWord);
    const prefix = opts.className || (compact ? 'table-kprog' : 'kt-kprog');
    const tone = pct >= 100 ? 'ready' : (pct <= 0 ? 'idle' : 'mid');
    const check = progress.allReady ? '✓ ' : '';
    const complete = Boolean(progress.allReady) || pct >= 100;
    return `
      <span class="${escapeHtml(prefix)} is-${tone}${complete ? ' is-complete' : ''}">
        <span class="${escapeHtml(prefix)}__label">
          <span class="${escapeHtml(prefix)}__count" dir="ltr">${escapeHtml(`${check}${ready} / ${total}`)}</span>${
            !compact && readyWord ? ` ${escapeHtml(readyWord)}` : ''
          }
        </span>
        <span class="${escapeHtml(prefix)}__track" aria-hidden="true">
          <span class="${escapeHtml(prefix)}__fill" style="width:${escapeHtml(String(pct))}%"></span>
        </span>
      </span>
    `;
  }

  global.LechaimKitchenProgress = {
    fromItems,
    remainingItems,
    kitchenItems,
    isSideItem,
    isMainItem,
    isModifier,
    isRemainingUnit,
    isProgressUnit,
    isUnitReady,
    isPrintedKitchenItem,
    indexById,
    barHtml,
  };
})(window);
