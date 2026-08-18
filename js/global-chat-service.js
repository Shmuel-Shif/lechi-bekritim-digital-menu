/**
 * LECHAIM — Global dine-in guest chat (Supabase I/O)
 * Separate from LechaimTableChat / table_chats.
 */
(function (global) {
  'use strict';

  const TABLE_MEMBERS = 'global_chat_members';
  const TABLE_MESSAGES = 'global_chat_messages';
  const TABLE_REACTIONS = 'global_chat_reactions';
  const REACTION_EMOJIS = Object.freeze(['❤️', '😂', '👍', '🔥', '😍', '👏']);
  const REACTION_EMOJI_SET = new Set(REACTION_EMOJIS);
  const MAX_BODY = 500;
  const LIST_LIMIT = 100;
  const TZ = 'Europe/Athens';
  const GUEST_COLS = 'id, sender, display_name, guest_number, body, created_at, deleted_at';
  const ADMIN_COLS = `${GUEST_COLS}, session_id, table_number`;

  let client = null;
  let roomChannel = null;
  let typingChannel = null;

  function getConfig() {
    return global.LECHAIM_SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    const { url, anonKey } = getConfig();
    return Boolean(url && anonKey && global.supabase?.createClient);
  }

  function getClient() {
    try {
      const shared = global.LechaimInventory?.getClient?.();
      if (shared) return shared;
    } catch (_) { /* ignore */ }

    if (client) return client;
    if (!isConfigured()) {
      throw new Error('[LechaimGlobalChat] Supabase is not configured');
    }
    const { url, anonKey } = getConfig();
    client = global.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: global.localStorage,
      },
    });
    return client;
  }

  function throwIfError(error, context) {
    if (!error) return;
    const err = new Error(`${context}: ${error.message || error}`);
    err.cause = error;
    throw err;
  }

  function trimBody(text) {
    const body = String(text || '').trim();
    if (!body) return '';
    return body.slice(0, MAX_BODY);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function athensParts(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const map = {};
    fmt.formatToParts(d).forEach((part) => {
      if (part.type !== 'literal') map[part.type] = part.value;
    });
    return {
      year: map.year,
      month: map.month,
      day: map.day,
      hour: map.hour === '24' ? '00' : map.hour,
      minute: map.minute,
    };
  }

  function eveningStartIso(now = new Date()) {
    const p = athensParts(now);
    const target = `${p.year}-${p.month}-${p.day} 00:00`;
    const y = Number(p.year);
    const mo = Number(p.month);
    const d = Number(p.day);
    let lo = Date.UTC(y, mo - 1, d, -3, 0, 0);
    let hi = Date.UTC(y, mo - 1, d, 3, 0, 0);
    for (let i = 0; i < 40; i += 1) {
      const mid = Math.floor((lo + hi) / 2);
      const wall = athensParts(new Date(mid));
      const stamp = `${wall.year}-${wall.month}-${wall.day} ${wall.hour}:${wall.minute}`;
      if (stamp >= target) hi = mid;
      else lo = mid + 1;
    }
    return new Date(hi).toISOString();
  }

  function isFromThisEvening(iso) {
    if (!iso) return false;
    return new Date(iso).getTime() >= new Date(eveningStartIso()).getTime();
  }

  function publicize(row) {
    if (!row) return null;
    return {
      id: row.id,
      sender: row.sender,
      display_name: row.display_name,
      guest_number: row.guest_number == null ? null : Number(row.guest_number),
      body: row.body,
      created_at: row.created_at,
      deleted_at: row.deleted_at || null,
    };
  }

  async function getMember(sessionId) {
    const id = String(sessionId || '');
    if (!id) return null;
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_MEMBERS)
      .select('session_id, guest_number, display_name, accepted_guidelines_at, is_muted, created_at')
      .eq('session_id', id)
      .maybeSingle();
    throwIfError(error, 'getMember');
    return data || null;
  }

  async function getOrCreateMember(guestId, tableNumber) {
    const existing = await getMember(guestId);
    if (existing) return existing;

    const sb = getClient();
    const table = Number(tableNumber);
    const row = { session_id: String(guestId) };
    if (Number.isFinite(table) && table > 0) row.table_number = table;

    const { data, error } = await sb
      .from(TABLE_MEMBERS)
      .insert(row)
      .select('session_id, guest_number, display_name, accepted_guidelines_at, is_muted, created_at')
      .single();

    if (error && (error.code === '23505' || /duplicate/i.test(String(error.message || '')))) {
      return getMember(guestId);
    }
    throwIfError(error, 'getOrCreateMember');
    return data;
  }

  async function acceptGuidelines(sessionId) {
    const id = String(sessionId || '');
    if (!id) return null;
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_MEMBERS)
      .update({ accepted_guidelines_at: new Date().toISOString() })
      .eq('session_id', id)
      .select('session_id, guest_number, display_name, accepted_guidelines_at, is_muted, created_at')
      .single();
    throwIfError(error, 'acceptGuidelines');
    return data;
  }

  async function listMessages({ forAdmin = false } = {}) {
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_MESSAGES)
      .select(forAdmin ? ADMIN_COLS : GUEST_COLS)
      .gte('created_at', eveningStartIso())
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    throwIfError(error, 'listMessages');
    const rows = (data || []).slice().reverse();
    return forAdmin ? rows : rows.map(publicize);
  }

  async function sendMessage({ sessionId, tableNumber, sender, body }) {
    const role = sender === 'staff' ? 'staff' : 'guest';
    const text = trimBody(body);
    if (!text) return null;

    if (role === 'guest') {
      const member = await getOrCreateMember(sessionId, tableNumber);
      if (member?.is_muted) {
        const err = new Error('muted');
        err.code = 'muted';
        throw err;
      }
    }

    const sb = getClient();
    const payload = role === 'staff'
      ? { sender: 'staff', body: text, display_name: 'Lechaim' }
      : {
        sender: 'guest',
        body: text,
        session_id: String(sessionId),
        display_name: 'אורח',
        table_number: Number.isFinite(Number(tableNumber)) && Number(tableNumber) > 0
          ? Number(tableNumber)
          : null,
      };

    const { data, error } = await sb
      .from(TABLE_MESSAGES)
      .insert(payload)
      .select(role === 'staff' ? ADMIN_COLS : GUEST_COLS)
      .single();
    throwIfError(error, 'sendMessage');
    return role === 'staff' ? data : publicize(data);
  }

  async function deleteMessage(messageId) {
    const id = String(messageId || '');
    if (!id) return null;
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_MESSAGES)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select(ADMIN_COLS)
      .single();
    throwIfError(error, 'deleteMessage');
    return data;
  }

  async function resetMessages() {
    const sb = getClient();
    const { error } = await sb
      .from(TABLE_MESSAGES)
      .delete()
      .not('id', 'is', null);
    throwIfError(error, 'resetMessages');
    return true;
  }

  function normalizeReactionEmoji(value) {
    const emoji = String(value || '');
    return REACTION_EMOJI_SET.has(emoji) ? emoji : '';
  }

  function isReactionMine(row, viewer) {
    if (!row || !viewer) return false;
    if (viewer.isStaff) return row.sender === 'staff';
    return Boolean(viewer.sessionId && row.session_id && String(row.session_id) === String(viewer.sessionId));
  }

  async function listReactions(messageIds) {
    const ids = (Array.isArray(messageIds) ? messageIds : [])
      .map((id) => String(id || ''))
      .filter(Boolean);
    if (!ids.length) return [];
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_REACTIONS)
      .select('id, message_id, emoji, sender, session_id')
      .in('message_id', ids);
    throwIfError(error, 'listReactions');
    return data || [];
  }

  async function toggleReaction({ messageId, emoji, sender, sessionId }) {
    const id = String(messageId || '');
    const face = normalizeReactionEmoji(emoji);
    const role = sender === 'staff' ? 'staff' : 'guest';
    if (!id || !face) return { ok: false, reason: 'invalid' };

    const sb = getClient();
    let existingQuery = sb
      .from(TABLE_REACTIONS)
      .select('id, message_id, emoji, sender, session_id')
      .eq('message_id', id)
      .eq('emoji', face)
      .limit(1);
    if (role === 'staff') existingQuery = existingQuery.eq('sender', 'staff').is('session_id', null);
    else existingQuery = existingQuery.eq('session_id', String(sessionId || ''));

    const { data: found, error: findError } = await existingQuery.maybeSingle();
    throwIfError(findError, 'toggleReaction lookup');

    if (found?.id) {
      const { error: delError } = await sb
        .from(TABLE_REACTIONS)
        .delete()
        .eq('id', found.id);
      throwIfError(delError, 'toggleReaction delete');
      return { ok: true, removed: true, row: found };
    }

    const payload = role === 'staff'
      ? { message_id: id, emoji: face, sender: 'staff' }
      : { message_id: id, emoji: face, sender: 'guest', session_id: String(sessionId) };

    const { data, error } = await sb
      .from(TABLE_REACTIONS)
      .insert(payload)
      .select('id, message_id, emoji, sender, session_id')
      .single();

    if (error && (error.code === '23505' || /duplicate/i.test(String(error.message || '')))) {
      return { ok: true, removed: false, duplicate: true };
    }
    throwIfError(error, 'toggleReaction insert');
    return { ok: true, removed: false, row: data };
  }

  async function muteMember(sessionId) {
    const id = String(sessionId || '');
    if (!id) return null;
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_MEMBERS)
      .update({ is_muted: true })
      .eq('session_id', id)
      .select('session_id, guest_number, display_name, is_muted, table_number')
      .single();
    throwIfError(error, 'muteMember');
    return data;
  }

  function subscribe(onEvent) {
    if (typeof onEvent !== 'function') {
      return function unsubscribe() {};
    }
    const sb = getClient();
    if (roomChannel) {
      try { sb.removeChannel(roomChannel); } catch (_) { /* ignore */ }
      roomChannel = null;
    }
    roomChannel = sb
      .channel('global-chat-room')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_MESSAGES },
        (payload) => onEvent({ table: TABLE_MESSAGES, ...payload })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_MEMBERS },
        (payload) => onEvent({ table: TABLE_MEMBERS, ...payload })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_REACTIONS },
        (payload) => onEvent({ table: TABLE_REACTIONS, ...payload })
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[LechaimGlobalChat] realtime', status, err || '');
        }
      });

    return function unsubscribe() {
      if (!roomChannel) return;
      try { sb.removeChannel(roomChannel); } catch (err) {
        console.warn('[LechaimGlobalChat] unsubscribe', err);
      }
      roomChannel = null;
    };
  }

  function leaveTyping() {
    if (!typingChannel) return;
    try { getClient().removeChannel(typingChannel); } catch (err) {
      console.warn('[LechaimGlobalChat] typing leave', err);
    }
    typingChannel = null;
  }

  function joinTyping(onEvent) {
    leaveTyping();
    const sb = getClient();
    typingChannel = sb
      .channel('global-chat-typing', {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'typing' }, (msg) => {
        if (typeof onEvent === 'function') onEvent(msg?.payload || {});
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[LechaimGlobalChat] typing realtime', status, err || '');
        }
      });
    return function unsubscribe() {
      leaveTyping();
    };
  }

  function sendTyping(payload) {
    if (!typingChannel) return;
    const src = payload && typeof payload === 'object' ? payload : {};
    const safe = {
      typing: Boolean(src.typing),
      sender: src.sender === 'staff' ? 'staff' : 'guest',
      clientId: src.clientId ? String(src.clientId) : '',
    };
    const n = Number(src.guestNumber);
    if (safe.sender === 'guest' && Number.isFinite(n)) safe.guestNumber = n;
    try {
      typingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: safe,
      });
    } catch (err) {
      console.warn('[LechaimGlobalChat] typing send', err);
    }
  }

  global.LechaimGlobalChat = {
    isConfigured,
    eveningStartIso,
    isFromThisEvening,
    publicize,
    getMember,
    getOrCreateMember,
    acceptGuidelines,
    listMessages,
    sendMessage,
    deleteMessage,
    resetMessages,
    muteMember,
    REACTION_EMOJIS,
    normalizeReactionEmoji,
    isReactionMine,
    listReactions,
    toggleReaction,
    subscribe,
    joinTyping,
    sendTyping,
    leaveTyping,
  };
})(window);
