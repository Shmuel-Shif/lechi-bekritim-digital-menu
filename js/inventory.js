/**
 * LECHAIM — Inventory + menu overrides (Supabase)
 *
 * Catalog source of truth: MENU_DATA + HOT_SIDE_ITEMS (never duplicated).
 * Availability: table `inventory` (product_id, available)
 * Content overrides: table `menu_overrides` (product_id, name, description, price, image)
 *
 * Future hooks are stubbed for: add/delete dish, reorder, promos, tags, hours, i18n.
 */
(function (global) {
  'use strict';

  const TABLE_INVENTORY = 'inventory';
  const TABLE_OVERRIDES = 'menu_overrides';
  const COL_PRODUCT_ID = 'product_id';
  const COL_AVAILABLE = 'available';

  const availability = new Map();
  const overrides = new Map();
  const listeners = new Set();

  let client = null;
  let channelInventory = null;
  let channelOverrides = null;
  let loadPromise = null;
  let loaded = false;
  let overridesEnabled = true;

  function getConfig() {
    return global.LECHAIM_SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    const { url, anonKey } = getConfig();
    return Boolean(url && anonKey && global.supabase?.createClient);
  }

  function getClient() {
    if (client) return client;
    if (!isConfigured()) return null;

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

  function notify(payload) {
    listeners.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error('[inventory] listener error', err);
      }
    });
  }

  function notifyProduct(productId, change) {
    notify({
      productId: productId ? String(productId) : null,
      change: change || 'availability',
    });
  }

  function readAvailableFlag(row) {
    if (!row) return true;
    if (Object.prototype.hasOwnProperty.call(row, COL_AVAILABLE)) {
      return row[COL_AVAILABLE] !== false;
    }
    return true;
  }

  function applyAvailabilityRow(row) {
    if (!row || row[COL_PRODUCT_ID] == null) return null;
    const id = String(row[COL_PRODUCT_ID]);
    const available = readAvailableFlag(row);
    const prev = availability.has(id) ? availability.get(id) : null;
    availability.set(id, available);
    return prev === available ? null : id;
  }

  function normalizeOverride(row) {
    if (!row || row[COL_PRODUCT_ID] == null) return null;
    return {
      product_id: String(row[COL_PRODUCT_ID]),
      name: row.name == null || row.name === '' ? null : String(row.name),
      description: row.description == null ? null : String(row.description),
      price: row.price == null || row.price === '' ? null : Number(row.price),
      image: row.image == null || row.image === '' ? null : String(row.image),
    };
  }

  function applyOverrideRow(row) {
    const normalized = normalizeOverride(row);
    if (!normalized) return null;
    overrides.set(normalized.product_id, normalized);
    return normalized.product_id;
  }

  function isAvailable(productId) {
    if (productId == null) return true;
    const id = String(productId);
    if (!availability.has(id)) return true;
    return availability.get(id) !== false;
  }

  function getOverride(productId) {
    if (productId == null) return null;
    return overrides.get(String(productId)) || null;
  }

  /**
   * Merge MENU_DATA item with optional Supabase override.
   */
  function resolveItem(item) {
    if (!item) return item;
    const override = getOverride(item.id);
    if (!override) return { ...item };

    return {
      ...item,
      name: override.name != null ? override.name : item.name,
      description: override.description != null ? override.description : (item.description || ''),
      price: override.price != null && !Number.isNaN(override.price) ? override.price : item.price,
      image: override.image != null ? override.image : (item.image || ''),
    };
  }

  function getCategoryTitle(titleKey, fallback) {
    const translations = global.TRANSLATIONS;
    if (!titleKey || !translations) return fallback || titleKey || '';
    const parts = String(titleKey).split('.');
    let value = translations.he;
    parts.forEach((key) => {
      value = value?.[key];
    });
    return value || fallback || titleKey;
  }

  function diagnoseMenuGlobals() {
    const report = {
      'js/menu-data.js': typeof global.MENU_DATA !== 'undefined',
      MENU_DATA: Boolean(global.MENU_DATA),
      'MENU_DATA.categories': Array.isArray(global.MENU_DATA?.categories),
      HOT_SIDE_ITEMS: Array.isArray(global.HOT_SIDE_ITEMS),
      TRANSLATIONS: Boolean(global.TRANSLATIONS),
    };
    return report;
  }

  /**
   * Catalog from MENU_DATA + HOT_SIDE_ITEMS only (resolved with overrides).
   * Same source as the public menu — never a separate product list.
   */
  function getCatalog() {
    const items = [];
    const seen = new Set();
    const menuData = global.MENU_DATA;
    const hotSides = global.HOT_SIDE_ITEMS;

    if (!menuData || !Array.isArray(menuData.categories)) {
      const report = diagnoseMenuGlobals();
      console.error(
        '[inventory] getCatalog() empty: MENU_DATA missing. Script load report:',
        report,
        '\nEnsure admin.html loads js/menu-data.js BEFORE js/inventory.js and js/admin.js'
      );
      return items;
    }

    function pushItem(item, categoryId, categoryTitleKey) {
      if (!item?.id || seen.has(item.id)) return;
      seen.add(item.id);
      const resolved = resolveItem(item);
      items.push({
        id: resolved.id,
        name: resolved.name,
        description: resolved.description || '',
        price: resolved.price,
        image: resolved.image || '',
        categoryId,
        categoryTitleKey,
        categoryTitle: getCategoryTitle(categoryTitleKey, categoryId),
        available: isAvailable(resolved.id),
        base: {
          name: item.name,
          description: item.description || '',
          price: item.price,
          image: item.image || '',
        },
      });
    }

    menuData.categories.forEach((cat) => {
      (cat.items || []).forEach((item) => pushItem(item, cat.id, cat.titleKey));
      (cat.subsections || []).forEach((sub) => {
        (sub.items || []).forEach((item) => pushItem(item, cat.id, cat.titleKey));
      });
    });

    (Array.isArray(hotSides) ? hotSides : []).forEach((item) => {
      pushItem(item, 'hotSides', 'categories.hotSides');
    });

    if (!items.length) {
      console.error('[inventory] getCatalog() produced 0 items despite MENU_DATA present', {
        categories: menuData.categories.length,
        hotSides: Array.isArray(hotSides) ? hotSides.length : 0,
      });
    } else {
      console.log('[inventory] getCatalog()', items.length, 'products from MENU_DATA + HOT_SIDE_ITEMS');
    }

    return items;
  }

  function getStats(catalog) {
    const list = catalog || getCatalog();
    let availableCount = 0;
    let unavailableCount = 0;
    list.forEach((item) => {
      if (isAvailable(item.id)) availableCount += 1;
      else unavailableCount += 1;
    });
    return {
      total: list.length,
      available: availableCount,
      unavailable: unavailableCount,
    };
  }

  async function fetchAvailability() {
    const sb = getClient();
    if (!sb) return;

    const { data, error } = await sb
      .from(TABLE_INVENTORY)
      .select(`${COL_PRODUCT_ID}, ${COL_AVAILABLE}`);

    if (error) throw error;

    availability.clear();
    (data || []).forEach((row) => applyAvailabilityRow(row));
  }

  async function fetchOverrides() {
    const sb = getClient();
    if (!sb) return;

    const { data, error } = await sb
      .from(TABLE_OVERRIDES)
      .select('product_id, name, description, price, image');

    if (error) {
      /* Table may not exist yet — availability still works */
      console.warn('[inventory] menu_overrides unavailable:', error.message);
      overridesEnabled = false;
      overrides.clear();
      return;
    }

    overridesEnabled = true;
    overrides.clear();
    (data || []).forEach((row) => applyOverrideRow(row));
  }

  const realtimeStatus = {
    inventory: 'IDLE',
    menu_overrides: 'IDLE',
  };

  function formatSupabaseError(error, context) {
    const parts = [];
    if (context) parts.push(`Context: ${context}`);
    if (!error) {
      parts.push('Unknown error (empty error object)');
      return parts.join('\n');
    }

    if (typeof error === 'string') {
      parts.push(error);
      return parts.join('\n');
    }

    if (error.code) parts.push(`code: ${error.code}`);
    if (error.message) parts.push(`message: ${error.message}`);
    if (error.details) parts.push(`details: ${error.details}`);
    if (error.hint) parts.push(`hint: ${error.hint}`);
    if (error.status) parts.push(`status: ${error.status}`);
    if (error.statusText) parts.push(`statusText: ${error.statusText}`);

    try {
      parts.push(`raw: ${JSON.stringify(error)}`);
    } catch {
      parts.push(`raw: ${String(error)}`);
    }

    return parts.join('\n');
  }

  function throwSupabaseError(error, context) {
    const full = formatSupabaseError(error, context);
    console.error('[inventory]', full, error);
    throw new Error(full);
  }

  async function syncRealtimeAuth(session) {
    const sb = getClient();
    if (!sb) return;
    try {
      const token = session?.access_token || null;
      await sb.realtime.setAuth(token);
      console.log('[inventory] realtime auth synced', Boolean(token));
    } catch (err) {
      console.error('[inventory] realtime setAuth failed', formatSupabaseError(err, 'realtime.setAuth'));
    }
  }

  function bindChannel(channelName, table, onPayload) {
    const sb = getClient();
    if (!sb) return null;

    const channel = sb
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          console.log(`[inventory] realtime event:${table}`, payload.eventType, payload.new || payload.old);
          onPayload(payload);
        }
      )
      .subscribe((status, err) => {
        realtimeStatus[table] = status;
        console.log(`[inventory] realtime:${table} → ${status}`, err || '');
        if (err) {
          console.error(`[inventory] realtime:${table} error`, formatSupabaseError(err, `subscribe:${table}`));
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[inventory] Realtime NOT connected for ${table}. Run supabase-realtime-setup.sql`);
        }
        if (status === 'SUBSCRIBED') {
          console.log(`[inventory] Realtime CONNECTED for ${table}`);
        }
      });

    return channel;
  }

  function ensureRealtime() {
    const sb = getClient();
    if (!sb) return;

    if (!channelInventory) {
      channelInventory = bindChannel(
        'lechaim-inventory',
        TABLE_INVENTORY,
        (payload) => {
          if (payload.eventType === 'DELETE' && payload.old?.[COL_PRODUCT_ID] != null) {
            const id = String(payload.old[COL_PRODUCT_ID]);
            availability.delete(id);
            notifyProduct(id, 'availability');
            return;
          }
          const changedId = applyAvailabilityRow(payload.new || payload.old);
          if (changedId) notifyProduct(changedId, 'availability');
        }
      );
    }

    if (!channelOverrides && overridesEnabled) {
      channelOverrides = bindChannel(
        'lechaim-menu-overrides',
        TABLE_OVERRIDES,
        (payload) => {
          if (payload.eventType === 'DELETE' && payload.old?.[COL_PRODUCT_ID] != null) {
            const id = String(payload.old[COL_PRODUCT_ID]);
            overrides.delete(id);
            notifyProduct(id, 'content');
            return;
          }
          const changedId = applyOverrideRow(payload.new || payload.old);
          if (changedId) notifyProduct(changedId, 'content');
        }
      );
    }
  }

  function load() {
    if (!isConfigured()) {
      loaded = true;
      return Promise.resolve({ ok: false, reason: 'not-configured' });
    }

    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      await fetchAvailability();
      await fetchOverrides();
      ensureRealtime();
      loaded = true;
      return { ok: true, overridesEnabled };
    })().catch((err) => {
      loadPromise = null;
      console.error('[inventory] load failed', err);
      throw err;
    });

    return loadPromise;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  async function setAvailable(productId, available) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase is not configured');

    const sessionRes = await sb.auth.getSession();
    if (sessionRes.error) throwSupabaseError(sessionRes.error, 'auth.getSession before inventory upsert');
    const session = sessionRes.data?.session;
    if (!session) throw new Error('No active session. Sign in again before updating inventory.');
    await syncRealtimeAuth(session);

    const id = String(productId);
    const value = available !== false;

    const upsertRes = await sb.from(TABLE_INVENTORY).upsert(
      { [COL_PRODUCT_ID]: id, [COL_AVAILABLE]: value },
      { onConflict: COL_PRODUCT_ID }
    );

    if (upsertRes.error) {
      throwSupabaseError(upsertRes.error, `inventory.upsert product_id=${id} available=${value}`);
    }

    /* Proof SELECT — do not trust upsert alone */
    const selectRes = await sb
      .from(TABLE_INVENTORY)
      .select(`${COL_PRODUCT_ID}, ${COL_AVAILABLE}`)
      .eq(COL_PRODUCT_ID, id)
      .maybeSingle();

    if (selectRes.error) {
      throwSupabaseError(selectRes.error, `inventory.select after upsert product_id=${id}`);
    }

    if (!selectRes.data) {
      throw new Error(
        `inventory SELECT after upsert returned no row for product_id=${id}. ` +
        `Upsert may have been blocked by RLS. Check policies for authenticated INSERT/UPDATE.`
      );
    }

    const saved = readAvailableFlag(selectRes.data);
    if (saved !== value) {
      throw new Error(
        `inventory proof mismatch for product_id=${id}. ` +
        `Expected available=${value}, SELECT returned ${JSON.stringify(selectRes.data)}`
      );
    }

    availability.set(id, saved);
    notifyProduct(id, 'availability');
    console.log('[inventory] PROOF inventory row saved', selectRes.data);
    return saved;
  }

  async function saveContent(productId, fields) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase is not configured');
    if (!overridesEnabled) {
      throw new Error(
        'menu_overrides table is not available. ' +
        'Run supabase-realtime-setup.sql (or supabase-menu-overrides.sql), then hard-refresh admin.html'
      );
    }

    const sessionRes = await sb.auth.getSession();
    if (sessionRes.error) throwSupabaseError(sessionRes.error, 'auth.getSession before menu_overrides upsert');
    const session = sessionRes.data?.session;
    if (!session) throw new Error('No active session. Sign in again before saving content.');
    await syncRealtimeAuth(session);

    const id = String(productId);
    const payload = {
      product_id: id,
      name: fields.name == null ? null : String(fields.name).trim(),
      description: fields.description == null ? null : String(fields.description),
      price: fields.price == null || fields.price === '' ? null : Number(fields.price),
      image: fields.image == null || fields.image === '' ? null : String(fields.image),
      updated_at: new Date().toISOString(),
    };

    if (payload.price != null && Number.isNaN(payload.price)) {
      throw new Error(`Invalid price value: ${JSON.stringify(fields.price)}`);
    }

    const upsertRes = await sb.from(TABLE_OVERRIDES).upsert(payload, {
      onConflict: COL_PRODUCT_ID,
    });

    if (upsertRes.error) {
      throwSupabaseError(upsertRes.error, `menu_overrides.upsert product_id=${id}`);
    }

    /* Proof SELECT — do not trust upsert alone */
    const selectRes = await sb
      .from(TABLE_OVERRIDES)
      .select('product_id, name, description, price, image, updated_at')
      .eq('product_id', id)
      .maybeSingle();

    if (selectRes.error) {
      throwSupabaseError(selectRes.error, `menu_overrides.select after upsert product_id=${id}`);
    }

    if (!selectRes.data) {
      throw new Error(
        `menu_overrides SELECT after upsert returned no row for product_id=${id}. ` +
        `Upsert may have been blocked by RLS. Check policies for authenticated INSERT/UPDATE.`
      );
    }

    applyOverrideRow(selectRes.data);
    notifyProduct(id, 'content');
    console.log('[inventory] PROOF menu_overrides row saved', selectRes.data);
    return getOverride(id);
  }

  /* ---------- Future API surface (stubs) ---------- */
  async function addProduct() {
    throw new Error('הוספת מנה חדשה תתווסף אחרי מעבר התפריט ל-Supabase');
  }

  async function deleteProduct() {
    throw new Error('מחיקת מנה תתווסף אחרי מעבר התפריט ל-Supabase');
  }

  async function reorderCategories() {
    throw new Error('סידור קטגוריות עדיין לא זמין');
  }

  async function reorderProducts() {
    throw new Error('סידור מנות עדיין לא זמין');
  }

  async function setPromo() {
    throw new Error('מבצעים עדיין לא זמינים');
  }

  async function setTags() {
    throw new Error('תגיות עדיין לא זמינות');
  }

  async function setAvailabilityHours() {
    throw new Error('זמינות לפי שעות עדיין לא זמינה');
  }

  async function setLocalizedContent() {
    throw new Error('עריכת תרגומים ממסך הניהול תתווסף בהמשך');
  }

  async function getSession() {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (data.session) await syncRealtimeAuth(data.session);
    return data.session || null;
  }

  async function signIn(email, password) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase is not configured');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.session) await syncRealtimeAuth(data.session);
    return data;
  }

  async function signOut() {
    const sb = getClient();
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    await syncRealtimeAuth(null);
  }

  function onAuthStateChange(callback) {
    const sb = getClient();
    if (!sb) return { data: { subscription: { unsubscribe() {} } } };
    return sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        await syncRealtimeAuth(session);
      }
      if (event === 'SIGNED_OUT') {
        await syncRealtimeAuth(null);
      }
      callback(event, session);
    });
  }

  global.LechaimInventory = {
    isConfigured,
    getClient,
    getCatalog,
    getStats,
    isAvailable,
    getAvailabilityMap: () => {
      const out = {};
      availability.forEach((value, key) => {
        out[key] = value;
      });
      return out;
    },
    getOverride,
    resolveItem,
    load,
    subscribe,
    setAvailable,
    saveContent,
    areOverridesEnabled: () => overridesEnabled,
    /* Future */
    addProduct,
    deleteProduct,
    reorderCategories,
    reorderProducts,
    setPromo,
    setTags,
    setAvailabilityHours,
    setLocalizedContent,
    getSession,
    signIn,
    signOut,
    onAuthStateChange,
    isLoaded: () => loaded,
    getRealtimeStatus: () => ({ ...realtimeStatus }),
    diagnoseMenuGlobals,
  };
})(window);
