/**
 * LECHAIM — Drag-reorder Admin tabs within/between תפעול / ניהול.
 * Order saved on restaurant_flags.admin_tabs_order (flag_text JSON).
 */
(function (global) {
  'use strict';

  const FLAG_KEY = 'admin_tabs_order';
  const DEFAULT_ORDER = {
    ops: ['tables', 'reservations', 'support', 'pickup', 'delivery', 'butcher', 'shabbat'],
    mgmt: [
      'kitchen', 'staff-hours', 'notes', 'history', 'till', 'inventory',
      'warehouse', 'documents', 'stats', 'settings', 'dashboard',
    ],
  };

  let bound = false;
  let dragTab = null;
  let suppressClick = false;
  let saveTimer = null;

  function getClient() {
    return global.LechaimInventory?.getClient?.()
      || global.LechaimSupabaseOrders?.getClient?.()
      || null;
  }

  function rowEl(group) {
    return document.querySelector(`[data-tabs-row="${group}"]`);
  }

  function allTabButtons() {
    const map = new Map();
    ['ops', 'mgmt'].forEach((group) => {
      const row = rowEl(group);
      if (!row) return;
      row.querySelectorAll('.admin-tab[data-tab]').forEach((btn) => {
        map.set(btn.dataset.tab, btn);
      });
    });
    return map;
  }

  function clearDragOver() {
    document.querySelectorAll('.admin-tab.is-drag-over').forEach((el) => {
      el.classList.remove('is-drag-over');
    });
  }

  function insertRelative(row, over, clientX) {
    if (!dragTab || !row) return;
    if (!over || over === dragTab || !row.contains(over)) {
      row.appendChild(dragTab);
      return;
    }
    const rect = over.getBoundingClientRect();
    const afterMid = clientX > rect.left + rect.width / 2;
    // RTL: higher X is visually "before" (to the left of flow start on the right)
    if (document.documentElement.dir === 'rtl') {
      if (afterMid) row.insertBefore(dragTab, over);
      else row.insertBefore(dragTab, over.nextSibling);
    } else if (afterMid) {
      row.insertBefore(dragTab, over.nextSibling);
    } else {
      row.insertBefore(dragTab, over);
    }
  }

  function readOrderFromDom() {
    const order = { ops: [], mgmt: [] };
    ['ops', 'mgmt'].forEach((group) => {
      const row = rowEl(group);
      if (!row) return;
      row.querySelectorAll('.admin-tab[data-tab]').forEach((btn) => {
        const tab = btn.dataset.tab;
        if (tab) order[group].push(tab);
      });
    });
    return order;
  }

  function applyOrder(order) {
    const next = {
      ops: Array.isArray(order?.ops) ? order.ops.slice() : DEFAULT_ORDER.ops.slice(),
      mgmt: Array.isArray(order?.mgmt) ? order.mgmt.slice() : DEFAULT_ORDER.mgmt.slice(),
    };
    const byId = allTabButtons();
    const placed = new Set();

    ['ops', 'mgmt'].forEach((group) => {
      const row = rowEl(group);
      if (!row) return;
      next[group].forEach((tab) => {
        const btn = byId.get(tab);
        if (!btn || placed.has(tab)) return;
        row.appendChild(btn);
        placed.add(tab);
      });
    });

    byId.forEach((btn, tab) => {
      if (placed.has(tab)) return;
      const fallback = DEFAULT_ORDER.ops.includes(tab) ? 'ops' : 'mgmt';
      rowEl(fallback)?.appendChild(btn);
    });
  }

  async function loadOrder() {
    const sb = getClient();
    if (!sb) return;
    try {
      const { data, error } = await sb
        .from('restaurant_flags')
        .select('flag_text')
        .eq('flag_key', FLAG_KEY)
        .maybeSingle();
      if (error) throw error;
      const raw = data?.flag_text == null ? '' : String(data.flag_text).trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      applyOrder(parsed);
    } catch (err) {
      console.warn('[admin-tabs-order] load', err);
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveOrder().catch((err) => console.warn('[admin-tabs-order] save', err));
    }, 250);
  }

  async function saveOrder() {
    const sb = getClient();
    if (!sb) return;
    const order = readOrderFromDom();
    const { data: authData } = await sb.auth.getSession();
    if (!authData?.session) return;
    const { error } = await sb.from('restaurant_flags').upsert({
      flag_key: FLAG_KEY,
      flag_value: true,
      flag_text: JSON.stringify(order),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'flag_key' });
    if (error) throw error;
  }

  function bindRow(row) {
    if (!row || row.dataset.tabsOrderBound === '1') return;
    row.dataset.tabsOrderBound = '1';

    row.addEventListener('dragstart', (event) => {
      const tab = event.target.closest('.admin-tab[data-tab]');
      if (!tab || !row.contains(tab)) return;
      dragTab = tab;
      suppressClick = false;
      tab.classList.add('is-dragging');
      try {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', tab.dataset.tab || '');
      } catch (_) { /* ignore */ }
    });

    row.addEventListener('dragend', () => {
      if (dragTab) dragTab.classList.remove('is-dragging');
      clearDragOver();
      dragTab = null;
      window.setTimeout(() => { suppressClick = false; }, 0);
    });

    row.addEventListener('dragover', (event) => {
      if (!dragTab) return;
      event.preventDefault();
      try { event.dataTransfer.dropEffect = 'move'; } catch (_) { /* ignore */ }

      const over = event.target.closest('.admin-tab[data-tab]');
      clearDragOver();
      if (over && over !== dragTab && row.contains(over)) {
        over.classList.add('is-drag-over');
      }
      insertRelative(row, over && row.contains(over) ? over : null, event.clientX);
      suppressClick = true;
    });

    row.addEventListener('drop', (event) => {
      event.preventDefault();
      if (!dragTab) return;
      clearDragOver();
      // Ensure tab lands in this row even if drop hit empty padding
      if (!row.contains(dragTab)) row.appendChild(dragTab);
      suppressClick = true;
      scheduleSave();
    });

    row.addEventListener('click', (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }, true);
  }

  function bind() {
    if (bound) return;
    bound = true;
    bindRow(rowEl('ops'));
    bindRow(rowEl('mgmt'));
  }

  async function start() {
    bind();
    await loadOrder();
  }

  global.LechaimAdminTabsOrder = { start, applyOrder, loadOrder };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bind();
    });
  } else {
    bind();
  }
})(window);
