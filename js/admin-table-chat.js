/**
 * LECHAIM — Admin side of private dine-in table chat
 * Opens beside the existing table drawer without replacing the order.
 */
(function (global) {
  'use strict';

  const unreadBySession = new Map();
  const pulseBySession = new Map();
  let boardUnsub = null;
  let sessionUnsub = null;
  let openSessionId = null;
  let openTableNumber = null;
  let openChatRow = null;
  let messages = [];
  let sending = false;
  let onBoardChange = null;
  let typingLive = false;
  let lastTypingSent = 0;
  let typingIdleTimer = null;
  let typingHideTimer = null;
  const TYPING_CLIENT = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function api() {
    return global.LechaimTableChat;
  }

  function panel() { return $('table-drawer-chat'); }
  function listEl() { return $('table-drawer-chat-messages'); }
  function titleEl() { return $('table-drawer-chat-title'); }
  function inputEl() { return $('table-drawer-chat-input'); }
  function typingEl() { return $('table-drawer-chat-typing'); }
  function drawerEl() { return $('table-drawer'); }

  function getStaffUnread(sessionId) {
    if (!sessionId) return 0;
    return Number(unreadBySession.get(String(sessionId))) || 0;
  }

  function setUnread(sessionId, count) {
    const id = String(sessionId || '');
    if (!id) return;
    const n = Math.max(0, Number(count) || 0);
    unreadBySession.set(id, n);
  }

  function isPulsing(sessionId) {
    const id = String(sessionId || '');
    if (!id) return false;
    const until = pulseBySession.get(id) || 0;
    if (until > Date.now()) return true;
    pulseBySession.delete(id);
    return false;
  }

  function pulseSession(sessionId) {
    const id = String(sessionId || '');
    if (!id) return;
    pulseBySession.set(id, Date.now() + 3200);
    onBoardChange?.();
    window.setTimeout(() => {
      if (!isPulsing(id)) onBoardChange?.();
    }, 3300);
  }

  function notifyGuestInsert(row) {
    if (!row?.id || row.sender !== 'guest') return;
    const sid = String(row.session_id || '');
    const threadOpen = Boolean(isOpen() && sid && sid === String(openSessionId));
    window.LechaimAdminTables?.playChatNotifyChime?.(row.id, { silent: threadOpen });
    if (!threadOpen) pulseSession(sid);
  }

  function rememberChatRow(row) {
    if (!row?.session_id) return;
    const sid = String(row.session_id);
    if (sid === String(openSessionId) && isOpen()) {
      setUnread(sid, 0);
    } else {
      setUnread(sid, row.staff_unread_count);
    }
    if (sid === String(openSessionId)) {
      openChatRow = { ...(openChatRow || {}), ...row };
    }
  }

  async function loadUnreads() {
    if (!api()?.isConfigured?.()) return unreadBySession;
    try {
      const rows = await api().listChats();
      unreadBySession.clear();
      (rows || []).forEach(rememberChatRow);
    } catch (err) {
      console.warn('[admin-table-chat] loadUnreads failed', err);
    }
    return unreadBySession;
  }

  function formatTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function renderMessages() {
    const el = listEl();
    if (!el) return;
    if (!messages.length) {
      el.innerHTML = '<p class="table-drawer-chat__empty">אין הודעות עדיין</p>';
      return;
    }
    el.innerHTML = messages.map((row) => {
      const mine = row.sender === 'staff';
      return `
        <div class="table-drawer-chat__bubble table-drawer-chat__bubble--${mine ? 'staff' : 'guest'}">
          <p>${escapeHtml(row.body)}</p>
          <time>${escapeHtml(formatTime(row.created_at))}</time>
        </div>
      `;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function hideIncomingTyping() {
    window.clearTimeout(typingHideTimer);
    typingHideTimer = null;
    const el = typingEl();
    if (el) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function showIncomingTyping(table) {
    if (!isOpen()) return;
    const n = Number(table);
    const el = typingEl();
    if (!el || !Number.isFinite(n)) return;
    el.textContent = `אורח ${n} מקליד...`;
    el.hidden = false;
    window.clearTimeout(typingHideTimer);
    typingHideTimer = window.setTimeout(hideIncomingTyping, 3000);
  }

  function onRemoteTyping(payload) {
    if (!isOpen() || payload?.sender !== 'guest' || payload?.clientId === TYPING_CLIENT) return;
    if (payload.typing) showIncomingTyping(payload.tableNumber);
    else hideIncomingTyping();
  }

  function typingPayload(typing) {
    return { typing: Boolean(typing), sender: 'staff', clientId: TYPING_CLIENT };
  }

  function stopOutgoingTyping() {
    window.clearTimeout(typingIdleTimer);
    typingIdleTimer = null;
    if (!typingLive) return;
    typingLive = false;
    lastTypingSent = 0;
    if (openSessionId) api()?.sendTyping?.(openSessionId, typingPayload(false));
  }

  function onTypingInput() {
    if (!isOpen() || !openSessionId || !api()?.sendTyping) return;
    const now = Date.now();
    if (!typingLive || now - lastTypingSent >= 1000) {
      lastTypingSent = now;
      typingLive = true;
      api().sendTyping(openSessionId, typingPayload(true));
    }
    window.clearTimeout(typingIdleTimer);
    typingIdleTimer = window.setTimeout(stopOutgoingTyping, 2000);
  }

  function leaveTypingChannel() {
    const sid = openSessionId;
    stopOutgoingTyping();
    hideIncomingTyping();
    if (sid) api()?.leaveTyping?.(sid);
  }

  function joinTypingChannel() {
    if (!isOpen() || !openSessionId || !api()?.joinTyping) return;
    api().joinTyping(openSessionId, onRemoteTyping);
  }

  function upsertMessage(row) {
    if (!row?.id) return;
    if (messages.some((item) => String(item.id) === String(row.id))) return;
    messages = [...messages, row].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    renderMessages();
  }

  async function markStaffRead() {
    if (!openChatRow?.id || !api()?.markRead) return;
    try {
      openChatRow = await api().markRead(openChatRow.id, 'staff') || openChatRow;
      setUnread(openSessionId, 0);
      onBoardChange?.();
    } catch (err) {
      console.warn('[admin-table-chat] markRead failed', err);
    }
  }

  function stopSession() {
    if (typeof sessionUnsub === 'function') {
      try { sessionUnsub(); } catch (_) { /* ignore */ }
    }
    sessionUnsub = null;
  }

  function isOpen() {
    return Boolean(openSessionId && panel() && !panel().hidden);
  }

  function close() {
    leaveTypingChannel();
    stopSession();
    openSessionId = null;
    openTableNumber = null;
    openChatRow = null;
    messages = [];
    const chat = panel();
    if (chat) chat.hidden = true;
    drawerEl()?.querySelector('.table-drawer__panel')?.classList.remove('is-chat-open');
  }

  async function openForEntry(entry) {
    const sessionId = entry?.order?._supabaseSessionId;
    const tableNumber = entry?.tableNumber;
    const chat = panel();
    if (!sessionId || !chat || !api()?.isConfigured?.()) return false;

    leaveTypingChannel();
    openSessionId = String(sessionId);
    openTableNumber = Number(tableNumber);
    chat.hidden = false;
    drawerEl()?.querySelector('.table-drawer__panel')?.classList.add('is-chat-open');
    if (titleEl()) titleEl().textContent = `צ'אט עם שולחן ${tableNumber}`;
    messages = [];
    renderMessages();

    try {
      openChatRow = await api().getOrCreateChat(sessionId, tableNumber);
      messages = await api().listMessages(sessionId);
      renderMessages();
      await markStaffRead();
    } catch (err) {
      console.error('[admin-table-chat] open failed', err);
      return false;
    }

    stopSession();
    sessionUnsub = api().subscribeSession(sessionId, (payload) => {
      const table = payload?.table;
      const row = payload?.new;
      if (table === 'table_chat_messages' && row?.id) {
        upsertMessage(row);
        if (row.sender === 'guest') {
          hideIncomingTyping();
          markStaffRead();
        }
      }
      if (table === 'table_chats' && row) rememberChatRow(row);
    });

    joinTypingChannel();
    requestAnimationFrame(() => inputEl()?.focus());
    return true;
  }

  async function sendCurrent() {
    if (sending || !openSessionId) return;
    const input = inputEl();
    const body = String(input?.value || '').trim();
    if (!body) return;
    sending = true;
    stopOutgoingTyping();
    try {
      const row = await api().sendMessage({
        sessionId: openSessionId,
        tableNumber: openTableNumber || openChatRow?.table_number,
        sender: 'staff',
        body,
      });
      if (input) input.value = '';
      if (row) upsertMessage(row);
    } catch (err) {
      console.error('[admin-table-chat] send failed', err);
    } finally {
      sending = false;
    }
  }

  function syncDrawer(entry) {
    const btn = $('table-drawer-chat-open');
    const isDineIn = String(entry?.orderType || '') === 'dinein';
    const sessionId = entry?.order?._supabaseSessionId;
    if (btn) {
      btn.hidden = !(isDineIn && sessionId);
      btn.textContent = `💬 צ'אט עם שולחן ${entry?.tableNumber ?? ''}`;
    }
    if (!isDineIn || !sessionId || String(sessionId) !== String(openSessionId)) {
      if (isOpen() && String(openSessionId) !== String(sessionId || '')) close();
    }
  }

  function subscribeBoard(cb) {
    onBoardChange = typeof cb === 'function' ? cb : null;
    if (boardUnsub) {
      try { boardUnsub(); } catch (_) { /* ignore */ }
      boardUnsub = null;
    }
    if (!api()?.isConfigured?.()) return;
    boardUnsub = api().subscribeBoard((payload) => {
      const table = payload?.table;
      const row = payload?.new || payload?.old;
      if (table === 'table_chat_messages') {
        if (payload?.eventType === 'INSERT' && row?.id) notifyGuestInsert(row);
        return;
      }
      if (payload?.eventType === 'DELETE') {
        if (row?.session_id) unreadBySession.delete(String(row.session_id));
        loadUnreads().then(() => onBoardChange?.());
        return;
      }
      if (row) {
        rememberChatRow(row);
        onBoardChange?.();
      }
    });
  }

  function stopBoard() {
    if (typeof boardUnsub === 'function') {
      try { boardUnsub(); } catch (_) { /* ignore */ }
    }
    boardUnsub = null;
  }

  function init() {
    $('table-drawer-chat-close')?.addEventListener('click', close);
    $('table-drawer-chat-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      sendCurrent();
    });
    inputEl()?.addEventListener('input', onTypingInput);
  }

  global.LechaimAdminTableChat = {
    init,
    loadUnreads,
    getStaffUnread,
    isPulsing,
    subscribeBoard,
    stopBoard,
    openForEntry,
    close,
    isOpen,
    syncDrawer,
  };
})(window);
