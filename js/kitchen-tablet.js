/**
 * LECHAIM — Kitchen tablet UI
 * Default Greek. Admin always receives Hebrew labels / canned copy.
 */
(function () {
  'use strict';

  const api = window.LechaimKitchenAlerts;
  const i18n = window.LechaimKitchenI18n;
  const clockEl = document.getElementById('kt-clock');
  const statusEl = document.getElementById('kt-status');
  const flashEl = document.getElementById('kt-flash');
  const stockSheet = document.getElementById('kt-stock-sheet');
  const otherSheet = document.getElementById('kt-other-sheet');
  const closeSheet = document.getElementById('kt-close-sheet');
  const faultSheet = document.getElementById('kt-fault-sheet');
  const stockList = document.getElementById('kt-stock-list');
  const stockSearch = document.getElementById('kt-stock-search');
  const otherInput = document.getElementById('kt-other-input');
  const faultList = document.getElementById('kt-fault-list');
  const faultOther = document.getElementById('kt-fault-other');
  const faultInput = document.getElementById('kt-fault-input');
  const langBtn = document.getElementById('kt-lang');
  const tiles = document.querySelectorAll('[data-kt-type]');

  let lang = i18n?.getLang?.() || 'el';
  let sending = false;
  let catalog = [];
  let wakeLock = null;
  const pendingIds = new Set();

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function txt(key) {
    return i18n.t(lang, key);
  }

  function tickClock() {
    if (!clockEl) return;
    const d = new Date();
    clockEl.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('is-ok', kind === 'ok');
    statusEl.classList.toggle('is-err', kind === 'err');
  }

  function flash(text) {
    if (!flashEl) return;
    flashEl.textContent = text;
    flashEl.hidden = false;
    window.setTimeout(() => {
      flashEl.hidden = true;
    }, 1600);
  }

  function openSheet(el) {
    if (el) el.hidden = false;
  }

  function closeSheets() {
    if (stockSheet) stockSheet.hidden = true;
    if (otherSheet) otherSheet.hidden = true;
    if (closeSheet) closeSheet.hidden = true;
    if (faultSheet) faultSheet.hidden = true;
    if (faultOther) faultOther.hidden = true;
  }

  function hebrewName(item) {
    return String(item?.name || item?.id || '');
  }

  function kitchenName(item) {
    if (lang === 'el') {
      return i18n.dishEl(item.id) || item.printName || hebrewName(item);
    }
    return hebrewName(item);
  }

  function loadCatalog() {
    const inv = window.LechaimInventory;
    const raw = typeof inv?.getCatalog === 'function'
      ? inv.getCatalog({ scope: 'weekday' })
      : [];
    catalog = (raw || []).filter((item) => item?.id && !item.adminOnly);
  }

  function renderFaultList() {
    if (!faultList || !i18n.faultItems) return;
    faultList.innerHTML = i18n.faultItems().map((row) => `
      <button type="button" class="kt-fault-item${row.id === 'other' ? ' kt-fault-item--other' : ''}" data-fault-id="${escapeAttr(row.id)}">
        <span aria-hidden="true">${escapeHtml(row.icon || '')}</span>
        <span>${escapeHtml(lang === 'he' ? row.he : row.el)}</span>
      </button>
    `).join('');
  }

  function renderStockList() {
    if (!stockList) return;
    const q = String(stockSearch?.value || '').trim().toLowerCase();
    const rows = catalog.filter((item) => {
      if (!q) return true;
      const hay = `${kitchenName(item)} ${hebrewName(item)} ${item.categoryTitle || ''}`.toLowerCase();
      return hay.includes(q);
    });
    const otherBtn = `
      <button type="button" class="kt-item kt-item--other" data-kt-other>
        ➕ ${escapeHtml(txt('other'))}
      </button>
    `;
    if (!rows.length) {
      stockList.innerHTML = `${otherBtn}<p class="kt-status">${escapeHtml(txt('stockEmpty'))}</p>`;
      return;
    }
    stockList.innerHTML = otherBtn + rows.slice(0, 80).map((item) => `
      <button type="button" class="kt-item" data-product-id="${escapeAttr(item.id)}">
        ${escapeHtml(kitchenName(item))}
        <small>${escapeHtml(item.categoryTitle || '')}${item.available === false ? ` · ${escapeHtml(txt('stockOut'))}` : ''}</small>
      </button>
    `).join('');
  }

  function applyLang() {
    document.documentElement.lang = lang === 'he' ? 'he' : 'el';
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    const title = document.getElementById('kt-title');
    const sub = document.getElementById('kt-sub');
    if (title) title.textContent = txt('title');
    if (sub) sub.textContent = txt('sub');
    document.querySelectorAll('[data-kt-label]').forEach((el) => {
      el.textContent = txt(el.dataset.ktLabel);
    });
    const stockTitle = document.getElementById('kt-stock-title');
    const otherTitle = document.getElementById('kt-other-title');
    const faultTitle = document.getElementById('kt-fault-title');
    if (stockTitle) stockTitle.textContent = txt('stockTitle');
    if (otherTitle) otherTitle.textContent = txt('otherTitle');
    if (faultTitle) faultTitle.textContent = txt('faultTitle');
    const closeTitle = document.getElementById('kt-close-title');
    const closeYes = document.getElementById('kt-close-yes');
    const closeNo = document.getElementById('kt-close-no');
    if (closeTitle) closeTitle.textContent = txt('closeKitchenAsk');
    if (closeYes) closeYes.textContent = txt('closeKitchenYes');
    if (closeNo) closeNo.textContent = txt('closeKitchenNo');
    if (stockSearch) stockSearch.placeholder = txt('stockSearch');
    if (otherInput) otherInput.placeholder = txt('otherPlaceholder');
    if (faultInput) faultInput.placeholder = txt('faultOtherPlaceholder');
    const otherSend = document.getElementById('kt-other-send');
    const faultSend = document.getElementById('kt-fault-send');
    if (otherSend) otherSend.textContent = txt('otherSend');
    if (faultSend) faultSend.textContent = txt('send');
    langBtn?.querySelectorAll('[data-lang]').forEach((opt) => {
      opt.classList.toggle('is-active', opt.dataset.lang === lang);
    });
    renderFaultList();
    if (stockSheet && !stockSheet.hidden) renderStockList();
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

  async function send(payload) {
    if (sending) return;
    sending = true;
    tiles.forEach((btn) => { btn.disabled = true; });
    setStatus(txt('sending'));
    try {
      const row = await api.insertAlert(payload);
      if (row?.id) pendingIds.add(String(row.id));
      closeSheets();
      flash(txt('sent'));
      setStatus(txt('sentHint'), 'ok');
    } catch (err) {
      setStatus(err?.message || txt('fail'), 'err');
    } finally {
      sending = false;
      tiles.forEach((btn) => { btn.disabled = false; });
    }
  }

  async function holdWakeLock() {
    try {
      if (!navigator.wakeLock?.request) return;
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) { /* ignore */ }
  }

  langBtn?.addEventListener('click', (event) => {
    const opt = event.target.closest('[data-lang]');
    if (!opt) return;
    lang = i18n.setLang(opt.dataset.lang);
    applyLang();
  });

  document.querySelectorAll('[data-kt-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.ktType;
      if (type === 'out_of_stock') {
        if (stockSearch) stockSearch.value = '';
        renderStockList();
        openSheet(stockSheet);
        return;
      }
      if (type === 'message') {
        const cannedId = btn.dataset.ktCanned;
        const row = cannedId && i18n.canned?.().find((item) => item.id === cannedId);
        send({
          type: 'message',
          message: row?.he || 'כללי מהמטבח',
        });
        return;
      }
      if (type === 'close_kitchen') {
        openSheet(closeSheet);
        return;
      }
      if (type === 'fault') {
        if (faultOther) faultOther.hidden = true;
        if (faultInput) faultInput.value = '';
        renderFaultList();
        openSheet(faultSheet);
        return;
      }
      send({ type });
    });
  });

  stockList?.addEventListener('click', (event) => {
    if (event.target.closest('[data-kt-other]')) {
      if (otherInput) otherInput.value = '';
      stockSheet.hidden = true;
      openSheet(otherSheet);
      otherInput?.focus();
      return;
    }
    const btn = event.target.closest('[data-product-id]');
    if (!btn) return;
    const item = catalog.find((row) => row.id === btn.dataset.productId);
    send({
      type: 'out_of_stock',
      productId: btn.dataset.productId,
      productName: hebrewName(item) || btn.dataset.productId,
    });
  });

  stockSearch?.addEventListener('input', renderStockList);

  document.getElementById('kt-other-send')?.addEventListener('click', () => {
    const name = String(otherInput?.value || '').trim();
    if (!name) {
      setStatus(txt('needText'), 'err');
      return;
    }
    send({
      type: 'out_of_stock',
      productName: `אחר · ${name}`,
    });
  });

  document.getElementById('kt-close-yes')?.addEventListener('click', () => {
    send({ type: 'close_kitchen' });
  });

  faultList?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-fault-id]');
    if (!btn) return;
    const row = i18n.faultItems().find((item) => item.id === btn.dataset.faultId);
    if (!row) return;
    if (row.id === 'other') {
      if (faultOther) faultOther.hidden = false;
      faultInput?.focus();
      return;
    }
    send({
      type: 'fault',
      productId: row.id,
      productName: row.he,
    });
  });

  document.getElementById('kt-fault-send')?.addEventListener('click', () => {
    const note = String(faultInput?.value || '').trim();
    if (!note) {
      setStatus(txt('needText'), 'err');
      return;
    }
    send({
      type: 'fault',
      productId: 'other',
      productName: 'משהו אחר',
      message: note,
    });
  });

  document.querySelectorAll('[data-kt-close]').forEach((btn) => {
    btn.addEventListener('click', closeSheets);
  });

  [stockSheet, otherSheet, closeSheet, faultSheet].forEach((sheet) => {
    sheet?.addEventListener('click', (event) => {
      if (event.target === sheet) closeSheets();
    });
  });

  api?.subscribe?.((payload) => {
    const row = payload?.new || payload?.old;
    const id = String(row?.id || '');
    if (!id || !pendingIds.has(id)) return;
    if (payload?.eventType === 'UPDATE' && row?.status === 'acknowledged') {
      pendingIds.delete(id);
      flash(txt('ack'));
      setStatus(txt('ack'), 'ok');
    }
  });

  tickClock();
  window.setInterval(tickClock, 15000);
  holdWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') holdWakeLock();
  });

  applyLang();

  const inv = window.LechaimInventory;
  Promise.resolve(inv?.load?.())
    .catch(() => {})
    .then(() => {
      loadCatalog();
    });
})();
