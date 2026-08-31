/**
 * LECHAIM — Display grouping + unit stepper for kitchen / admin.
 * Does not change order_items schema. Uses existing peel (qty split) + kitchen_status.
 */
(function (global) {
  'use strict';

  function isKitchenModifier(item) {
    const id = String(item?.productId || item?.product_id || '');
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
    const id = String(item?.productId || item?.product_id || '');
    return id === 'fries-classic' || id.startsWith('starter-');
  }

  function isAddon(item) {
    if (isStandaloneStarter(item)) return false;
    if (isKitchenModifier(item)) return true;
    return Boolean(item?.linkedToMainItemId || item?.parent_item_id);
  }

  function isReady(item) {
    return String(item?.kitchenStatus || item?.kitchen_status || '') === 'ready';
  }

  function qtyOf(item) {
    return Math.max(0, Number(item?.qty ?? item?.quantity) || 0);
  }

  function findCatalogProduct(productId) {
    const id = String(productId || '');
    if (!id) return null;
    const extras = []
      .concat(global.HOT_SIDE_ITEMS || [])
      .concat(global.SHAKE_BASE_ITEMS || [])
      .concat(global.DONENESS_ITEMS || [])
      .concat(global.LIMONANA_ALCOHOL_ITEMS || []);
    const extra = extras.find((row) => String(row.id) === id);
    if (extra) return extra;
    const cats = global.MENU_DATA?.categories || [];
    for (let i = 0; i < cats.length; i += 1) {
      const items = cats[i].items || [];
      for (let j = 0; j < items.length; j += 1) {
        if (String(items[j].id) === id) return items[j];
      }
      const subs = cats[i].subsections || [];
      for (let s = 0; s < subs.length; s += 1) {
        const subItems = subs[s].items || [];
        for (let j = 0; j < subItems.length; j += 1) {
          if (String(subItems[j].id) === id) return subItems[j];
        }
      }
    }
    return null;
  }

  function catalogHebrewName(productId) {
    const product = findCatalogProduct(productId);
    const name = product?.name != null ? String(product.name).trim() : '';
    return name;
  }

  function catalogPrintName(productId) {
    const product = findCatalogProduct(productId);
    const name = product?.printName != null ? String(product.printName).trim() : '';
    return name;
  }

  function scaleSidesToUnit(sides, parentQty) {
    const units = Math.max(1, Number(parentQty) || 1);
    return (sides || [])
      .map((side) => {
        const sq = qtyOf(side);
        const per = sq / units;
        if (Number.isInteger(per) && per >= 1) return { ...side, qty: per };
        return { ...side, qty: sq };
      })
      .filter((side) => qtyOf(side) > 0);
  }

  function sideSignature(side, parentQty) {
    const units = Math.max(1, Number(parentQty) || 1);
    const sq = qtyOf(side);
    const per = units > 0 ? sq / units : sq;
    const perKey = Number.isInteger(per) ? String(per) : `${sq}/${units}`;
    return [
      String(side?.productId || ''),
      perKey,
      String(side?.notes || '').trim(),
    ].join('\x1f');
  }

  function identityKey(main, sides) {
    const sidePart = (sides || [])
      .map((side) => sideSignature(side, main?.qty))
      .sort()
      .join('\x1e');
    return [
      String(main?.productId || ''),
      String(main?.notes || '').trim(),
      sidePart,
    ].join('\x1d');
  }

  function attachParentGroups(items) {
    const list = (items || []).filter((item) => qtyOf(item) > 0);
    const sidesByParent = new Map();
    list.forEach((item) => {
      if (!item.linkedToMainItemId) return;
      const key = String(item.linkedToMainItemId);
      if (!sidesByParent.has(key)) sidesByParent.set(key, []);
      sidesByParent.get(key).push(item);
    });
    const used = new Set();
    const groups = [];
    list.forEach((item) => {
      if (isAddon(item)) return;
      const sides = (sidesByParent.get(String(item.itemId)) || []).slice();
      sides.forEach((side) => used.add(String(side.itemId)));
      groups.push({ main: item, sides });
    });
    list.forEach((item) => {
      if (!isAddon(item) || used.has(String(item.itemId))) return;
      const parent = groups.find((row) => String(row.main.itemId) === String(item.linkedToMainItemId));
      if (parent) {
        parent.sides.push(item);
        used.add(String(item.itemId));
        return;
      }
      if (isKitchenModifier(item)) {
        const target = groups[groups.length - 1];
        if (!target) return;
        target.sides.push(item);
        used.add(String(item.itemId));
        return;
      }
      groups.push({ main: item, sides: [] });
      used.add(String(item.itemId));
    });
    return groups;
  }

  function buildDisplayGroups(items) {
    const attached = attachParentGroups(items);
    const map = new Map();
    const order = [];
    attached.forEach((row) => {
      const key = identityKey(row.main, row.sides);
      let pack = map.get(key);
      if (!pack) {
        pack = { key, clusters: [] };
        map.set(key, pack);
        order.push(pack);
      }
      pack.clusters.push(row);
    });
    return order.map((pack) => {
      const mains = pack.clusters.map((row) => row.main);
      const totalQty = mains.reduce((sum, item) => sum + qtyOf(item), 0);
      const readyQty = mains.filter(isReady).reduce((sum, item) => sum + qtyOf(item), 0);
      const remainingQty = Math.max(0, totalQty - readyQty);
      const first = pack.clusters[0];
      return {
        key: pack.key,
        clusters: pack.clusters,
        main: first.main,
        sides: scaleSidesToUnit(first.sides, first.main.qty),
        mains,
        items: pack.clusters.flatMap((row) => [row.main].concat(row.sides || [])),
        totalQty,
        readyQty,
        remainingQty,
        allReady: totalQty > 0 && remainingQty <= 0,
        anyUrgent: mains.some((item) => item.kitchenUrgent && !isReady(item)),
        anyLate: mains.some((item) => item.isLate || item.isLateAdd),
        noteItem: mains.find((item) => String(item.notes || item.notesEl || '').trim()) || first.main,
      };
    });
  }

  function pickUnit(group, makingReady) {
    const pool = (group?.mains || []).filter((item) => (makingReady ? !isReady(item) : isReady(item)));
    if (!pool.length) return null;
    return pool.find((item) => qtyOf(item) === 1) || pool[0];
  }

  async function peelOneUnit(api, item, allItems, unitStatus) {
    const orderId = item.orderId || item.order_id;
    const qty = Math.max(1, qtyOf(item) || 1);
    if (qty <= 1 || !orderId || !api?.bumpOrderItemQuantity || !api?.createOrderItems) {
      await api.updateItemKitchenStatus(item.itemId, unitStatus);
      return;
    }

    const sides = (allItems || []).filter((row) => String(row.linkedToMainItemId || '') === String(item.itemId));
    let peeled = false;
    try {
      await api.bumpOrderItemQuantity(item.itemId, -1);
      peeled = true;
      const created = await api.createOrderItems(orderId, [{
        productId: item.productId,
        productName: item.name,
        printName: item.printName,
        quantity: 1,
        price: Number(item.price) || 0,
        notes: item.notes || null,
        notesEl: item.notesEl || item.notes_el || null,
        kitchenStatus: unitStatus,
        createdAt: item.createdAt || null,
      }]);
      const newMainId = created?.[0]?.id;

      for (const side of sides) {
        const sideQty = qtyOf(side);
        const per = qty > 0 ? sideQty / qty : 0;
        if (!(Number.isInteger(per) && per >= 1 && side.itemId && newMainId)) continue;
        await api.bumpOrderItemQuantity(side.itemId, -per);
        await api.createOrderItems(orderId, [{
          productId: side.productId,
          productName: side.name,
          printName: side.printName,
          quantity: per,
          price: Number(side.price) || 0,
          notes: side.notes || null,
          notesEl: side.notesEl || side.notes_el || null,
          parentItemId: newMainId,
          createdAt: side.createdAt || item.createdAt || null,
        }]);
      }
    } catch (err) {
      if (peeled) {
        try { await api.bumpOrderItemQuantity(item.itemId, 1); } catch (_) { /* ignore */ }
      }
      throw err;
    }
  }

  /**
   * @param {number} delta  -1 = mark one unit ready (minus), +1 = return one unit to waiting (plus)
   */
  async function bumpGroup(api, group, allItems, delta) {
    const makingReady = Number(delta) < 0;
    if (makingReady && !(group?.remainingQty > 0)) return { ok: false, reason: 'min' };
    if (!makingReady && !(group?.remainingQty < group?.totalQty)) return { ok: false, reason: 'max' };
    const item = pickUnit(group, makingReady);
    if (!item?.itemId || !api?.updateItemKitchenStatus) return { ok: false, reason: 'none' };
    await peelOneUnit(api, item, allItems, makingReady ? 'ready' : 'waiting');
    if (makingReady && qtyOf(item) <= 1 && item.kitchenUrgent && api.updateItemKitchenUrgent) {
      try { await api.updateItemKitchenUrgent(item.itemId, false); } catch (_) { /* ignore */ }
    }
    return { ok: true, itemId: item.itemId };
  }

  global.LechaimKitchenDishGroups = {
    isAddon,
    isKitchenModifier,
    isStandaloneStarter,
    isReady,
    qtyOf,
    findCatalogProduct,
    catalogHebrewName,
    catalogPrintName,
    attachParentGroups,
    buildDisplayGroups,
    pickUnit,
    peelOneUnit,
    bumpGroup,
  };
})(window);
