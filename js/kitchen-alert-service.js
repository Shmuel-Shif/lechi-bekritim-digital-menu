/**
 * LECHAIM — Kitchen tablet alerts (shared by kitchen.html + admin)
 * Does not touch till / print / table close / prices.
 */
(function (global) {
  'use strict';

  const TABLE = 'kitchen_alerts';
  const CHANNEL = 'lechaim-kitchen-alerts';

  /**
   * Registry — add a type here later (ice, help, …) without schema change.
   * Kitchen page and admin both read this.
   */
  const TYPES = {
    fire: {
      id: 'fire',
      labelHe: 'צריך אש',
      bannerHe: 'המטבח צריך אש',
      section: 'urgent',
      urgent: true,
    },
    gas: {
      id: 'gas',
      labelHe: 'צריך גז',
      bannerHe: 'המטבח צריך גז',
      section: 'ops',
      urgent: false,
    },
    out_of_stock: {
      id: 'out_of_stock',
      labelHe: 'נגמר מלאי',
      bannerHe: 'נגמר במלאי',
      section: 'urgent',
      urgent: true,
    },
    message: {
      id: 'message',
      labelHe: 'כללי',
      bannerHe: 'כללי מהמטבח',
      section: 'message',
      urgent: false,
    },
    close_kitchen: {
      id: 'close_kitchen',
      labelHe: 'סגירת מטבח',
      bannerHe: 'המטבח מבקש לסגור',
      section: 'ops',
      urgent: false,
    },
    fault: {
      id: 'fault',
      labelHe: 'תקלה',
      bannerHe: 'תקלה במטבח',
      section: 'fault',
      urgent: true,
    },
  };

  let client = null;
  const channels = {};
  const CHAT_TABLE = 'kitchen_chat';
  const CHAT_CHANNEL = 'lechaim-kitchen-chat';

  function getConfig() {
    return global.LECHAIM_SUPABASE_CONFIG || {};
  }

  function getClient() {
    if (client) return client;
    const { url, anonKey } = getConfig();
    if (!url || !anonKey || !global.supabase?.createClient) return null;
    const inventoryClient = global.LechaimInventory?.getClient?.();
    if (inventoryClient) {
      client = inventoryClient;
      return client;
    }
    client = global.supabase.createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  function typeMeta(type) {
    return TYPES[String(type || '')] || {
      id: String(type || ''),
      labelHe: String(type || ''),
      bannerHe: String(type || ''),
      section: 'message',
      urgent: false,
    };
  }

  function isUrgent(type) {
    return Boolean(typeMeta(type).urgent);
  }

  async function insertAlert(payload) {
    const sb = getClient();
    if (!sb) throw new Error('אין חיבור');
    const type = String(payload?.type || '').trim();
    if (!type) throw new Error('חסר סוג התראה');

    const row = {
      alert_type: type,
      status: 'open',
      source: payload?.source || 'kitchen_tablet',
      product_id: payload?.productId ? String(payload.productId) : null,
      product_name: payload?.productName ? String(payload.productName).slice(0, 120) : null,
      message: payload?.message ? String(payload.message).trim().slice(0, 500) : null,
    };

    const { data, error } = await sb.from(TABLE).insert(row).select('id, created_at').single();
    if (error) throw error;
    return data;
  }

  async function listOpen() {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from(TABLE)
      .select('id, alert_type, product_id, product_name, message, status, source, created_at, acknowledged_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    return data || [];
  }

  async function listByIds(ids) {
    const sb = getClient();
    const list = (ids || []).map((id) => String(id || '').trim()).filter(Boolean).slice(0, 40);
    if (!sb || !list.length) return [];
    const { data, error } = await sb
      .from(TABLE)
      .select('id, alert_type, product_id, product_name, message, status, acknowledged_at')
      .in('id', list);
    if (error) throw error;
    return data || [];
  }

  async function acknowledge(id) {
    const sb = getClient();
    if (!sb) throw new Error('אין חיבור');
    const { error } = await sb
      .from(TABLE)
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'open');
    if (error) throw error;
  }

  const CHAT_SELECT = 'id, sender, body, body_he, body_el, alert_id, alert_type, canned_id, extra, created_at';
  const CHAT_SELECT_BASIC = 'id, sender, body, alert_id, alert_type, canned_id, extra, created_at';
  const translateCache = {};

  function looksHebrew(text) {
    return /[\u0590-\u05FF]/.test(String(text || ''));
  }

  function looksGreek(text) {
    return /[\u0370-\u03FF\u1F00-\u1FFF]/.test(String(text || ''));
  }

  function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(() => window.clearTimeout(timer));
  }

  async function translateOnce(text, from, to) {
    const q = String(text || '').trim().slice(0, 500);
    if (!q || from === to) return q;
    const cacheKey = `${from}|${to}|${q}`;
    if (translateCache[cacheKey]) return translateCache[cacheKey];

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(q)}`;
      const res = await fetchWithTimeout(url, 2800);
      if (res.ok) {
        const data = await res.json();
        const out = (data?.[0] || []).map((part) => part?.[0] || '').join('').trim();
        if (out) {
          translateCache[cacheKey] = out.slice(0, 500);
          return translateCache[cacheKey];
        }
      }
    } catch (_) { /* try fallback */ }

    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`;
      const res = await fetchWithTimeout(url, 2800);
      if (res.ok) {
        const data = await res.json();
        const out = String(data?.responseData?.translatedText || '').trim();
        if (out && !/INVALID LANGUAGE|MYMEMORY WARNING/i.test(out)) {
          translateCache[cacheKey] = out.slice(0, 500);
          return translateCache[cacheKey];
        }
      }
    } catch (_) { /* keep original */ }

    return q;
  }

  async function pairChatBodies(text, sender) {
    const body = String(text || '').trim().slice(0, 500);
    if (!body) return { body: '', bodyHe: '', bodyEl: '' };
    const hebrew = looksHebrew(body);
    const greek = looksGreek(body);
    if (hebrew && !greek) {
      return { body, bodyHe: body, bodyEl: await translateOnce(body, 'he', 'el') };
    }
    if (greek && !hebrew) {
      return { body, bodyEl: body, bodyHe: await translateOnce(body, 'el', 'he') };
    }
    if (sender === 'admin') {
      return { body, bodyHe: body, bodyEl: await translateOnce(body, 'he', 'el') };
    }
    return { body, bodyEl: body, bodyHe: await translateOnce(body, 'el', 'he') };
  }

  function chatTextFor(row, locale) {
    if (locale === 'he') return String(row?.body_he || row?.bodyHe || row?.body || '');
    return String(row?.body_el || row?.bodyEl || row?.body || '');
  }

  async function insertChat(payload) {
    const sb = getClient();
    if (!sb) throw new Error('אין חיבור');
    const sender = payload?.sender === 'admin' ? 'admin' : 'kitchen';
    const body = String(payload?.body || '').trim().slice(0, 500);
    if (!body) throw new Error('חסרה הודעה');
    const row = {
      sender,
      body,
      alert_id: payload?.alertId ? String(payload.alertId) : null,
      alert_type: payload?.alertType ? String(payload.alertType).slice(0, 40) : null,
      canned_id: payload?.cannedId ? String(payload.cannedId).slice(0, 40) : null,
      extra: payload?.extra ? String(payload.extra).slice(0, 120) : null,
    };
    if (payload?.bodyHe) row.body_he = String(payload.bodyHe).slice(0, 500);
    if (payload?.bodyEl) row.body_el = String(payload.bodyEl).slice(0, 500);

    let { data, error } = await sb.from(CHAT_TABLE).insert(row).select(CHAT_SELECT).single();
    if (error && (row.body_he || row.body_el)) {
      delete row.body_he;
      delete row.body_el;
      ({ data, error } = await sb.from(CHAT_TABLE).insert(row).select(CHAT_SELECT_BASIC).single());
    }
    if (error) throw error;
    return data;
  }

  async function listChat() {
    const sb = getClient();
    if (!sb) return [];
    let { data, error } = await sb
      .from(CHAT_TABLE)
      .select(CHAT_SELECT)
      .order('created_at', { ascending: true })
      .limit(80);
    if (error) {
      ({ data, error } = await sb
        .from(CHAT_TABLE)
        .select(CHAT_SELECT_BASIC)
        .order('created_at', { ascending: true })
        .limit(80));
    }
    if (error) throw error;
    return data || [];
  }

  async function clearChat() {
    const sb = getClient();
    if (!sb) throw new Error('אין חיבור');
    const { error } = await sb
      .from(CHAT_TABLE)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
  }

  function listen(tableName, channelName, onChange) {
    const sb = getClient();
    if (!sb || typeof onChange !== 'function') return () => {};
    if (channels[channelName]) {
      sb.removeChannel(channels[channelName]);
      delete channels[channelName];
    }
    channels[channelName] = sb
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload) => {
          onChange(payload);
        }
      )
      .subscribe();
    return () => {
      if (channels[channelName]) {
        sb.removeChannel(channels[channelName]);
        delete channels[channelName];
      }
    };
  }

  function subscribe(onChange, channelName) {
    return listen(TABLE, channelName || CHANNEL, onChange);
  }

  function subscribeChat(onChange) {
    return listen(CHAT_TABLE, CHAT_CHANNEL, onChange);
  }

  global.LechaimKitchenAlerts = {
    TYPES,
    typeMeta,
    isUrgent,
    getClient,
    insertAlert,
    listOpen,
    listByIds,
    acknowledge,
    insertChat,
    listChat,
    clearChat,
    pairChatBodies,
    chatTextFor,
    subscribe,
    subscribeChat,
  };
})(window);
