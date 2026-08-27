/**
 * LECHAIM — Admin kitchen alerts tab + live banner
 * Always Hebrew. Does not touch till / print / table close.
 */
(function (global) {
  'use strict';

  const api = global.LechaimKitchenAlerts;
  const badgeEl = document.getElementById('tab-badge-kitchen');
  const emptyEl = document.getElementById('kitchen-alerts-empty');
  const listEl = document.getElementById('kitchen-alerts-list');
  const chatLog = document.getElementById('kitchen-chat-log');
  const chatInput = document.getElementById('kitchen-chat-input');
  const chatSend = document.getElementById('kitchen-chat-send');
  const chatOpen = document.getElementById('kitchen-chat-open');
  const chatClose = document.getElementById('kitchen-chat-close');
  const chatBackdrop = document.getElementById('kitchen-chat-backdrop');
  const chatModal = document.getElementById('kitchen-chat-modal');
  const chatBadge = document.getElementById('kitchen-chat-badge');
  const chatReset = document.getElementById('kitchen-chat-reset');

  let cache = [];
  let chat = [];
  let unsubscribe = null;
  let unsubscribeChat = null;
  let active = false;
  let nagTimer = null;
  let audioCtx = null;
  let sendingChat = false;
  const CHAT_SEEN_KEY = 'lechaim-admin-kitchen-chat-seen';

  function meta(type) {
    return api?.typeMeta?.(type) || { labelHe: type, bannerHe: type, section: 'message', urgent: false };
  }

  function isUrgent(type) {
    return Boolean(meta(type).urgent);
  }

  function clock(iso) {
    const d = new Date(iso || '');
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function playKitchenChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      const tones = [
        { freq: 523, at: 0, dur: 0.2 },
        { freq: 784, at: 0.18, dur: 0.28 },
        { freq: 1046, at: 0.4, dur: 0.35 },
      ];
      tones.forEach((tone) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = tone.freq;
        gain.gain.setValueAtTime(0.0001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.38, now + tone.at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.dur + 0.02);
      });
    } catch (_) { /* ignore */ }
  }

  function getChatSeenAt() {
    try {
      return Number(localStorage.getItem(CHAT_SEEN_KEY) || 0);
    } catch (_) {
      return 0;
    }
  }

  function unreadChatCount() {
    if (chatModal && !chatModal.hidden) return 0;
    const seen = getChatSeenAt();
    return chat.filter((row) => {
      if (row.sender !== 'kitchen' || row.alert_id) return false;
      return new Date(row.created_at || 0).getTime() > seen;
    }).length;
  }

  function setBadge() {
    const count = cache.length + unreadChatCount();
    if (badgeEl) {
      badgeEl.textContent = String(count);
      badgeEl.dataset.count = String(count);
      badgeEl.hidden = count <= 0;
      badgeEl.classList.toggle('is-live', count > 0);
    }
    const indicator = document.getElementById('admin-kitchen-indicator');
    const indicatorCount = document.getElementById('admin-kitchen-indicator-count');
    if (indicator) {
      indicator.hidden = count <= 0;
      indicator.classList.toggle('is-urgent', cache.some((row) => isUrgent(row.alert_type)));
    }
    if (indicatorCount) indicatorCount.textContent = String(count);
  }

  function shortText(value, max) {
    const text = String(value || '').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }

  function goKitchenTab() {
    document.querySelector('.admin-tab[data-tab="kitchen"]')?.click();
  }

  function pushNotify(title, body, urgentOrOpts) {
    const stack = document.getElementById('admin-notify-stack');
    if (!stack) return;
    const opts = urgentOrOpts && typeof urgentOrOpts === 'object'
      ? urgentOrOpts
      : { urgent: Boolean(urgentOrOpts) };
    const tone = opts.tone || (opts.urgent ? 'urgent' : '');
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `admin-notify${tone ? ` is-${tone}` : ''}`;
    el.innerHTML = `
      <span class="admin-notify__app">LECHAIM</span>
      <span class="admin-notify__title">${escapeHtml(title)}</span>
      ${body ? `<span class="admin-notify__body">${escapeHtml(shortText(body, 72))}</span>` : ''}
    `;
    el.addEventListener('click', () => {
      el.remove();
      goKitchenTab();
    });
    stack.appendChild(el);
    while (stack.children.length > 3) stack.firstElementChild.remove();
    window.setTimeout(() => {
      el.classList.add('is-out');
      window.setTimeout(() => el.remove(), 260);
    }, 6500);
  }

  function notifyAlert(row) {
    if (!row) return;
    pushNotify('קריאה מהמטבח', cardTitle(row), isUrgent(row.alert_type));
  }

  function notifyChat(row) {
    const body = api?.chatTextFor?.(row, 'he') || row?.body_he || row?.body || 'הודעה חדשה';
    pushNotify('הודעה מהמטבח', body, false);
  }

  function cardIcon(type) {
    return ({
      fire: '🔥',
      gas: '⛽',
      out_of_stock: '📦',
      fault: '🔧',
      pace: '🍽️',
      no_orders: '🍽️',
      building: '🍽️',
      close_kitchen: '🚪',
      message: '📣',
    })[String(type || '')] || '📣';
  }

  function cardTitle(row) {
    if (row.alert_type === 'out_of_stock') {
      return `נגמר במלאי: ${row.product_name || row.product_id || 'מנה'}`;
    }
    if (row.alert_type === 'message') {
      return row.message || 'כללי מהמטבח';
    }
    if (row.alert_type === 'fault') {
      const name = row.product_name || row.product_id || 'ציוד';
      return row.message ? `תקלה: ${name} · ${row.message}` : `תקלה: ${name}`;
    }
    return meta(row.alert_type).bannerHe || meta(row.alert_type).labelHe;
  }

  function cardHtml(row) {
    const urgent = isUrgent(row.alert_type);
    const hideMenu = row.alert_type === 'out_of_stock' && row.product_id;
    const startClose = row.alert_type === 'close_kitchen';
    return `
      <article class="kitchen-alert-card${urgent ? ' is-urgent' : ''}" data-alert-id="${escapeHtml(row.id)}">
        <span class="kitchen-alert-card__icon" aria-hidden="true">${cardIcon(row.alert_type)}</span>
        <div class="kitchen-alert-card__main">
          <p class="kitchen-alert-card__body">${escapeHtml(cardTitle(row))}</p>
          <span class="kitchen-alert-card__time">${escapeHtml(clock(row.created_at))}</span>
        </div>
        <div class="kitchen-alert-card__actions">
          ${hideMenu ? `<button type="button" class="admin-btn admin-btn--soft" data-kitchen-hide="${escapeHtml(row.product_id)}">הורד מהתפריט</button>` : ''}
          ${startClose ? '<button type="button" class="admin-btn admin-btn--danger" data-kitchen-run-close>סגירה 30 דק׳</button>' : ''}
          <button type="button" class="admin-btn admin-btn--primary" data-kitchen-ack="${escapeHtml(row.id)}">קיבלתי</button>
        </div>
      </article>
    `;
  }

  function render() {
    setBadge();
    const rows = [...cache].sort((a, b) => {
      const ua = isUrgent(a.alert_type) ? 0 : 1;
      const ub = isUrgent(b.alert_type) ? 0 : 1;
      if (ua !== ub) return ua - ub;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    if (listEl) listEl.innerHTML = rows.map(cardHtml).join('');
    if (emptyEl) emptyEl.hidden = cache.length > 0;
  }

  function syncNag() {
    window.clearInterval(nagTimer);
    nagTimer = null;
    const urgentOpen = cache.some((row) => isUrgent(row.alert_type));
    if (!urgentOpen) return;
    nagTimer = window.setInterval(() => {
      if (cache.some((row) => isUrgent(row.alert_type))) playKitchenChime();
    }, 12000);
  }

  function renderChat() {
    if (!chatLog) return;
    const messages = chat.filter((row) => !row.alert_id);
    if (!messages.length) {
      chatLog.innerHTML = '<p class="kitchen-chat__empty">אין הודעות עדיין</p>';
      updateChatBadge();
      return;
    }
    chatLog.innerHTML = messages.map((row) => {
      const fromAdmin = row.sender === 'admin';
      return `
        <div class="kitchen-chat__row ${fromAdmin ? 'is-admin' : 'is-kitchen'}">
          ${escapeHtml(fromAdmin ? (row.body || '') : (api.chatTextFor?.(row, 'he') || row.body_he || row.body || ''))}
          <small>${escapeHtml(clock(row.created_at))} · ${fromAdmin ? 'ניהול' : 'מטבח'}</small>
        </div>
      `;
    }).join('');
    chatLog.scrollTop = chatLog.scrollHeight;
    updateChatBadge();
  }

  function isChatOpen() {
    return Boolean(chatModal && !chatModal.hidden);
  }

  function markChatSeen() {
    try {
      localStorage.setItem(CHAT_SEEN_KEY, String(Date.now()));
    } catch (_) { /* ignore */ }
    updateChatBadge();
  }

  function updateChatBadge() {
    const unread = unreadChatCount();
    if (chatBadge) {
      chatBadge.textContent = String(unread);
      chatBadge.hidden = unread <= 0;
    }
    setBadge();
  }

  function openChat() {
    if (!chatModal) return;
    chatModal.hidden = false;
    chatModal.setAttribute('aria-hidden', 'false');
    markChatSeen();
    renderChat();
    chatInput?.focus();
  }

  function closeChat() {
    if (!chatModal) return;
    chatModal.hidden = true;
    chatModal.setAttribute('aria-hidden', 'true');
    markChatSeen();
  }

  async function loadChat() {
    if (!api?.listChat) return;
    try {
      chat = (await api.listChat()).filter((row) => !row.alert_id);
      renderChat();
    } catch (err) {
      console.warn('[admin-kitchen] chat list failed', err);
      if (chatLog) {
        chatLog.innerHTML = '<p class="kitchen-chat__empty">הריצו supabase-kitchen-chat.sql בסופאבייס כדי להפעיל את הצ׳ט</p>';
      }
    }
  }

  async function sendChat() {
    const body = String(chatInput?.value || '').trim();
    if (!body || sendingChat) return;
    sendingChat = true;
    if (chatSend) chatSend.disabled = true;
    try {
      const pair = await api.pairChatBodies?.(body, 'admin') || { body, bodyHe: body, bodyEl: body };
      const row = await api.insertChat({
        sender: 'admin',
        body: pair.body,
        bodyHe: pair.bodyHe,
        bodyEl: pair.bodyEl,
      });
      if (row?.id && !chat.some((item) => item.id === row.id)) chat.push(row);
      if (chatInput) chatInput.value = '';
      renderChat();
    } catch (err) {
      console.warn('[admin-kitchen] chat send failed', err);
      window.alert(err?.message || 'שליחת ההודעה למטבח נכשלה');
    } finally {
      sendingChat = false;
      if (chatSend) chatSend.disabled = false;
    }
  }

  async function resetChat() {
    if (!chat.length) return;
    const ok = window.confirm('לאפס את הצ׳ט עם המטבח? כל ההודעות יימחקו.');
    if (!ok) return;
    try {
      await api.clearChat();
      chat = [];
      renderChat();
    } catch (err) {
      console.warn('[admin-kitchen] chat reset failed', err);
      window.alert(err?.message || 'איפוס הצ׳ט נכשל');
    }
  }

  function onChatRealtime(payload) {
    const event = payload?.eventType || payload?.event;
    if (event === 'DELETE') {
      const id = payload?.old?.id;
      chat = id ? chat.filter((item) => item.id !== id) : [];
      renderChat();
      return;
    }
    const row = payload?.new;
    if (event !== 'INSERT' || !row?.id) return;
    if (row.alert_id) return;
    if (chat.some((item) => item.id === row.id)) return;
    chat.push(row);
    renderChat();
    if (row.sender === 'kitchen' && !row.alert_id && !isChatOpen()) {
      playKitchenChime();
      notifyChat(row);
    }
  }

  async function refresh() {
    if (!api) return;
    try {
      cache = await api.listOpen();
      render();
      syncNag();
    } catch (err) {
      console.warn('[admin-kitchen] list failed', err);
    }
  }

  async function handleAck(id) {
    try {
      await api.acknowledge(id);
      cache = cache.filter((row) => row.id !== id);
      render();
      syncNag();
    } catch (err) {
      console.warn('[admin-kitchen] ack failed', err);
    }
  }

  async function handleHide(productId, alertId) {
    try {
      if (typeof global.LechaimInventory?.setAvailable === 'function') {
        await global.LechaimInventory.setAvailable(productId, false);
      }
    } catch (err) {
      console.warn('[admin-kitchen] hide dish failed', err);
    }
    await handleAck(alertId);
  }

  function onRealtime(payload) {
    const event = payload?.eventType;
    const row = payload?.new || payload?.old;
    if (event === 'INSERT' && row?.status === 'open') {
      cache = [row, ...cache.filter((item) => item.id !== row.id)];
      if (isUrgent(row.alert_type)) playKitchenChime();
      notifyAlert(row);
      render();
      syncNag();
      return;
    }
    if (event === 'UPDATE' || event === 'DELETE') {
      const id = row?.id || payload?.old?.id;
      if (row?.status && row.status !== 'open') {
        cache = cache.filter((item) => item.id !== id);
      } else if (event === 'DELETE') {
        cache = cache.filter((item) => item.id !== id);
      }
      render();
      syncNag();
    }
  }

  function start() {
    if (active) return;
    active = true;
    refresh();
    loadChat();
    unsubscribe = api?.subscribe?.(onRealtime);
    unsubscribeChat = api?.subscribeChat?.(onChatRealtime);
    global.LechaimAdminKitchenBoard?.start?.();
  }

  function stop() {
    active = false;
    window.clearInterval(nagTimer);
    nagTimer = null;
    if (typeof unsubscribe === 'function') unsubscribe();
    unsubscribe = null;
    if (typeof unsubscribeChat === 'function') unsubscribeChat();
    unsubscribeChat = null;
    global.LechaimAdminKitchenBoard?.stop?.();
  }

  document.getElementById('admin-view-kitchen')?.addEventListener('click', (event) => {
    const hideBtn = event.target.closest('[data-kitchen-hide]');
    if (hideBtn) {
      const card = hideBtn.closest('[data-alert-id]');
      handleHide(hideBtn.dataset.kitchenHide, card?.dataset.alertId);
      return;
    }
    if (event.target.closest('[data-kitchen-run-close]')) {
      document.querySelector('#admin-view-kitchen [data-kitchen-close]')?.click();
      return;
    }
    const ackBtn = event.target.closest('[data-kitchen-ack]');
    if (ackBtn) handleAck(ackBtn.dataset.kitchenAck);
  });

  document.getElementById('admin-kitchen-indicator')?.addEventListener('click', goKitchenTab);

  chatSend?.addEventListener('click', sendChat);
  chatInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
  });
  chatOpen?.addEventListener('click', openChat);
  chatClose?.addEventListener('click', closeChat);
  chatBackdrop?.addEventListener('click', closeChat);
  chatReset?.addEventListener('click', resetChat);

  global.LechaimAdminKitchen = { start, stop, refresh, notify: pushNotify };
})(window);
