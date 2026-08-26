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
      labelHe: 'אש',
      bannerHe: 'המטבח צריך אש',
      section: 'urgent',
      urgent: true,
    },
    gas: {
      id: 'gas',
      labelHe: 'גז',
      bannerHe: 'המטבח צריך גז',
      section: 'urgent',
      urgent: true,
    },
    out_of_stock: {
      id: 'out_of_stock',
      labelHe: 'נגמר מלאי',
      bannerHe: 'נגמר במלאי',
      section: 'stock',
      urgent: false,
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
      section: 'urgent',
      urgent: true,
    },
    fault: {
      id: 'fault',
      labelHe: 'תקלה',
      bannerHe: 'תקלה במטבח',
      section: 'fault',
      urgent: true,
    },
    no_orders: {
      id: 'no_orders',
      labelHe: 'אין הזמנות / בונים',
      bannerHe: 'אין הזמנות / בונים',
      section: 'pace',
      urgent: false,
    },
    building: {
      id: 'building',
      labelHe: 'אין הזמנות / בונים',
      bannerHe: 'אין הזמנות / בונים',
      section: 'pace',
      urgent: false,
    },
    pace: {
      id: 'pace',
      labelHe: 'אין הזמנות / בונים',
      bannerHe: 'אין הזמנות / בונים',
      section: 'pace',
      urgent: false,
    },
  };

  let client = null;
  let channel = null;

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

  function subscribe(onChange) {
    const sb = getClient();
    if (!sb || typeof onChange !== 'function') return () => {};
    if (channel) {
      sb.removeChannel(channel);
      channel = null;
    }
    channel = sb
      .channel(CHANNEL)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE },
        (payload) => {
          onChange(payload);
        }
      )
      .subscribe();
    return () => {
      if (channel) {
        sb.removeChannel(channel);
        channel = null;
      }
    };
  }

  global.LechaimKitchenAlerts = {
    TYPES,
    typeMeta,
    isUrgent,
    getClient,
    insertAlert,
    listOpen,
    acknowledge,
    subscribe,
  };
})(window);
