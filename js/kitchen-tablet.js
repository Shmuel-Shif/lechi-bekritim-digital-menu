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
  const chatBtn = document.getElementById('kt-chat-btn');
  const chatBadge = document.getElementById('kt-chat-badge');
  const chatSheet = document.getElementById('kt-chat-sheet');
  const chatLog = document.getElementById('kt-chat-log');
  const chatInput = document.getElementById('kt-chat-input');
  const tiles = document.querySelectorAll('[data-kt-type]');

  const PENDING_KEY = 'lechaim-kitchen-pending';
  const SEEN_KEY = 'lechaim-kitchen-chat-seen';
  const HINT_TTL_MS = 30000;

  let lang = i18n?.getLang?.() || 'el';
  let sending = false;
  let catalog = [];
  let wakeLock = null;
  let pending = [];
  let thread = [];
  let audioCtx = null;
  const seenAck = new Set();

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
    }, 3200);
  }

  function playAckChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      [
        { freq: 784, at: 0, dur: 0.16 },
        { freq: 1046, at: 0.14, dur: 0.28 },
      ].forEach((tone) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.22, now + tone.at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (_) { /* ignore */ }
  }

  function clockNow() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function loadStore() {
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || '[]') || [];
    } catch (_) {
      pending = [];
    }
    if (!Array.isArray(pending)) pending = [];
  }

  function saveStore() {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending.slice(0, 20)));
    } catch (_) { /* ignore */ }
  }

  function extraLabel(entry) {
    if (lang === 'el') return entry?.extraEl || entry?.extra || '';
    return entry?.extraHe || entry?.extra || '';
  }

  function entryLabel(entry) {
    const extra = extraLabel(entry);
    if (entry?.canned) return extra ? `${txt(entry.canned)} · ${extra}` : txt(entry.canned);
    if (entry?.type === 'out_of_stock') {
      return extra ? `${txt('stock')} · ${extra}` : txt('stock');
    }
    if (entry?.type === 'fault') {
      return extra ? `${txt('fault')} · ${extra}` : txt('fault');
    }
    if (entry?.type === 'close_kitchen') return txt('closeKitchen');
    if (entry?.type === 'pace' || entry?.type === 'no_orders' || entry?.type === 'building') {
      return txt('pace');
    }
    return txt(entry?.type || '') || String(entry?.type || '');
  }

  function tileFor(entry) {
    if (entry?.canned) return document.querySelector(`[data-kt-canned="${entry.canned}"]`);
    if (entry?.type) return document.querySelector(`[data-kt-type="${entry.type}"]`);
    return null;
  }

  function setTileHint(el, text, state) {
    if (!el) return;
    let hint = el.querySelector('.kt-tile__hint');
    if (!hint) {
      hint = document.createElement('span');
      hint.className = 'kt-tile__hint';
      el.appendChild(hint);
    }
    el.classList.remove('is-waiting', 'is-acked');
    if (!state) {
      hint.hidden = true;
      hint.textContent = '';
      return;
    }
    el.classList.add(`is-${state}`);
    hint.hidden = false;
    hint.textContent = text;
  }

  function paintTile(entry, state) {
    const el = tileFor(entry);
    if (!el) return;
    if (state === 'waiting') {
      setTileHint(el, txt('sent'), 'waiting');
      return;
    }
    if (state === 'acked') {
      setTileHint(el, txt('approved'), 'acked');
      window.setTimeout(() => {
        if (!pending.some((row) => tileFor(row) === el)) {
          setTileHint(el, '', '');
        }
      }, HINT_TTL_MS);
    }
  }

  function clockFromIso(iso) {
    const d = new Date(iso || '');
    if (Number.isNaN(d.getTime())) return clockNow();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function getSeenAt() {
    try {
      return Number(localStorage.getItem(SEEN_KEY) || 0);
    } catch (_) {
      return 0;
    }
  }

  function isChatOpen() {
    return Boolean(chatSheet && !chatSheet.hidden);
  }

  function markChatSeen() {
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch (_) { /* ignore */ }
    updateChatBadge();
  }

  function updateChatBadge() {
    if (!chatBadge) return;
    if (isChatOpen()) {
      chatBadge.hidden = true;
      chatBadge.textContent = '0';
      chatBtn?.classList.remove('has-badge');
      return;
    }
    const seen = getSeenAt();
    const unread = thread.filter((row) => {
      if (row.sender === 'admin') {
        return new Date(row.created_at || 0).getTime() > seen;
      }
      return row.status === 'acked' && Number(row.ackedAt || 0) > seen;
    }).length;
    chatBadge.textContent = String(unread);
    chatBadge.hidden = unread <= 0;
    chatBtn?.classList.toggle('has-badge', unread > 0);
  }

  function chatLineText(row) {
    if (row.sender === 'admin') {
      return row.body || '';
    }
    const label = entryLabel({
      type: row.alert_type || row.type,
      canned: row.canned_id || row.canned,
      extra: row.extra,
      extraEl: row.extraEl,
      extraHe: row.extraHe || row.extra,
    });
    if (row.alert_id || row.alert_type || row.canned_id) {
      if (row.status === 'acked') return `${txt('approved')}: ${label}`;
      return `${txt('sent')}: ${label}`;
    }
    return row.body || label;
  }

  function renderChat() {
    if (!chatLog) return;
    if (!thread.length) {
      chatLog.innerHTML = `<p class="kt-status">${escapeHtml(txt('chatEmpty'))}</p>`;
      updateChatBadge();
      return;
    }
    chatLog.innerHTML = thread.map((row) => {
      const fromAdmin = row.sender === 'admin';
      const acked = row.status === 'acked';
      return `
        <div class="kt-chat-row${fromAdmin ? ' is-admin' : ' is-kitchen'}${acked ? ' is-acked' : ''}">
          ${escapeHtml(chatLineText(row))}
          <small>${escapeHtml(clockFromIso(row.created_at))}</small>
        </div>
      `;
    }).join('');
    chatLog.scrollTop = chatLog.scrollHeight;
    updateChatBadge();
  }

  function upsertAlertChat(entry, status, notify) {
    const existing = thread.find((row) => row.alert_id && row.alert_id === entry.id);
    if (existing) {
      existing.status = status;
      existing.alert_type = entry.type || existing.alert_type;
      existing.canned_id = entry.canned || existing.canned_id;
      existing.extra = entry.extraHe || entry.extra || existing.extra;
      existing.extraEl = entry.extraEl || existing.extraEl;
      existing.extraHe = entry.extraHe || existing.extraHe;
      if (status === 'acked' && notify) existing.ackedAt = Date.now();
      renderChat();
      return;
    }
    thread.push({
      id: `local-${entry.id}`,
      sender: 'kitchen',
      alert_id: entry.id,
      alert_type: entry.type,
      canned_id: entry.canned,
      extra: entry.extraHe || entry.extra,
      extraEl: entry.extraEl,
      extraHe: entry.extraHe,
      status,
      ackedAt: status === 'acked' && notify ? Date.now() : 0,
      created_at: new Date().toISOString(),
    });
    renderChat();
  }

  function rememberPending(entry) {
    pending = pending.filter((row) => row.id !== entry.id);
    pending.unshift(entry);
    pending = pending.slice(0, 20);
    saveStore();
    paintTile(entry, 'waiting');
    upsertAlertChat(entry, 'sent');
  }

  function handleAck(id, silent) {
    const key = String(id || '');
    if (!key || seenAck.has(key)) return;
    const entry = pending.find((row) => row.id === key);
    const chatRow = thread.find((row) => row.alert_id === key);
    if (!entry && !chatRow) return;
    seenAck.add(key);
    if (entry) {
      pending = pending.filter((row) => row.id !== key);
      saveStore();
      paintTile(entry, 'acked');
      upsertAlertChat(entry, 'acked', !silent && !isChatOpen());
    } else if (chatRow) {
      chatRow.status = 'acked';
      if (!silent && !isChatOpen()) chatRow.ackedAt = Date.now();
      renderChat();
    }
    if (!silent) {
      setStatus(txt('approved'), 'ok');
      playAckChime();
      if (isChatOpen()) markChatSeen();
    }
  }

  async function checkPendingAcks() {
    if (!pending.length || !api?.listByIds) return;
    try {
      const rows = await api.listByIds(pending.map((row) => row.id));
      (rows || []).forEach((row) => {
        if (row?.status === 'acknowledged') handleAck(row.id);
      });
    } catch (_) { /* ignore */ }
  }

  function openSheet(el) {
    if (el) el.hidden = false;
  }

  function closeSheets() {
    if (stockSheet) stockSheet.hidden = true;
    if (otherSheet) otherSheet.hidden = true;
    if (closeSheet) closeSheet.hidden = true;
    if (faultSheet) faultSheet.hidden = true;
    if (chatSheet) chatSheet.hidden = true;
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
    const chatTitle = document.getElementById('kt-chat-title');
    const chatSend = document.getElementById('kt-chat-send');
    if (chatTitle) chatTitle.textContent = txt('chat');
    if (chatSend) chatSend.textContent = txt('chatSend');
    if (chatInput) chatInput.placeholder = txt('chatPlaceholder');
    langBtn?.querySelectorAll('[data-lang]').forEach((opt) => {
      opt.classList.toggle('is-active', opt.dataset.lang === lang);
    });
    renderFaultList();
    if (stockSheet && !stockSheet.hidden) renderStockList();
    pending.forEach((entry) => paintTile(entry, 'waiting'));
    renderChat();
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

  async function send(payload, meta) {
    if (sending) return;
    sending = true;
    tiles.forEach((btn) => { btn.disabled = true; });
    setStatus(txt('sending'));
    try {
      const row = await api.insertAlert(payload);
      const entry = {
        id: String(row?.id || ''),
        type: payload.type,
        canned: meta?.canned || '',
        extra: meta?.extra || payload.productName || '',
        extraEl: meta?.extraEl || '',
        extraHe: meta?.extraHe || '',
      };
      if (entry.id) rememberPending(entry);
      api.insertChat?.({
        sender: 'kitchen',
        body: (
          entry.canned
            ? i18n.t('he', entry.canned)
            : entry.type === 'out_of_stock'
              ? (entry.extraHe || i18n.t('he', 'stock'))
              : entry.type === 'close_kitchen'
                ? i18n.t('he', 'closeKitchen')
                : i18n.t('he', entry.type)
        ) || payload.message || payload.type,
        alertId: entry.id,
        alertType: entry.type,
        cannedId: entry.canned,
        extra: entry.extraHe || entry.extra,
      }).catch(() => {});
      closeSheets();
      setStatus(txt('sent'), 'ok');
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

  async function sendKitchenChat() {
    const body = String(chatInput?.value || '').trim();
    if (!body) {
      setStatus(txt('needText'), 'err');
      return;
    }
    try {
      const row = await api.insertChat({ sender: 'kitchen', body });
      if (row?.id && !thread.some((item) => item.id === row.id)) thread.push(row);
      if (chatInput) chatInput.value = '';
      renderChat();
    } catch (err) {
      setStatus(err?.message || txt('fail'), 'err');
    }
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
        }, { canned: cannedId || '' });
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
    }, { extra: kitchenName(item), extraEl: i18n.dishEl(item?.id) || item?.printName || hebrewName(item), extraHe: hebrewName(item) || btn.dataset.productId });
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
    }, { extra: name, extraEl: name, extraHe: name });
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
    }, { extra: lang === 'el' ? row.el : row.he, extraEl: row.el, extraHe: row.he });
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
    }, { extra: note, extraEl: note, extraHe: note });
  });

  document.querySelectorAll('[data-kt-close]').forEach((btn) => {
    btn.addEventListener('click', closeSheets);
  });

  [stockSheet, otherSheet, closeSheet, faultSheet, chatSheet].forEach((sheet) => {
    sheet?.addEventListener('click', (event) => {
      if (event.target === sheet) closeSheets();
    });
  });

  chatBtn?.addEventListener('click', () => {
    openSheet(chatSheet);
    markChatSeen();
    renderChat();
  });

  document.getElementById('kt-chat-send')?.addEventListener('click', sendKitchenChat);
  chatInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendKitchenChat();
    }
  });

  api?.subscribe?.((payload) => {
    const event = payload?.eventType || payload?.event;
    const row = payload?.new || payload?.old;
    const id = String(row?.id || '');
    if (!id) return;
    if ((event === 'UPDATE' || !event) && row?.status === 'acknowledged') {
      handleAck(id);
    }
  }, 'lechaim-kitchen-tablet');

  api?.subscribeChat?.((payload) => {
    const event = payload?.eventType || payload?.event;
    const row = payload?.new;
    if (event !== 'INSERT' || !row?.id) return;
    if (thread.some((item) => item.id === row.id)) return;
    if (row.alert_id && thread.some((item) => item.alert_id === row.alert_id)) return;
    thread.push(row);
    renderChat();
    if (row.sender === 'admin') {
      playAckChime();
      if (isChatOpen()) markChatSeen();
    }
  });

  async function loadChat() {
    if (!api?.listChat) return;
    try {
      const rows = await api.listChat();
      const byAlert = new Map();
      thread = [];
      (rows || []).forEach((row) => {
        if (row.alert_id && byAlert.has(row.alert_id)) return;
        if (row.alert_id) byAlert.set(row.alert_id, true);
        thread.push(row);
      });
      pending.forEach((entry) => {
        if (!thread.some((row) => row.alert_id === entry.id)) {
          upsertAlertChat(entry, 'sent');
        }
      });
      const alertIds = thread.map((row) => row.alert_id).filter(Boolean);
      if (alertIds.length && api.listByIds) {
        const alerts = await api.listByIds(alertIds);
        (alerts || []).forEach((alert) => {
          if (alert.status === 'acknowledged') handleAck(alert.id, true);
        });
      }
      renderChat();
    } catch (_) {
      renderChat();
    }
  }

  loadStore();
  pending.forEach((entry) => paintTile(entry, 'waiting'));
  loadChat();
  checkPendingAcks();
  window.setInterval(checkPendingAcks, 4000);

  tickClock();
  window.setInterval(tickClock, 15000);
  holdWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      holdWakeLock();
      checkPendingAcks();
    }
  });

  applyLang();

  const inv = window.LechaimInventory;
  Promise.resolve(inv?.load?.())
    .catch(() => {})
    .then(() => {
      loadCatalog();
    });
})();
