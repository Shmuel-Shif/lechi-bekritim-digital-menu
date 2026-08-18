/**
 * LECHAIM — Admin global dine-in chat
 * Separate from private table chats. Shows table number for moderation only.
 */
(function (global) {
  'use strict';

  const mutedBySession = new Set();
  let unsub = null;
  let messages = [];
  let sending = false;
  let open = false;
  let unread = 0;
  let typingLive = false;
  let lastTypingSent = 0;
  let typingIdleTimer = null;
  const typingGuests = new Map();
  let typingStaff = false;
  let typingStaffTimer = null;
  const TYPING_CLIENT = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const AVATAR_COLORS = ['#2f9e44', '#7048e8', '#f08c00', '#e03131', '#0c8599', '#5c7cfa', '#c2255c', '#2b8a3e', '#9c36b5', '#e8590c'];
  const reactionById = new Map();
  const reactingKeys = new Set();
  let openPickerId = null;

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
    return global.LechaimGlobalChat;
  }

  function formatTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function setUnread(count, opts) {
    unread = Math.max(0, Number(count) || 0);
    const badge = $('admin-global-chat-badge');
    const btn = $('admin-global-chat-open');
    if (!badge) return;
    if (unread <= 0) {
      badge.hidden = true;
      badge.textContent = '0';
      badge.classList.remove('is-alert');
      btn?.classList.remove('is-chat-alert');
      return;
    }
    badge.hidden = false;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    if (opts?.pulse) {
      badge.classList.remove('is-alert');
      btn?.classList.remove('is-chat-alert');
      void badge.offsetWidth;
      badge.classList.add('is-alert');
      btn?.classList.add('is-chat-alert');
    }
  }

  function typingEl() { return $('admin-global-chat-typing'); }

  function scrollThread() {
    const el = document.querySelector('#admin-global-chat .admin-global-chat__thread')
      || $('admin-global-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function typingDotsHtml() {
    return '<span class="admin-global-chat-typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
  }

  function typingGroupHtml(kind, avatar, name, label) {
    return `
      <div class="admin-global-chat-group admin-global-chat-group--${kind} admin-global-chat-group--typing">
        <div class="admin-global-chat-group__head">
          ${avatar}
          <strong>${escapeHtml(name)}</strong>
        </div>
        <div class="admin-global-chat-group__bubbles">
          <div class="admin-global-chat__bubble">
            <p class="admin-global-chat-typing-bubble" aria-label="${escapeHtml(label)}">${typingDotsHtml()}</p>
          </div>
        </div>
      </div>
    `;
  }

  function paintIncomingTyping() {
    const el = typingEl();
    if (!el) return;
    if (!open) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const parts = [];
    const guestCount = typingGuests.size;
    if (guestCount === 1) {
      const key = typingGuests.keys().next().value;
      const n = Number(key);
      const known = Number.isFinite(n);
      const name = known ? `אורח ${n}` : 'אורח';
      const label = known ? `✍️ אורח ${n} מקליד...` : '✍️ אורח מקליד...';
      parts.push(typingGroupHtml('guest', avatarHtml({ guest_number: known ? n : null }), name, label));
    } else if (guestCount > 1) {
      const label = `✍️ ${guestCount} אורחים מקלידים...`;
      parts.push(typingGroupHtml('guest', avatarHtml({}), label, label));
    }
    if (typingStaff) {
      parts.push(typingGroupHtml('staff', avatarHtml({ sender: 'staff' }), 'Lechaim', '✍️ Lechaim מקלידים...'));
    }
    if (!parts.length) {
      el.hidden = true;
      el.innerHTML = '';
      const empty = $('admin-global-chat-messages')?.querySelector('.admin-global-chat__empty');
      if (empty) empty.hidden = false;
      return;
    }
    el.hidden = false;
    el.innerHTML = parts.join('');
    const empty = $('admin-global-chat-messages')?.querySelector('.admin-global-chat__empty');
    if (empty) empty.hidden = true;
    scrollThread();
  }

  function typingGuestKey(payload) {
    const n = Number(payload?.guestNumber);
    if (Number.isFinite(n)) return n;
    return payload?.clientId ? `id:${payload.clientId}` : 'anon';
  }

  function setGuestTyping(payload, typing) {
    const key = typingGuestKey(payload);
    const prev = typingGuests.get(key);
    if (prev) window.clearTimeout(prev);
    typingGuests.delete(key);
    if (typing) {
      typingGuests.set(key, window.setTimeout(() => {
        typingGuests.delete(key);
        paintIncomingTyping();
      }, 3000));
    }
    paintIncomingTyping();
  }

  function setStaffTyping(typing) {
    window.clearTimeout(typingStaffTimer);
    typingStaffTimer = null;
    typingStaff = Boolean(typing);
    if (typingStaff) {
      typingStaffTimer = window.setTimeout(() => {
        typingStaff = false;
        paintIncomingTyping();
      }, 3000);
    }
    paintIncomingTyping();
  }

  function clearIncomingTyping() {
    typingGuests.forEach((tid) => window.clearTimeout(tid));
    typingGuests.clear();
    window.clearTimeout(typingStaffTimer);
    typingStaffTimer = null;
    typingStaff = false;
    paintIncomingTyping();
  }

  function onRemoteTyping(payload) {
    if (!open || payload?.clientId === TYPING_CLIENT) return;
    if (payload?.sender === 'staff') {
      setStaffTyping(Boolean(payload?.typing));
      return;
    }
    setGuestTyping(payload, Boolean(payload?.typing));
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
    api()?.sendTyping?.(typingPayload(false));
  }

  function onTypingInput() {
    if (!open || !api()?.sendTyping) return;
    const now = Date.now();
    if (!typingLive || now - lastTypingSent >= 1000) {
      lastTypingSent = now;
      typingLive = true;
      api().sendTyping(typingPayload(true));
    }
    window.clearTimeout(typingIdleTimer);
    typingIdleTimer = window.setTimeout(stopOutgoingTyping, 2000);
  }

  function leaveTypingChannel() {
    stopOutgoingTyping();
    clearIncomingTyping();
    api()?.leaveTyping?.();
  }

  function joinTypingChannel() {
    if (!open || !api()?.joinTyping) return;
    api().joinTyping(onRemoteTyping);
  }

  function guestLabel(row) {
    if (row?.sender === 'staff') return 'Lechaim';
    const n = Number(row?.guest_number);
    const name = Number.isFinite(n) ? `אורח ${n}` : (row?.display_name || 'אורח');
    const table = Number(row?.table_number);
    return Number.isFinite(table) ? `${name} · שולחן ${table}` : name;
  }

  function avatarColor(guestNumber) {
    const n = Math.abs(Number(guestNumber) || 0);
    return AVATAR_COLORS[n % AVATAR_COLORS.length];
  }

  function speakerKey(row) {
    if (row?.sender === 'staff') return 'staff';
    const n = Number(row?.guest_number);
    return Number.isFinite(n) ? `guest:${n}` : `id:${row?.id || ''}`;
  }

  function avatarHtml(row) {
    if (row?.sender === 'staff') {
      return `
        <span class="admin-global-chat-avatar admin-global-chat-avatar--lechaim">
          <img src="assets/logo/logo-image.png" alt="" width="28" height="28">
        </span>
      `;
    }
    const n = Number(row?.guest_number);
    if (!Number.isFinite(n)) {
      return '<span class="admin-global-chat-avatar admin-global-chat-avatar--anon" aria-hidden="true">👤</span>';
    }
    return `<span class="admin-global-chat-avatar" style="background:${avatarColor(n)}" aria-hidden="true">👤</span>`;
  }

  function reactionEmojis() {
    return api()?.REACTION_EMOJIS || ['❤️', '😂', '👍', '🔥', '😍', '👏'];
  }

  function reactionViewer() {
    return { sessionId: null, isStaff: true };
  }

  function ingestReactionRow(row) {
    if (!row?.id) return false;
    const id = String(row.id);
    const had = reactionById.has(id);
    reactionById.set(id, row);
    return !had;
  }

  function dropReactionRow(id) {
    return reactionById.delete(String(id || ''));
  }

  function pruneReactionsForMessage(messageId) {
    const mid = String(messageId || '');
    if (!mid) return;
    Array.from(reactionById.entries()).forEach(([id, row]) => {
      if (String(row.message_id) === mid) reactionById.delete(id);
    });
  }

  function reactionSummaryFor(messageId) {
    const mid = String(messageId || '');
    const out = {};
    reactionById.forEach((row) => {
      if (String(row.message_id) !== mid) return;
      const emoji = api()?.normalizeReactionEmoji?.(row.emoji) || row.emoji;
      if (!emoji) return;
      if (!out[emoji]) out[emoji] = { count: 0, mine: false };
      out[emoji].count += 1;
      if (api()?.isReactionMine?.(row, reactionViewer())) out[emoji].mine = true;
    });
    return out;
  }

  function reactionCountsHtml(messageId) {
    const slots = reactionSummaryFor(messageId);
    const chips = reactionEmojis().map((emoji) => {
      const slot = slots[emoji];
      if (!slot || slot.count < 1) return '';
      return `
        <button type="button" class="admin-global-chat-react__chip${slot.mine ? ' is-mine' : ''}" data-react-emoji="${emoji}" data-react-msg="${escapeHtml(messageId)}">
          ${emoji} ${slot.count}
        </button>
      `;
    }).filter(Boolean).join('');
    return `<div class="admin-global-chat-react__counts" data-react-counts="${escapeHtml(messageId)}">${chips}</div>`;
  }

  function closeReactionPickers() {
    openPickerId = null;
    document.querySelectorAll('#admin-global-chat-messages [data-react-picker]').forEach((el) => {
      el.hidden = true;
    });
  }

  function toggleReactionPicker(messageId) {
    const id = String(messageId || '');
    const picker = document.querySelector(`#admin-global-chat-messages [data-react-picker="${id}"]`);
    if (!picker) return;
    const wasOpen = openPickerId === id && !picker.hidden;
    closeReactionPickers();
    if (wasOpen) return;
    picker.hidden = false;
    openPickerId = id;
  }

  function paintMessageReactions(messageId) {
    const id = String(messageId || '');
    const counts = document.querySelector(`#admin-global-chat-messages [data-react-counts="${id}"]`);
    if (!counts) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = reactionCountsHtml(id);
    const next = wrap.firstElementChild;
    if (next) counts.replaceWith(next);
    const picker = document.querySelector(`#admin-global-chat-messages [data-react-picker="${id}"]`);
    if (picker) {
      reactionEmojis().forEach((emoji) => {
        const btn = picker.querySelector(`[data-react-emoji="${emoji}"]`);
        if (!btn) return;
        btn.classList.toggle('is-mine', Boolean(reactionSummaryFor(id)[emoji]?.mine));
      });
    }
  }

  async function loadReactions() {
    const ids = messages.map((row) => row.id).filter(Boolean);
    try {
      const rows = await api()?.listReactions?.(ids) || [];
      reactionById.clear();
      rows.forEach(ingestReactionRow);
    } catch (err) {
      console.warn('[admin-global-chat] reactions load failed', err);
    }
  }

  async function onToggleReaction(messageId, emoji) {
    const id = String(messageId || '');
    const face = api()?.normalizeReactionEmoji?.(emoji) || '';
    if (!id || !face) return;
    const row = messages.find((item) => String(item.id) === id);
    if (!row || row.deleted_at) return;
    const key = `${id}:${face}`;
    if (reactingKeys.has(key)) return;
    reactingKeys.add(key);
    try {
      const result = await api().toggleReaction({
        messageId: id,
        emoji: face,
        sender: 'staff',
      });
      if (result?.removed && result.row?.id) dropReactionRow(result.row.id);
      else if (result?.row?.id) ingestReactionRow(result.row);
      if (open) paintMessageReactions(id);
      closeReactionPickers();
    } catch (err) {
      console.warn('[admin-global-chat] reaction failed', err);
    } finally {
      reactingKeys.delete(key);
    }
  }

  function handleReactionPayload(payload) {
    const type = payload?.eventType;
    if (type === 'DELETE') {
      const row = payload?.old;
      if (!row?.id) {
        reactionById.clear();
        if (open) renderMessages();
        return;
      }
      const mid = row.message_id;
      dropReactionRow(row.id);
      if (open) paintMessageReactions(mid);
      return;
    }
    const row = payload?.new;
    if (!row?.id) return;
    ingestReactionRow(row);
    if (open) paintMessageReactions(row.message_id);
  }

  function renderMessages() {
    const el = $('admin-global-chat-messages');
    if (!el) return;
    const visible = messages.filter((row) => api()?.isFromThisEvening?.(row.created_at) !== false);
    if (!visible.length) {
      el.innerHTML = '<p class="admin-global-chat__empty">אין הודעות מהערב הזה</p>';
      return;
    }
    const groups = [];
    visible.forEach((row) => {
      const last = groups[groups.length - 1];
      if (last && speakerKey(last[0]) === speakerKey(row)) last.push(row);
      else groups.push([row]);
    });
    el.innerHTML = groups.map((group) => {
      const first = group[0];
      const staff = first.sender === 'staff';
      const bubbles = group.map((row) => {
        const deleted = Boolean(row.deleted_at);
        const canMute = !staff && row.session_id && !mutedBySession.has(String(row.session_id));
        return `
          <div class="admin-global-chat__bubble" data-id="${escapeHtml(row.id)}" data-msg-id="${escapeHtml(row.id)}">
            <div class="admin-global-chat-bubble__row">
              <p>${escapeHtml(deleted ? 'הודעה הוסרה' : row.body)}</p>
              ${deleted ? '' : `<button type="button" class="admin-global-chat-react__open" data-react-open="${escapeHtml(row.id)}" aria-label="תגובה">😊</button>`}
            </div>
            <time>${escapeHtml(formatTime(row.created_at))}</time>
            ${deleted ? '' : `
              <div class="admin-global-chat-react">
                <div class="admin-global-chat-react__picker" data-react-picker="${escapeHtml(row.id)}" hidden>
                  ${reactionEmojis().map((emoji) => `
                    <button type="button" class="admin-global-chat-react__emoji${reactionSummaryFor(row.id)[emoji]?.mine ? ' is-mine' : ''}" data-react-emoji="${emoji}" data-react-msg="${escapeHtml(row.id)}">${emoji}</button>
                  `).join('')}
                </div>
                ${reactionCountsHtml(row.id)}
              </div>
            `}
            ${deleted ? '' : `
              <div class="admin-global-chat__tools">
                <button type="button" class="admin-btn admin-btn--ghost" data-global-chat="delete" data-id="${escapeHtml(row.id)}">מחק</button>
                ${canMute ? `<button type="button" class="admin-btn admin-btn--ghost" data-global-chat="mute" data-session="${escapeHtml(row.session_id)}">השתק</button>` : ''}
              </div>
            `}
          </div>
        `;
      }).join('');
      return `
        <div class="admin-global-chat-group admin-global-chat-group--${staff ? 'staff' : 'guest'}">
          <div class="admin-global-chat-group__head">
            ${avatarHtml(first)}
            <strong>${escapeHtml(guestLabel(first))}</strong>
          </div>
          <div class="admin-global-chat-group__bubbles">${bubbles}</div>
        </div>
      `;
    }).join('');
    scrollThread();
    if (openPickerId) {
      const picker = document.querySelector(`#admin-global-chat-messages [data-react-picker="${openPickerId}"]`);
      if (picker) picker.hidden = false;
    }
  }

  function upsertMessage(row, eventType) {
    if (!row?.id || !api()?.isFromThisEvening?.(row.created_at)) return;
    const idx = messages.findIndex((item) => String(item.id) === String(row.id));
    if (idx >= 0) {
      messages[idx] = { ...messages[idx], ...row };
    } else {
      messages = [...messages, row].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      const isGuestInsert = row.sender === 'guest' && !row.deleted_at && eventType !== 'UPDATE';
      if (isGuestInsert) {
        window.LechaimAdminTables?.playChatNotifyChime?.(row.id, { silent: open });
        if (!open) setUnread(unread + 1, { pulse: true });
      }
    }
    if (messages.length > 100) messages = messages.slice(-100);
    if (open) renderMessages();
  }

  async function loadMessages() {
    if (!api()?.isConfigured?.()) return;
    try {
      messages = await api().listMessages({ forAdmin: true });
      await loadReactions();
      renderMessages();
    } catch (err) {
      console.warn('[admin-global-chat] load failed', err);
    }
  }

  async function openPanel() {
    const modal = $('admin-global-chat');
    if (!modal) return;
    open = true;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setUnread(0);
    await loadMessages();
    joinTypingChannel();
    requestAnimationFrame(() => $('admin-global-chat-input')?.focus());
  }

  function closePanel() {
    leaveTypingChannel();
    const modal = $('admin-global-chat');
    open = false;
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
  }

  async function sendCurrent() {
    if (sending) return;
    const input = $('admin-global-chat-input');
    const body = String(input?.value || '').trim();
    if (!body) return;
    sending = true;
    stopOutgoingTyping();
    try {
      const row = await api().sendMessage({ sender: 'staff', body });
      if (input) input.value = '';
      if (row) upsertMessage(row);
    } catch (err) {
      console.error('[admin-global-chat] send failed', err);
    } finally {
      sending = false;
    }
  }

  async function deleteCurrent(id) {
    try {
      const row = await api().deleteMessage(id);
      if (row) upsertMessage(row);
    } catch (err) {
      console.error('[admin-global-chat] delete failed', err);
    }
  }

  async function muteCurrent(sessionId) {
    try {
      await api().muteMember(sessionId);
      mutedBySession.add(String(sessionId));
      renderMessages();
    } catch (err) {
      console.error('[admin-global-chat] mute failed', err);
    }
  }

  async function resetChat() {
    const ok = await (window.LechaimAdminTables?.showConfirmModal
      ? window.LechaimAdminTables.showConfirmModal(
        'לאפס את הצ\'אט הכללי? כל ההודעות יימחקו לכולם.',
        { yesLabel: 'אפס', noLabel: 'ביטול' }
      )
      : Promise.resolve(window.confirm('לאפס את הצ\'אט הכללי?')));
    if (!ok) return;
    try {
      await api().resetMessages();
      messages = [];
      reactionById.clear();
      setUnread(0);
      renderMessages();
    } catch (err) {
      console.error('[admin-global-chat] reset failed', err);
    }
  }

  function subscribe() {
    if (unsub || !api()?.isConfigured?.()) return;
    unsub = api().subscribe((payload) => {
      const table = payload?.table;
      if (table === 'global_chat_messages') {
        if (payload?.eventType === 'DELETE') {
          const id = payload?.old?.id;
          if (id) {
            messages = messages.filter((item) => String(item.id) !== String(id));
            pruneReactionsForMessage(id);
          } else {
            messages = [];
            reactionById.clear();
          }
          if (open) renderMessages();
          return;
        }
        const row = payload?.new;
        if (row?.id) {
          upsertMessage(row, payload?.eventType);
          if (row.deleted_at) pruneReactionsForMessage(row.id);
          if (open && payload?.eventType !== 'UPDATE') {
            if (row.sender === 'staff') setStaffTyping(false);
            else setGuestTyping({ guestNumber: row.guest_number }, false);
          }
        }
      }
      if (table === 'global_chat_reactions') {
        handleReactionPayload(payload);
      }
      if (table === 'global_chat_members' && payload?.new?.session_id && payload.new.is_muted) {
        mutedBySession.add(String(payload.new.session_id));
        if (open) renderMessages();
      }
    });
  }

  function stop() {
    if (typeof unsub === 'function') {
      try { unsub(); } catch (_) { /* ignore */ }
    }
    unsub = null;
    closePanel();
  }

  function start() {
    subscribe();
  }

  function init() {
    $('admin-global-chat-open')?.addEventListener('click', openPanel);
    $('admin-global-chat-close')?.addEventListener('click', closePanel);
    $('admin-global-chat-reset')?.addEventListener('click', resetChat);
    $('admin-global-chat-backdrop')?.addEventListener('click', closePanel);
    $('admin-global-chat-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      sendCurrent();
    });
    $('admin-global-chat-input')?.addEventListener('input', onTypingInput);
    $('admin-global-chat-messages')?.addEventListener('click', (event) => {
      const openBtn = event.target.closest('[data-react-open]');
      if (openBtn) {
        event.preventDefault();
        toggleReactionPicker(openBtn.getAttribute('data-react-open'));
        return;
      }
      const emojiBtn = event.target.closest('[data-react-emoji]');
      if (emojiBtn) {
        event.preventDefault();
        onToggleReaction(emojiBtn.getAttribute('data-react-msg'), emojiBtn.getAttribute('data-react-emoji'));
        return;
      }
      if (!event.target.closest('[data-react-picker]')) closeReactionPickers();
      const btn = event.target.closest('[data-global-chat]');
      if (!btn) return;
      if (btn.dataset.globalChat === 'delete') deleteCurrent(btn.dataset.id);
      if (btn.dataset.globalChat === 'mute') muteCurrent(btn.dataset.session);
    });
  }

  global.LechaimAdminGlobalChat = {
    init,
    start,
    stop,
    open: openPanel,
    close: closePanel,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
