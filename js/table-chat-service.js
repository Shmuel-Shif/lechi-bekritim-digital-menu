/**
 * LECHAIM — Private dine-in table chat (Supabase I/O)
 * Bound to order_sessions.session_id. Does not create order sessions.
 */
(function (global) {
  'use strict';

  const TABLE_CHATS = 'table_chats';
  const TABLE_MESSAGES = 'table_chat_messages';
  const MAX_BODY = 500;

  let client = null;
  let boardChannel = null;
  const typingChannels = new Map();

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
      throw new Error('[LechaimTableChat] Supabase is not configured');
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

  async function getChatBySession(sessionId) {
    const id = String(sessionId || '');
    if (!id) return null;
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_CHATS)
      .select('*')
      .eq('session_id', id)
      .maybeSingle();
    throwIfError(error, 'getChatBySession');
    return data || null;
  }

  /**
   * Open existing thread or create one for an already-open dine-in session.
   * Never creates an order_sessions row.
   */
  async function getOrCreateChat(sessionId, tableNumber) {
    const id = String(sessionId || '');
    const table = Number(tableNumber);
    if (!id || !Number.isFinite(table)) {
      throw new Error('[LechaimTableChat] sessionId and tableNumber are required');
    }

    const existing = await getChatBySession(id);
    if (existing) return existing;

    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_CHATS)
      .insert({
        session_id: id,
        table_number: table,
      })
      .select('*')
      .single();

    if (error && (error.code === '23505' || /duplicate/i.test(String(error.message || '')))) {
      return getChatBySession(id);
    }
    throwIfError(error, 'getOrCreateChat');
    return data;
  }

  async function listChats() {
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_CHATS)
      .select('id, session_id, table_number, staff_unread_count, guest_unread_count, last_message_at');
    throwIfError(error, 'listChats');
    return data || [];
  }

  async function listMessages(sessionId, limit = 200) {
    const id = String(sessionId || '');
    if (!id) return [];
    const sb = getClient();
    const cap = Math.min(400, Math.max(1, Number(limit) || 200));
    const { data, error } = await sb
      .from(TABLE_MESSAGES)
      .select('id, chat_id, session_id, table_number, sender, body, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true })
      .limit(cap);
    throwIfError(error, 'listMessages');
    return data || [];
  }

  async function sendMessage({ sessionId, tableNumber, sender, body }) {
    const sid = String(sessionId || '');
    const role = sender === 'staff' ? 'staff' : 'guest';
    const text = trimBody(body);
    if (!sid || !text) return null;

    const chat = await getOrCreateChat(sid, tableNumber);
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_MESSAGES)
      .insert({
        chat_id: chat.id,
        session_id: sid,
        table_number: Number(chat.table_number) || Number(tableNumber),
        sender: role,
        body: text,
      })
      .select('*')
      .single();
    throwIfError(error, 'sendMessage');
    return data;
  }

  async function markRead(chatId, role) {
    const id = String(chatId || '');
    if (!id) return null;
    const who = role === 'staff' ? 'staff' : 'guest';
    const patch = who === 'staff'
      ? { staff_unread_count: 0, staff_last_read_at: new Date().toISOString() }
      : { guest_unread_count: 0, guest_last_read_at: new Date().toISOString() };
    const sb = getClient();
    const { data, error } = await sb
      .from(TABLE_CHATS)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    throwIfError(error, 'markRead');
    return data;
  }

  function subscribeSession(sessionId, onEvent) {
    const id = String(sessionId || '');
    if (!id || typeof onEvent !== 'function') {
      return function unsubscribe() {};
    }
    const sb = getClient();
    const channel = sb
      .channel(`table-chat-session:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: TABLE_MESSAGES, filter: `session_id=eq.${id}` },
        (payload) => onEvent({ table: TABLE_MESSAGES, ...payload })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_CHATS, filter: `session_id=eq.${id}` },
        (payload) => onEvent({ table: TABLE_CHATS, ...payload })
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[LechaimTableChat] session realtime', status, err || '');
        }
      });

    return function unsubscribe() {
      try { sb.removeChannel(channel); } catch (err) {
        console.warn('[LechaimTableChat] session unsubscribe', err);
      }
    };
  }

  function subscribeBoard(onEvent) {
    if (typeof onEvent !== 'function') {
      return function unsubscribe() {};
    }
    const sb = getClient();
    if (boardChannel) {
      try { sb.removeChannel(boardChannel); } catch (_) { /* ignore */ }
      boardChannel = null;
    }
    boardChannel = sb
      .channel('table-chats-board')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_CHATS },
        (payload) => onEvent({ table: TABLE_CHATS, ...payload })
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: TABLE_MESSAGES },
        (payload) => onEvent({ table: TABLE_MESSAGES, ...payload })
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[LechaimTableChat] board realtime', status, err || '');
        }
      });

    return function unsubscribe() {
      if (!boardChannel) return;
      try { sb.removeChannel(boardChannel); } catch (err) {
        console.warn('[LechaimTableChat] board unsubscribe', err);
      }
      boardChannel = null;
    };
  }

  function leaveTyping(sessionId) {
    const id = String(sessionId || '');
    const channel = typingChannels.get(id);
    if (!id || !channel) return;
    try { getClient().removeChannel(channel); } catch (err) {
      console.warn('[LechaimTableChat] typing leave', err);
    }
    typingChannels.delete(id);
  }

  function joinTyping(sessionId, onEvent) {
    const id = String(sessionId || '');
    if (!id) return function unsubscribe() {};
    leaveTyping(id);
    const sb = getClient();
    const channel = sb
      .channel(`table-chat-typing:${id}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'typing' }, (msg) => {
        if (typeof onEvent === 'function') onEvent(msg?.payload || {});
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[LechaimTableChat] typing realtime', status, err || '');
        }
      });
    typingChannels.set(id, channel);
    return function unsubscribe() {
      leaveTyping(id);
    };
  }

  function sendTyping(sessionId, payload) {
    const channel = typingChannels.get(String(sessionId || ''));
    if (!channel) return;
    try {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: payload && typeof payload === 'object' ? payload : {},
      });
    } catch (err) {
      console.warn('[LechaimTableChat] typing send', err);
    }
  }

  global.LechaimTableChat = {
    isConfigured,
    getChatBySession,
    getOrCreateChat,
    listChats,
    listMessages,
    sendMessage,
    markRead,
    subscribeSession,
    subscribeBoard,
    joinTyping,
    sendTyping,
    leaveTyping,
  };
})(window);
