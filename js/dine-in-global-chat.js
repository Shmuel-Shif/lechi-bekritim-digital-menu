/**
 * LECHAIM — Customer global dine-in chat
 * Separate from the private table chat. Identity is per phone (guest), not table.
 * Does not open an Admin table session.
 */
(function () {
  'use strict';

  const GUEST_KEY = 'lechaim-global-chat-guest-id';
  const LAST_READ_KEY = 'lechaim-global-chat-last-read';
  const HINT_SEEN_KEY = 'lechaim-global-chat-hint-seen';
  const FALLBACK = {
    globalChatFabLabel: 'צ\'אט כללי של לחיים',
    globalChatTitle: 'צ\'אט כללי של לחיים',
    globalChatPlaceholder: 'כתבו הודעה לכולם…',
    globalChatSend: 'שלח',
    globalChatEmpty: 'היו הראשונים לכתוב משהו נחמד.',
    globalChatError: 'לא ניתן לשלוח. נסו שוב.',
    globalChatMuted: 'הושתקתם זמנית. אפשר להמשיך לקרוא.',
    globalChatDeleted: 'הודעה הוסרה',
    globalChatWelcomeTitle: 'ברוכים הבאים לצ\'אט הכללי של לחיים',
    globalChatWelcomeBody: 'הצ\'אט מיועד לאורחי המסעדה.\n\nשימו לב: שאר לקוחות המסעדה רואים את ההודעות שלכם. זהו צ\'אט כללי לכל המסעדה.\n\nנשמח לשמור כאן על אווירה נעימה ומכבדת את כל האנשים שיושבים במסעדה.\n\nאנא הימנעו מתוכן פוגעני.',
    globalChatWelcomeOk: 'אני מבין וממשיך',
    globalChatFabHint: 'צ\'אט כללי',
    globalChatGuestName: 'אורח {n}',
    globalChatStaffName: 'Lechaim',
    globalChatTypingStaff: '✍️ Lechaim מקלידים...',
    globalChatTypingGuest: '✍️ אורח מקליד...',
    globalChatTypingGuestOne: '✍️ אורח {n} מקליד...',
    globalChatTypingGuests: '✍️ {n} אורחים מקלידים...',
  };

  let fab = null;
  let panel = null;
  let listEl = null;
  let form = null;
  let input = null;
  let welcomeEl = null;
  let mutedEl = null;
  let badge = null;
  let open = false;
  let sessionId = null;
  let tableNumber = null;
  let member = null;
  let messages = [];
  let unread = 0;
  let unsub = null;
  let watchStarting = false;
  let pollTimer = null;
  let sending = false;
  let threadEl = null;
  let typingEl = null;
  let typingLive = false;
  let lastTypingSent = 0;
  let typingIdleTimer = null;
  let guestIdMemory = '';
  let panelFocusTrapRelease = null;
  const typingGuests = new Map();
  let typingStaff = false;
  let typingStaffTimer = null;
  const TYPING_CLIENT = `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const AVATAR_COLORS = ['#2f9e44', '#7048e8', '#f08c00', '#e03131', '#0c8599', '#5c7cfa', '#c2255c', '#2b8a3e', '#9c36b5', '#e8590c'];
  const reactionById = new Map();
  const reactingKeys = new Set();
  let openPickerId = null;

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

  function isDineInSite() {
    const gate = document.getElementById('entry-gate');
    if (gate?.dataset?.mode === 'dine-in-only') return true;
    const path = String(location.pathname || '').toLowerCase();
    return path.includes('dine-in');
  }

  function currentTableNumber() {
    const ctx = window.LechaimOrderContext || {};
    const session = window.LechaimOrderSession?.getSession?.() || {};
    if (ctx.browseOnly) return null;
    const table = Number(ctx.tableNumber != null ? ctx.tableNumber : session.tableNumber);
    return Number.isFinite(table) && table > 0 ? table : null;
  }

  function getGuestId() {
    if (guestIdMemory) return guestIdMemory;
    try {
      const stored = String(localStorage.getItem(GUEST_KEY) || '').trim();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
        guestIdMemory = stored.toLowerCase();
        return guestIdMemory;
      }
    } catch (_) { /* ignore */ }
    const id = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : ((r & 0x3) | 0x8);
        return v.toString(16);
      });
    guestIdMemory = id;
    try { localStorage.setItem(GUEST_KEY, id); } catch (_) { /* ignore */ }
    return id;
  }

  function api() {
    return window.LechaimGlobalChat;
  }

  function guestLabel(row) {
    if (row?.sender === 'staff') return t('globalChatStaffName');
    const n = Number(row?.guest_number);
    if (Number.isFinite(n)) return t('globalChatGuestName').replace('{n}', String(n));
    return row?.display_name || t('globalChatGuestName').replace('{n}', '');
  }

  function formatTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function ensureDom() {
    if (fab) return;
    fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'dine-in-global-chat-fab';
    fab.className = 'dine-in-global-chat-fab';
    fab.hidden = true;
    fab.innerHTML = `
      <span class="dine-in-global-chat-fab__hint" aria-hidden="true">
        <span class="dine-in-global-chat-fab__hint-text"></span>
      </span>
      <span class="dine-in-global-chat-fab__icon" aria-hidden="true">🌐</span>
      <span class="dine-in-global-chat-fab__label"></span>
      <span class="dine-in-global-chat-fab__badge" id="dine-in-global-chat-fab-badge" hidden>0</span>
    `;
    badge = fab.querySelector('#dine-in-global-chat-fab-badge');

    panel = document.createElement('div');
    panel.id = 'dine-in-global-chat-panel';
    panel.className = 'dine-in-global-chat-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="dine-in-global-chat-panel__card" role="dialog" aria-modal="true" aria-labelledby="dine-in-global-chat-title">
        <header class="dine-in-global-chat-panel__header">
          <h2 class="dine-in-global-chat-panel__title" id="dine-in-global-chat-title"></h2>
          <button type="button" class="dine-in-global-chat-panel__close" id="dine-in-global-chat-close" aria-label="סגור">×</button>
        </header>
        <div class="dine-in-global-chat-welcome" id="dine-in-global-chat-welcome" hidden>
          <p class="dine-in-global-chat-welcome__emoji" aria-hidden="true">💚</p>
          <h3 class="dine-in-global-chat-welcome__title"></h3>
          <p class="dine-in-global-chat-welcome__body"></p>
          <button type="button" class="dine-in-global-chat-welcome__ok" id="dine-in-global-chat-welcome-ok"></button>
        </div>
        <p class="dine-in-global-chat-muted" id="dine-in-global-chat-muted" hidden></p>
        <div class="dine-in-global-chat-panel__thread" id="dine-in-global-chat-thread">
          <div class="dine-in-global-chat-panel__messages" id="dine-in-global-chat-messages"></div>
          <div class="dine-in-global-chat-typing" id="dine-in-global-chat-typing" hidden aria-live="polite"></div>
        </div>
        <form class="dine-in-global-chat-panel__form" id="dine-in-global-chat-form">
          <label class="visually-hidden" for="dine-in-global-chat-input">הודעה</label>
          <input
            id="dine-in-global-chat-input"
            class="dine-in-global-chat-panel__input"
            type="text"
            maxlength="500"
            autocomplete="off"
            enterkeyhint="send"
          >
          <button type="submit" class="dine-in-global-chat-panel__send" id="dine-in-global-chat-send"></button>
        </form>
      </div>
    `;
    document.body.append(fab, panel);
    listEl = panel.querySelector('#dine-in-global-chat-messages');
    threadEl = panel.querySelector('#dine-in-global-chat-thread');
    form = panel.querySelector('#dine-in-global-chat-form');
    input = panel.querySelector('#dine-in-global-chat-input');
    welcomeEl = panel.querySelector('#dine-in-global-chat-welcome');
    mutedEl = panel.querySelector('#dine-in-global-chat-muted');
    typingEl = panel.querySelector('#dine-in-global-chat-typing');

    fab.addEventListener('click', () => {
      if (open) closePanel();
      else openPanel();
    });
    panel.querySelector('#dine-in-global-chat-close')?.addEventListener('click', closePanel);
    panel.querySelector('#dine-in-global-chat-welcome-ok')?.addEventListener('click', acceptWelcome);
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      sendCurrent();
    });
    input?.addEventListener('input', onTypingInput);
    listEl?.addEventListener('click', onReactionClick);
    applyCopy();
  }

  function applyCopy() {
    if (!fab || !panel) return;
    const label = fab.querySelector('.dine-in-global-chat-fab__label');
    if (label) label.textContent = t('globalChatFabLabel');
    fab.setAttribute('aria-label', t('globalChatFabLabel'));
    const hintText = fab.querySelector('.dine-in-global-chat-fab__hint-text');
    if (hintText) hintText.textContent = t('globalChatFabHint');
    refreshFabHint();
    const title = panel.querySelector('#dine-in-global-chat-title');
    if (title) title.textContent = t('globalChatTitle');
    if (input) input.placeholder = t('globalChatPlaceholder');
    const sendBtn = panel.querySelector('#dine-in-global-chat-send');
    if (sendBtn) sendBtn.textContent = t('globalChatSend');
    if (mutedEl) mutedEl.textContent = t('globalChatMuted');
    const welcomeTitle = panel.querySelector('.dine-in-global-chat-welcome__title');
    const welcomeBody = panel.querySelector('.dine-in-global-chat-welcome__body');
    const welcomeOk = panel.querySelector('#dine-in-global-chat-welcome-ok');
    if (welcomeTitle) welcomeTitle.textContent = t('globalChatWelcomeTitle');
    if (welcomeBody) welcomeBody.textContent = t('globalChatWelcomeBody');
    if (welcomeOk) welcomeOk.textContent = t('globalChatWelcomeOk');
    setBadge(unread);
    paintIncomingTyping();
  }

  function scrollThread() {
    const el = threadEl || listEl;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function typingDotsHtml() {
    return '<span class="dine-in-global-chat-typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
  }

  function typingGroupHtml(kind, avatar, name, label) {
    return `
      <div class="dine-in-global-chat-group dine-in-global-chat-group--${kind} dine-in-global-chat-group--typing">
        <div class="dine-in-global-chat-group__head">
          ${avatar}
          <strong>${escapeHtml(name)}</strong>
        </div>
        <div class="dine-in-global-chat-group__bubbles">
          <div class="dine-in-global-chat-bubble">
            <p class="dine-in-global-chat-bubble__body dine-in-global-chat-typing-bubble" aria-label="${escapeHtml(label)}">${typingDotsHtml()}</p>
          </div>
        </div>
      </div>
    `;
  }

  function paintIncomingTyping() {
    if (!typingEl) return;
    if (!open || (welcomeEl && !welcomeEl.hidden)) {
      typingEl.hidden = true;
      typingEl.innerHTML = '';
      return;
    }
    const parts = [];
    const guestCount = typingGuests.size;
    if (guestCount === 1) {
      const key = typingGuests.keys().next().value;
      const n = Number(key);
      const known = Number.isFinite(n);
      const label = known
        ? t('globalChatTypingGuestOne').replace('{n}', String(n))
        : t('globalChatTypingGuest');
      const name = known
        ? t('globalChatGuestName').replace('{n}', String(n))
        : t('globalChatGuestName').replace('{n}', '').trim();
      parts.push(typingGroupHtml('guest', avatarHtml({ guest_number: known ? n : null }), name, label));
    } else if (guestCount > 1) {
      const label = t('globalChatTypingGuests').replace('{n}', String(guestCount));
      parts.push(typingGroupHtml('guest', avatarHtml({}), label, label));
    }
    if (typingStaff) {
      const label = t('globalChatTypingStaff');
      parts.push(typingGroupHtml('staff', avatarHtml({ sender: 'staff' }), t('globalChatStaffName'), label));
    }
    if (!parts.length) {
      typingEl.hidden = true;
      typingEl.innerHTML = '';
      const empty = listEl?.querySelector('.dine-in-global-chat-panel__empty');
      if (empty) empty.hidden = false;
      return;
    }
    typingEl.hidden = false;
    typingEl.innerHTML = parts.join('');
    const empty = listEl?.querySelector('.dine-in-global-chat-panel__empty');
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
    const payload = {
      typing: Boolean(typing),
      sender: 'guest',
      clientId: TYPING_CLIENT,
    };
    const n = Number(member?.guest_number);
    if (Number.isFinite(n)) payload.guestNumber = n;
    return payload;
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
    if (!open || member?.is_muted || (welcomeEl && !welcomeEl.hidden) || !api()?.sendTyping) return;
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

  function readLastRead() {
    try {
      const raw = localStorage.getItem(LAST_READ_KEY);
      if (!raw) return null;
      const stamp = Date.parse(raw);
      return Number.isFinite(stamp) ? stamp : null;
    } catch {
      return null;
    }
  }

  function writeLastRead(iso) {
    try {
      localStorage.setItem(LAST_READ_KEY, iso || new Date().toISOString());
    } catch (_) { /* ignore */ }
  }

  function markGlobalRead() {
    const latest = messages.reduce((max, row) => {
      const stamp = Date.parse(row?.created_at);
      return Number.isFinite(stamp) && stamp > max ? stamp : max;
    }, Date.now());
    writeLastRead(new Date(latest).toISOString());
    setBadge(0);
  }

  function setBadge(count) {
    unread = Math.max(0, Number(count) || 0);
    if (!badge || !fab) return;
    const label = fab.querySelector('.dine-in-global-chat-fab__label');
    if (unread <= 0 || open) {
      badge.hidden = true;
      badge.textContent = '0';
      if (label) label.hidden = false;
      fab.setAttribute('aria-label', t('globalChatFabLabel'));
      return;
    }
    badge.hidden = false;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    if (label) label.hidden = false;
    fab.setAttribute('aria-label', `${t('globalChatFabLabel')} ${badge.textContent}`);
  }

  function hintWasSeen() {
    try {
      return localStorage.getItem(HINT_SEEN_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function markFabHintSeen() {
    try {
      localStorage.setItem(HINT_SEEN_KEY, '1');
    } catch (_) { /* ignore */ }
    refreshFabHint();
  }

  function refreshFabHint() {
    const hint = fab?.querySelector('.dine-in-global-chat-fab__hint');
    if (!hint) return;
    hint.hidden = Boolean(open || hintWasSeen());
  }

  function refreshUnreadFromMessages() {
    if (open) {
      setBadge(0);
      return;
    }
    const since = readLastRead();
    if (since == null) {
      writeLastRead(new Date().toISOString());
      setBadge(0);
      return;
    }
    const n = messages.filter((row) => (
      row?.sender === 'staff'
      && !row.deleted_at
      && Date.parse(row.created_at) > since
    )).length;
    setBadge(n);
  }

  function setMutedUi(muted) {
    const on = Boolean(muted);
    if (mutedEl) mutedEl.hidden = !on;
    if (input) input.disabled = on;
    const sendBtn = panel?.querySelector('#dine-in-global-chat-send');
    if (sendBtn) sendBtn.disabled = on;
  }

  function showWelcome(show) {
    if (welcomeEl) welcomeEl.hidden = !show;
    if (form) form.hidden = show;
    if (threadEl) threadEl.hidden = show;
    if (mutedEl && show) mutedEl.hidden = true;
    if (typingEl && show) {
      typingEl.hidden = true;
      typingEl.innerHTML = '';
    }
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
        <span class="dine-in-global-chat-avatar dine-in-global-chat-avatar--lechaim">
          <img src="assets/logo/logo-image.png" alt="" width="28" height="28">
        </span>
      `;
    }
    const n = Number(row?.guest_number);
    if (!Number.isFinite(n)) {
      return '<span class="dine-in-global-chat-avatar dine-in-global-chat-avatar--anon" aria-hidden="true">👤</span>';
    }
    return `<span class="dine-in-global-chat-avatar" style="background:${avatarColor(n)}" aria-hidden="true">👤</span>`;
  }

  function reactionEmojis() {
    return api()?.REACTION_EMOJIS || ['❤️', '😂', '👍', '🔥', '😍', '👏'];
  }

  function reactionViewer() {
    return { sessionId, isStaff: false };
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
        <button type="button" class="dine-in-global-chat-react__chip${slot.mine ? ' is-mine' : ''}" data-react-emoji="${emoji}" data-react-msg="${escapeHtml(messageId)}" ${member?.is_muted ? 'disabled' : ''}>
          ${emoji} ${slot.count}
        </button>
      `;
    }).filter(Boolean).join('');
    return chips
      ? `<div class="dine-in-global-chat-react__counts" data-react-counts="${escapeHtml(messageId)}">${chips}</div>`
      : `<div class="dine-in-global-chat-react__counts" data-react-counts="${escapeHtml(messageId)}"></div>`;
  }

  function closeReactionPickers() {
    openPickerId = null;
    listEl?.querySelectorAll('[data-react-picker]').forEach((el) => {
      el.hidden = true;
    });
  }

  function toggleReactionPicker(messageId) {
    const id = String(messageId || '');
    const picker = listEl?.querySelector(`[data-react-picker="${id}"]`);
    if (!picker) return;
    const wasOpen = openPickerId === id && !picker.hidden;
    closeReactionPickers();
    if (wasOpen) return;
    picker.hidden = false;
    openPickerId = id;
  }

  function paintMessageReactions(messageId) {
    const id = String(messageId || '');
    const counts = listEl?.querySelector(`[data-react-counts="${id}"]`);
    if (!counts) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = reactionCountsHtml(id);
    const next = wrap.firstElementChild;
    if (next) counts.replaceWith(next);
    const picker = listEl?.querySelector(`[data-react-picker="${id}"]`);
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
      console.warn('[dine-in-global-chat] reactions load failed', err);
    }
  }

  async function onToggleReaction(messageId, emoji) {
    const id = String(messageId || '');
    const face = api()?.normalizeReactionEmoji?.(emoji) || '';
    if (!id || !face || !sessionId || member?.is_muted) return;
    const row = messages.find((item) => String(item.id) === id);
    if (!row || row.deleted_at) return;
    const key = `${id}:${face}`;
    if (reactingKeys.has(key)) return;
    reactingKeys.add(key);
    try {
      const result = await api().toggleReaction({
        messageId: id,
        emoji: face,
        sender: 'guest',
        sessionId,
      });
      if (result?.removed && result.row?.id) dropReactionRow(result.row.id);
      else if (result?.row?.id) ingestReactionRow(result.row);
      paintMessageReactions(id);
      closeReactionPickers();
    } catch (err) {
      console.warn('[dine-in-global-chat] reaction failed', err);
    } finally {
      reactingKeys.delete(key);
    }
  }

  function onReactionClick(event) {
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
    if (!listEl) return;
    if (welcomeEl && !welcomeEl.hidden) return;
    const visible = messages.filter((row) => api()?.isFromThisEvening?.(row.created_at) !== false);
    if (!visible.length) {
      listEl.innerHTML = `<p class="dine-in-global-chat-panel__empty">${escapeHtml(t('globalChatEmpty'))}</p>`;
      return;
    }
    const groups = [];
    visible.forEach((row) => {
      const last = groups[groups.length - 1];
      if (last && speakerKey(last[0]) === speakerKey(row)) last.push(row);
      else groups.push([row]);
    });
    listEl.innerHTML = groups.map((group) => {
      const first = group[0];
      const staff = first.sender === 'staff';
      const mine = !staff && Number(first.guest_number) === Number(member?.guest_number);
      const kind = staff ? 'staff' : (mine ? 'mine' : 'guest');
      const bubbles = group.map((row) => {
        const deleted = Boolean(row.deleted_at);
        return `
          <div class="dine-in-global-chat-bubble" data-msg-id="${escapeHtml(row.id)}">
            <div class="dine-in-global-chat-bubble__row">
              <p class="dine-in-global-chat-bubble__body">${escapeHtml(deleted ? t('globalChatDeleted') : row.body)}</p>
              ${deleted || member?.is_muted ? '' : `<button type="button" class="dine-in-global-chat-react__open" data-react-open="${escapeHtml(row.id)}" aria-label="תגובה">😊</button>`}
            </div>
            <time class="dine-in-global-chat-bubble__time">${escapeHtml(formatTime(row.created_at))}</time>
            ${deleted ? '' : `
              <div class="dine-in-global-chat-react">
                ${member?.is_muted ? '' : `
                  <div class="dine-in-global-chat-react__picker" data-react-picker="${escapeHtml(row.id)}" hidden>
                    ${reactionEmojis().map((emoji) => `
                      <button type="button" class="dine-in-global-chat-react__emoji${reactionSummaryFor(row.id)[emoji]?.mine ? ' is-mine' : ''}" data-react-emoji="${emoji}" data-react-msg="${escapeHtml(row.id)}">${emoji}</button>
                    `).join('')}
                  </div>
                `}
                ${reactionCountsHtml(row.id)}
              </div>
            `}
          </div>
        `;
      }).join('');
      return `
        <div class="dine-in-global-chat-group dine-in-global-chat-group--${kind}">
          <div class="dine-in-global-chat-group__head">
            ${avatarHtml(first)}
            <strong>${escapeHtml(guestLabel(first))}</strong>
          </div>
          <div class="dine-in-global-chat-group__bubbles">${bubbles}</div>
        </div>
      `;
    }).join('');
    scrollThread();
    if (openPickerId) {
      const picker = listEl.querySelector(`[data-react-picker="${openPickerId}"]`);
      if (picker) picker.hidden = false;
    }
  }

  function upsertMessage(row, eventType) {
    if (!row?.id || !api()?.isFromThisEvening?.(row.created_at)) return false;
    const safe = api().publicize ? api().publicize(row) : row;
    const idx = messages.findIndex((item) => String(item.id) === String(safe.id));
    if (idx >= 0) {
      messages[idx] = { ...messages[idx], ...safe };
      if (open) renderMessages();
      return false;
    }
    messages = [...messages, safe].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (messages.length > 100) messages = messages.slice(-100);
    if (open) renderMessages();
    else if (safe.sender === 'staff' && !safe.deleted_at && eventType !== 'UPDATE') setBadge(unread + 1);
    return true;
  }

  function stopWatch() {
    if (typeof unsub === 'function') {
      try { unsub(); } catch (_) { /* ignore */ }
    }
    unsub = null;
  }

  function attachGuestIdentity() {
    sessionId = getGuestId();
    tableNumber = currentTableNumber();
    return sessionId;
  }

  function handlePayload(payload) {
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
        if (open && welcomeEl?.hidden) renderMessages();
        else if (!open) refreshUnreadFromMessages();
        return;
      }
      const row = payload?.new;
      if (row?.id) {
        upsertMessage(row, payload?.eventType);
        if (row.deleted_at) {
          pruneReactionsForMessage(row.id);
          if (open) paintMessageReactions(row.id);
        }
        if (open && payload?.eventType !== 'UPDATE') {
          if (row.sender === 'staff') setStaffTyping(false);
          else setGuestTyping({ guestNumber: row.guest_number }, false);
        }
      }
    }
    if (table === 'global_chat_reactions') {
      handleReactionPayload(payload);
    }
    if (table === 'global_chat_members' && payload?.new && String(payload.new.session_id) === String(sessionId)) {
      member = { ...(member || {}), ...payload.new };
      setMutedUi(member.is_muted);
      if (open) renderMessages();
    }
  }

  async function startBackgroundWatch() {
    if (!api()?.isConfigured?.() || unsub || watchStarting) return;
    watchStarting = true;
    try {
      if (readLastRead() == null) writeLastRead(new Date().toISOString());
      try {
        messages = await api().listMessages({ forAdmin: false });
        await loadReactions();
        refreshUnreadFromMessages();
      } catch (err) {
        console.warn('[dine-in-global-chat] background load failed', err);
      }
      if (!unsub) unsub = api().subscribe(handlePayload);
    } finally {
      watchStarting = false;
    }
  }

  async function loadRoom() {
    attachGuestIdentity();
    if (!sessionId || !api()?.isConfigured?.()) return;
    member = await api().getOrCreateMember(sessionId, tableNumber);
    messages = await api().listMessages({ forAdmin: false });
    await loadReactions();
    setMutedUi(member?.is_muted);
    showWelcome(!member?.accepted_guidelines_at);
    if (member?.accepted_guidelines_at) renderMessages();
    markGlobalRead();

    if (!unsub) unsub = api().subscribe(handlePayload);
  }

  async function acceptWelcome() {
    attachGuestIdentity();
    if (!sessionId) return;
    try {
      member = await api().acceptGuidelines(sessionId) || member;
      showWelcome(false);
      setMutedUi(member?.is_muted);
      renderMessages();
      requestAnimationFrame(() => input?.focus());
    } catch (err) {
      console.warn('[dine-in-global-chat] accept failed', err);
    }
  }

  async function openPanel() {
    open = true;
    markFabHintSeen();
    if (panel) panel.hidden = false;
    fab?.classList.add('is-open');
    document.body.classList.add('dine-in-global-chat-open');
    setBadge(0);
    applyCopy();
    if (typeof panelFocusTrapRelease === 'function') panelFocusTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(panel?.querySelector('.dine-in-global-chat-panel__card') || panel);
    panelFocusTrapRelease = typeof release === 'function' ? release : null;
    try {
      attachGuestIdentity();
      await loadRoom();
      joinTypingChannel();
    } catch (err) {
      console.warn('[dine-in-global-chat] open failed', err);
    }
  }

  function closePanel() {
    leaveTypingChannel();
    if (typeof panelFocusTrapRelease === 'function') panelFocusTrapRelease();
    panelFocusTrapRelease = null;
    if (open) markGlobalRead();
    open = false;
    if (panel) panel.hidden = true;
    fab?.classList.remove('is-open');
    document.body.classList.remove('dine-in-global-chat-open');
  }

  async function sendCurrent() {
    if (sending || !input || member?.is_muted || (welcomeEl && !welcomeEl.hidden)) return;
    const body = input.value.trim();
    if (!body) return;
    sending = true;
    stopOutgoingTyping();
    try {
      attachGuestIdentity();
      if (!sessionId) throw new Error('no guest id');
      if (!member) member = await api().getOrCreateMember(sessionId, tableNumber);
      const row = await api().sendMessage({
        sessionId,
        tableNumber,
        sender: 'guest',
        body,
      });
      input.value = '';
      if (row) upsertMessage(row);
    } catch (err) {
      console.error('[dine-in-global-chat] send failed', err);
      if (err?.code === 'muted' || /muted/i.test(String(err?.message || ''))) {
        setMutedUi(true);
      } else {
        input.setCustomValidity(t('globalChatError'));
        input.reportValidity();
        window.setTimeout(() => input.setCustomValidity(''), 1800);
      }
    } finally {
      sending = false;
    }
  }

  function syncVisibility() {
    ensureDom();
    applyCopy();
    const allowed = isDineInSite() && api()?.isConfigured?.();
    fab.hidden = !allowed;
    if (!allowed) {
      closePanel();
      stopWatch();
      sessionId = null;
      tableNumber = null;
      member = null;
      messages = [];
      reactionById.clear();
      setBadge(0);
      return;
    }
    attachGuestIdentity();
    startBackgroundWatch();
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
