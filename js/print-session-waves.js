/**
 * LECHAIM — Shared unprinted-wave print helper (Admin + Service).
 * Builds the same delta ticket Admin uses, then calls LechaimPrintEngine.printOrder.
 * Does not own printers / print_jobs / agent.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.LechaimPrintSessionWaves = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function orderHasLiveItems(order) {
    const lines = Array.isArray(order?.order_items) ? order.order_items : [];
    return lines.some((row) => (Number(row?.quantity) || 0) > 0);
  }

  function isOrderPrinted(order, locallyPrintedIds) {
    if (!order) return false;
    if (order.printed_at) return true;
    if (locallyPrintedIds && locallyPrintedIds.has(String(order.id || ''))) return true;
    return false;
  }

  function unprintedWaves(orders, locallyPrintedIds) {
    return (orders || []).filter((order) => (
      order
      && order.id
      && !isOrderPrinted(order, locallyPrintedIds)
      && orderHasLiveItems(order)
    ));
  }

  function stripWeightFromProductName(name) {
    return String(name || '')
      .replace(/\s*[–-]\s*\d+(?:[.,]\d+)?\s*ק["״]?ג\.?/gi, '')
      .replace(/\s*[–-]\s*\d+(?:[.,]\d+)?\s*kg\b/gi, '')
      .trim();
  }

  function mapRemoteItem(row, extras) {
    const weight = Number(row.selected_weight);
    const name = stripWeightFromProductName(
      row.product_name || row.print_name || row.product_id || ''
    );
    return {
      itemId: String(row.id),
      orderId: extras.orderId ? String(extras.orderId) : '',
      productId: String(row.product_id || ''),
      name,
      printName: row.print_name || '',
      price: Number(row.price) || 0,
      qty: Number(row.quantity) || 0,
      notes: row.notes == null ? '' : String(row.notes),
      printed: false,
      linkedToMainItemId: row.parent_item_id ? String(row.parent_item_id) : null,
      isLateAdd: Boolean(extras.isLateAdd),
      selectedWeight: Number.isFinite(weight) && weight > 0 ? weight : null,
      pricePerKg: row.price_per_kg == null ? null : Number(row.price_per_kg),
      unitType: row.unit_type || null,
      thawCount: row.thaw_count == null ? null : Number(row.thaw_count),
      waveId: extras.waveId || null,
    };
  }

  function flattenOrders(orders, locallyPrintedIds) {
    const items = [];
    const sorted = [...(orders || [])].sort((a, b) => {
      const ta = Date.parse(a?.created_at || '') || 0;
      const tb = Date.parse(b?.created_at || '') || 0;
      if (ta !== tb) return ta - tb;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });
    sorted.forEach((order) => {
      const isLateAdd = !isOrderPrinted(order, locallyPrintedIds);
      const lines = Array.isArray(order.order_items) ? order.order_items : [];
      lines.forEach((row) => {
        const mapped = mapRemoteItem(row, {
          isLateAdd,
          waveId: order.id ? String(order.id) : '',
          orderId: order.id ? String(order.id) : '',
        });
        if (mapped.qty > 0) items.push(mapped);
      });
    });
    return items;
  }

  function withLinkedCompanions(sourceItems, liveItems) {
    const live = Array.isArray(liveItems) ? liveItems : [];
    const out = [];
    const ids = new Set();

    function add(row) {
      const id = String(row?.itemId || '');
      if (!id || ids.has(id)) return false;
      ids.add(id);
      out.push(row);
      return true;
    }

    (Array.isArray(sourceItems) ? sourceItems : []).forEach(add);

    let grew = true;
    while (grew) {
      grew = false;
      live.forEach((row) => {
        const id = String(row?.itemId || '');
        if (!id || ids.has(id) || Number(row?.qty) <= 0) return;
        const parentId = row.linkedToMainItemId ? String(row.linkedToMainItemId) : '';
        if (parentId && ids.has(parentId)) {
          if (add(row)) grew = true;
          return;
        }
        if (!parentId && out.some((item) => String(item.linkedToMainItemId || '') === id)) {
          if (add(row)) grew = true;
        }
      });
    }
    return out;
  }

  /**
   * Same delta rule as Admin mapEntryToPrintOrder:
   * unprinted wave items only when present; else full order fallback.
   */
  function buildPrintOrderFromSession(options) {
    const tableNumber = Number(options?.tableNumber);
    const sessionId = String(options?.sessionId || '');
    const orders = Array.isArray(options?.orders) ? options.orders : [];
    const locallyPrintedIds = options?.locallyPrintedIds || null;
    const liveItems = flattenOrders(orders, locallyPrintedIds);
    const lateItems = liveItems.filter((row) => row && row.isLateAdd);
    const sourceItems = withLinkedCompanions(
      lateItems.length ? lateItems : liveItems,
      liveItems
    );
    const items = sourceItems
      .map((row) => ({
        itemId: String(row.itemId),
        productId: String(row.productId || ''),
        name: row.printName || row.name || row.productId || '',
        printName: row.printName || '',
        price: Number(row.price) || 0,
        qty: Number(row.qty) || 0,
        notes: row.notes == null ? '' : String(row.notes),
        printed: false,
        linkedToMainItemId: row.linkedToMainItemId || null,
        unitType: row.unitType || null,
        pricePerKg: row.pricePerKg == null ? null : Number(row.pricePerKg),
        thawCount: row.thawCount == null ? null : Number(row.thawCount),
      }))
      .filter((row) => row.qty > 0);

    const pending = unprintedWaves(orders, locallyPrintedIds);
    const waveForSeq = (pending.length ? pending : orders).reduce(
      (max, row) => Math.max(max, Number(row.order_number) || 0),
      0
    );

    return {
      orderId: `print-${sessionId || tableNumber || 'order'}`,
      sessionId,
      tableNumber: Number.isFinite(tableNumber) && tableNumber > 0 ? tableNumber : null,
      orderType: 'dinein',
      status: 'active',
      items,
      ticketSeq: waveForSeq || 1,
      _skipLocalMarkPrinted: true,
      _deltaOnly: lateItems.length > 0,
      _waveIds: pending.map((row) => String(row.id)),
      _lateOnly: lateItems.length > 0,
    };
  }

  function wavesNeedingApprove(orders, locallyPrintedIds) {
    return unprintedWaves(orders, locallyPrintedIds).filter((order) => {
      const status = String(order.status || 'submitted').toLowerCase();
      return status === 'submitted' || status === '';
    });
  }

  /**
   * Approve (if needed) → LechaimPrintEngine.printOrder → markOrderPrinted.
   * Returns { ok, printed, saved, errorCode, messageKey }.
   */
  async function printUnprintedSessionWaves(options) {
    const api = options?.api || (typeof globalThis !== 'undefined'
      ? globalThis.LechaimSupabaseOrders
      : null);
    const print = options?.printEngine || (typeof globalThis !== 'undefined'
      ? globalThis.LechaimPrintEngine
      : null);
    const tableNumber = Number(options?.tableNumber);
    let sessionId = String(options?.sessionId || '');
    let orders = Array.isArray(options?.orders) ? options.orders : null;
    const locallyPrintedIds = options?.locallyPrintedIds || new Set();

    if (!print || typeof print.printOrder !== 'function') {
      return { ok: false, printed: false, saved: true, errorCode: 'no_engine', messageKey: 'printUnavailable' };
    }
    if (!api?.getSessionOrders || !api?.markOrderPrinted) {
      return { ok: false, printed: false, saved: true, errorCode: 'no_api', messageKey: 'printUnavailable' };
    }
    if (!sessionId) {
      return { ok: false, printed: false, saved: true, errorCode: 'no_session', messageKey: 'printUnavailable' };
    }

    try {
      if (!orders) orders = await api.getSessionOrders(sessionId);
    } catch (_) {
      return { ok: false, printed: false, saved: true, errorCode: 'load_failed', messageKey: 'printFailed' };
    }

    const pending = unprintedWaves(orders, locallyPrintedIds);
    if (!pending.length) {
      return { ok: false, printed: false, saved: true, errorCode: 'nothing', messageKey: 'nothingToPrint' };
    }

    const toApprove = wavesNeedingApprove(orders, locallyPrintedIds);
    if (typeof api.markOrderApproved === 'function') {
      for (const order of toApprove) {
        try {
          await api.markOrderApproved(order.id);
          order.status = 'preparing';
        } catch (_) {
          /* print may still work; Admin also retries mark after paper */
        }
      }
    }

    const synthetic = buildPrintOrderFromSession({
      tableNumber,
      sessionId,
      orders,
      locallyPrintedIds,
    });
    if (!synthetic.items.length) {
      return { ok: false, printed: false, saved: true, errorCode: 'nothing', messageKey: 'nothingToPrint' };
    }

    let printedOk = false;
    try {
      const ok = await print.printOrder(synthetic);
      printedOk = ok === true;
    } catch (_) {
      printedOk = false;
    }

    if (!printedOk) {
      return { ok: false, printed: false, saved: true, errorCode: 'print_failed', messageKey: 'orderSavedPrintFailed' };
    }

    const failedIds = [];
    for (const order of pending) {
      let marked = false;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await api.markOrderPrinted(order.id);
          locallyPrintedIds.add(String(order.id));
          marked = true;
          break;
        } catch (_) {
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          }
        }
      }
      if (!marked) failedIds.push(order.id);
    }

    return {
      ok: true,
      printed: true,
      saved: true,
      errorCode: failedIds.length ? 'mark_partial' : null,
      messageKey: 'printOk',
      waveIds: pending.map((row) => String(row.id)),
      deltaOnly: synthetic._deltaOnly,
      itemCount: synthetic.items.length,
    };
  }

  /**
   * Target order for silent "add to table": prefer latest unprinted wave,
   * else latest printed wave in the same session. Never invents a new order id.
   */
  function pickSessionAddTargetOrder(orders) {
    const list = (orders || []).filter((order) => order && order.id);
    if (!list.length) return null;
    const byNumDesc = (a, b) => (Number(b.order_number) || 0) - (Number(a.order_number) || 0);
    const unprinted = list.filter((order) => !order.printed_at).sort(byNumDesc);
    if (unprinted[0]) return unprinted[0];
    return list.slice().sort(byNumDesc)[0];
  }

  function partitionOrderLines(orders, locallyPrintedIds) {
    const existing = [];
    const pending = [];
    flattenOrders(orders, locallyPrintedIds).forEach((row) => {
      const line = {
        name: row.name || row.printName || row.productId,
        qty: row.qty,
        notes: row.notes || '',
        isLateAdd: Boolean(row.isLateAdd),
      };
      if (row.isLateAdd) pending.push(line);
      else existing.push(line);
    });
    return { existing, pending };
  }

  return {
    orderHasLiveItems,
    isOrderPrinted,
    unprintedWaves,
    flattenOrders,
    withLinkedCompanions,
    buildPrintOrderFromSession,
    wavesNeedingApprove,
    printUnprintedSessionWaves,
    pickSessionAddTargetOrder,
    partitionOrderLines,
  };
});
