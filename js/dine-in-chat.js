/**
 * LECHAIM — Customer private dine-in chat
 * Visible as soon as a table number is chosen. A Supabase session is created
 * on first open/send (not on table pick alone).
 */
(function () {
  'use strict';

  const MAP_KEY = 'lechaim-supabase-session-map';
  const FALLBACK = {
    chatFabLabel: 'צ\'אט פרטי עם המסעדה',
    chatTitle: 'צ\'אט פרטי עם המסעדה',
    chatPlaceholder: 'כתבו הודעה למסעדה…',
    chatSend: 'שלח',
    chatEmpty: 'שלחו הודעה למסעדה — מים, לחם, חשבון או שאלה.',
    chatUnavailable: 'הצ\'אט ייפתח אחרי בחירת שולחן',
    chatError: 'לא ניתן לשלוח. נסו שוב.',
    chatTypingStaff: 'Lechaim מקלידים...',
  };

  let fab = null;
  let panel = null;
  let listEl = null;
  let form = null;
  let input = null;
  let badge = null;
  let open = false;
  let sessionId = null;
  let tableNumber = null;
  let chatRow = null;
  let messages = [];
  let unsub = null;
  let pollTimer = null;
  let sending = false;
  let typingEl = null;
  let typingLive = false;
  let lastTypingSent = 0;
  let typingIdleTimer = null;
  let typingHideTimer = null;
  const TYPING_CLIENT = `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function t(key) {
    const lang = document.documentElement.lang || window.LechaimOrderContext?.lang || 'he';
    return window.TRANSLATIONS?.[lang]?.[key]
      || window.TRANSLATIONS?.he?.[key]
      || FALLBACK[key]
      || key;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MAP_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function isDineInContext() {
    const ctx = window.LechaimOrderContext || {};
    const session = window.LechaimOrderSession?.getSession?.() || {};
    const type = String(ctx.orderType || session.orderType || '').toLowerCase();
    const dineIn = type === 'dine-in' || type === 'dinein' || type === 'dine_in';
    if (!dineIn || ctx.browseOnly) return false;
    const table = ctx.tableNumber != null ? Number(ctx.tableNumber) : Number(session.tableNumber);
    return Number.isFinite(table);
  }

  function currentTableNumber() {
    const ctx = window.LechaimOrderContext || {};
    const session = window.LechaimOrderSession?.getSession?.() || {};
    const table = Number(ctx.tableNumber != null ? ctx.tableNumber : session.tableNumber);
    return Number.isFinite(table) ? table : null;
  }

  function resolveRemoteSession() {
    if (!isDineInContext()) return { sessionId: null, tableNumber: null };
    const ctx = window.LechaimOrderContext || {};
    const session = window.LechaimOrderSession?.getSession?.() || {};
    const localId = String(ctx.sessionId || session.sessionId || '');
    const mapped = localId ? readMap()[localId] : null;
    return {
      sessionId: mapped ? String(mapped) : null,
      tableNumber: currentTableNumber(),
    };
  }

  function api() {
    return window.LechaimTableChat;
  }

  function ensureDom() {
    if (fab) return;
    fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'dine-in-chat-fab';
    fab.className = 'dine-in-chat-fab';
    fab.hidden = true;
    fab.innerHTML = `
      <span class="dine-in-chat-fab__icon" aria-hidden="true">💬</span>
      <span class="dine-in-chat-fab__label"></span>
      <span class="dine-in-chat-fab__badge" id="dine-in-chat-fab-badge" hidden>0</span>
    `;
    badge = fab.querySelector('#dine-in-chat-fab-badge');

    panel = document.createElement('div');
    panel.id = 'dine-in-chat-panel';
    panel.className = 'dine-in-chat-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="dine-in-chat-panel__card" role="dialog" aria-modal="true" aria-labelledby="dine-in-chat-title">
        <header class="dine-in-chat-panel__header">
          <h2 class="dine-in-chat-panel__title" id="dine-in-chat-title"></h2>
          <button type="button" class="dine-in-chat-panel__close" id="dine-in-chat-close" aria-label="סגור">×</button>
        </header>
        <div class="dine-in-chat-panel__messages" id="dine-in-chat-messages"></div>
        <p class="dine-in-chat-typing" id="dine-in-chat-typing" hidden></p>
        <form class="dine-in-chat-panel__form" id="dine-in-chat-form">
          <label class="visually-hidden" for="dine-in-chat-input">הודעה</label>
          <input
            id="dine-in-chat-input"
            class="dine-in-chat-panel__input"
            type="text"
            maxlength="500"
            autocomplete="off"
            enterkeyhint="send"
          >
          <button type="submit" class="dine-in-chat-panel__send" id="dine-in-chat-send"></button>
        </form>
      </div>
    `;
    document.body.append(fab, panel);
    listEl = panel.querySelector('#dine-in-chat-messages');
    form = panel.querySelector('#dine-in-chat-form');
    input = panel.querySelector('#dine-in-chat-input');
    typingEl = panel.querySelector('#dine-in-chat-typing');

    fab.addEventListener('click', () => {
      if (open) closePanel();
      else openPanel();
    });
    panel.querySelector('#dine-in-chat-close')?.addEventListener('click', closePanel);
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      sendCurrent();
    });
    input?.addEventListener('input', onTypingInput);
    applyCopy();
  }

  function applyCopy() {
    if (!fab || !panel) return;
    const label = fab.querySelector('.dine-in-chat-fab__label');
    if (label) label.textContent = t('chatFabLabel');
    fab.setAttribute('aria-label', t('chatFabLabel'));
    const title = panel.querySelector('#dine-in-chat-title');
    if (title) title.textContent = t('chatTitle');
    if (input) input.placeholder = t('chatPlaceholder');
    const sendBtn = panel.querySelector('#dine-in-chat-send');
    if (sendBtn) sendBtn.textContent = t('chatSend');
  }

  function hideIncomingTyping() {
    window.clearTimeout(typingHideTimer);
    typingHideTimer = null;
    if (typingEl) {
      typingEl.hidden = true;
      typingEl.textContent = '';
    }
  }

  function showIncomingTyping(text) {
    if (!open || !typingEl) return;
    typingEl.textContent = text;
    typingEl.hidden = false;
    window.clearTimeout(typingHideTimer);
    typingHideTimer = window.setTimeout(hideIncomingTyping, 3000);
  }

  function onRemoteTyping(payload) {
    if (!open || payload?.sender !== 'staff' || payload?.clientId === TYPING_CLIENT) return;
    if (payload.typing) showIncomingTyping(t('chatTypingStaff'));
    else hideIncomingTyping();
  }

  function typingPayload(typing) {
    return { typing: Boolean(typing), sender: 'guest', tableNumber, clientId: TYPING_CLIENT };
  }

  function stopOutgoingTyping() {
    window.clearTimeout(typingIdleTimer);
    typingIdleTimer = null;
    if (!typingLive) return;
    typingLive = false;
    lastTypingSent = 0;
    if (sessionId) api()?.sendTyping?.(sessionId, typingPayload(false));
  }

  function onTypingInput() {
    if (!open || !sessionId || !api()?.sendTyping) return;
    const now = Date.now();
    if (!typingLive || now - lastTypingSent >= 1000) {
      lastTypingSent = now;
      typingLive = true;
      api().sendTyping(sessionId, typingPayload(true));
    }
    window.clearTimeout(typingIdleTimer);
    typingIdleTimer = window.setTimeout(stopOutgoingTyping, 2000);
  }

  function leaveTypingChannel() {
    stopOutgoingTyping();
    hideIncomingTyping();
    api()?.leaveTyping?.(sessionId);
  }

  function joinTypingChannel() {
    if (!open || !sessionId || !api()?.joinTyping) return;
    api().joinTyping(sessionId, onRemoteTyping);
  }

  function setBadge(count) {
    if (!badge || !fab) return;
    const n = Math.max(0, Number(count) || 0);
    const label = fab.querySelector('.dine-in-chat-fab__label');
    if (n <= 0 || open) {
      badge.hidden = true;
      badge.textContent = '0';
      if (label) label.hidden = false;
      fab.setAttribute('aria-label', t('chatFabLabel'));
      return;
    }
    badge.hidden = false;
    badge.textContent = n > 99 ? '99+' : String(n);
    if (label) label.hidden = true;
    fab.setAttribute('aria-label', `${t('chatFabLabel')} ${badge.textContent}`);
  }

  function formatTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function renderMessages() {
    if (!listEl) return;
    if (!messages.length) {
      listEl.innerHTML = `<p class="dine-in-chat-panel__empty">${escapeHtml(t('chatEmpty'))}</p>`;
      return;
    }
    listEl.innerHTML = messages.map((row) => {
      const mine = row.sender === 'guest';
      return `
        <div class="dine-in-chat-bubble dine-in-chat-bubble--${mine ? 'guest' : 'staff'}">
          <p class="dine-in-chat-bubble__body">${escapeHtml(row.body)}</p>
          <time class="dine-in-chat-bubble__time">${escapeHtml(formatTime(row.created_at))}</time>
        </div>
      `;
    }).join('');
    listEl.scrollTop = listEl.scrollHeight;
  }

  function upsertMessage(row) {
    if (!row?.id) return false;
    if (messages.some((item) => String(item.id) === String(row.id))) return false;
    messages = [...messages, row].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (open) renderMessages();
    return true;
  }

  async function markGuestRead() {
    if (!chatRow?.id || !api()?.markRead) return;
    try {
      chatRow = await api().markRead(chatRow.id, 'guest') || chatRow;
      setBadge(0);
    } catch (err) {
      console.warn('[dine-in-chat] markRead failed', err);
    }
  }

  function stopSessionWatch() {
    if (typeof unsub === 'function') {
      try { unsub(); } catch (_) { /* ignore */ }
    }
    unsub = null;
  }

  async function bindSession(nextSessionId, nextTable) {
    if (String(nextSessionId) === String(sessionId) && unsub) return;
    if (open) leaveTypingChannel();
    stopSessionWatch();
    sessionId = nextSessionId ? String(nextSessionId) : null;
    tableNumber = nextTable;
    chatRow = null;
    messages = [];
    if (!sessionId || !api()?.isConfigured?.()) return;

    try {
      chatRow = await api().getChatBySession(sessionId);
      if (chatRow) {
        messages = await api().listMessages(sessionId);
        if (open) {
          renderMessages();
          await markGuestRead();
        } else {
          setBadge(chatRow.guest_unread_count);
        }
      } else {
        setBadge(0);
        if (open) renderMessages();
      }
    } catch (err) {
      console.warn('[dine-in-chat] load failed', err);
    }

    unsub = api().subscribeSession(sessionId, (payload) => {
      const table = payload?.table;
      const row = payload?.new;
      if (table === 'table_chat_messages' && row?.id) {
        upsertMessage(row);
        if (open && row.sender === 'staff') {
          hideIncomingTyping();
          markGuestRead();
        }
      }
      if (table === 'table_chats' && row) {
        chatRow = { ...(chatRow || {}), ...row };
        if (!open) setBadge(row.guest_unread_count);
        else setBadge(0);
      }
    });
    if (open) joinTypingChannel();
  }

  async function ensureRemoteSession() {
    if (sessionId) return sessionId;
    const ensure = window.LechaimMenu?.ensureDineInRemoteSession;
    if (typeof ensure !== 'function') return null;
    try {
      const id = await ensure();
      const table = currentTableNumber();
      if (id) await bindSession(id, table);
      return sessionId;
    } catch (err) {
      console.warn('[dine-in-chat] ensure session failed', err);
      return null;
    }
  }

  async function openPanel() {
    open = true;
    if (panel) panel.hidden = false;
    fab?.classList.add('is-open');
    applyCopy();
    renderMessages();
    try {
      const id = await ensureRemoteSession();
      if (!id) {
        throw new Error('no session');
      }
      if (!chatRow) chatRow = await api().getOrCreateChat(sessionId, tableNumber);
      if (!messages.length) messages = await api().listMessages(sessionId);
      renderMessages();
      await markGuestRead();
      joinTypingChannel();
    } catch (err) {
      console.warn('[dine-in-chat] open failed', err);
    }
    requestAnimationFrame(() => input?.focus());
  }

  function closePanel() {
    leaveTypingChannel();
    open = false;
    if (panel) panel.hidden = true;
    fab?.classList.remove('is-open');
    if (chatRow) setBadge(chatRow.guest_unread_count);
  }

  async function sendCurrent() {
    if (sending || !input) return;
    const body = input.value.trim();
    if (!body) return;
    sending = true;
    stopOutgoingTyping();
    try {
      const id = await ensureRemoteSession();
      if (!id) throw new Error('no session');
      const row = await api().sendMessage({
        sessionId,
        tableNumber,
        sender: 'guest',
        body,
      });
      input.value = '';
      if (row) upsertMessage(row);
    } catch (err) {
      console.error('[dine-in-chat] send failed', err);
      input.setCustomValidity(t('chatError'));
      input.reportValidity();
      window.setTimeout(() => input.setCustomValidity(''), 1800);
    } finally {
      sending = false;
    }
  }

  function syncVisibility() {
    ensureDom();
    applyCopy();
    const dineIn = isDineInContext() && api()?.isConfigured?.();
    fab.hidden = !dineIn;
    if (!dineIn) {
      closePanel();
      stopSessionWatch();
      api()?.leaveTyping?.(sessionId);
      sessionId = null;
      tableNumber = null;
      setBadge(0);
      return;
    }
    const resolved = resolveRemoteSession();
    tableNumber = resolved.tableNumber;
    if (resolved.sessionId) {
      bindSession(resolved.sessionId, resolved.tableNumber);
      return;
    }
    if (sessionId) {
      stopSessionWatch();
      sessionId = null;
      chatRow = null;
      messages = [];
      setBadge(0);
    }
  }

  function start() {
    ensureDom();
    syncVisibility();
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(syncVisibility, 2500);
    window.addEventListener('storage', syncVisibility);
    window.addEventListener('lechaim:dinein-session-ready', syncVisibility);
    window.addEventListener('lechaim:dinein-table-ready', syncVisibility);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
