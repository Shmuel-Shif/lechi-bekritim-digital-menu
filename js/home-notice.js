/**
 * LECHAIM — Home page notice modal (index.html), driven by restaurant_flags.
 * flag_key: home_page_notice
 * flag_value: enabled
 * flag_text: JSON { title, body, version }
 */
(function (global) {
  'use strict';

  const FLAG_KEY = 'home_page_notice';
  const SEEN_KEY = 'lechaim-home-notice-seen';

  function getClient() {
    return global.LechaimInventory?.getClient?.()
      || global.LechaimSupabaseOrders?.getClient?.()
      || null;
  }

  function parsePayload(flagValue, flagText) {
    let data = { title: '', body: '', version: '' };
    try {
      const raw = flagText == null ? '' : String(flagText).trim();
      if (raw) data = { ...data, ...JSON.parse(raw) };
    } catch (_) { /* ignore */ }
    return {
      enabled: Boolean(flagValue),
      title: String(data.title || '').trim(),
      body: String(data.body || '').trim(),
      version: String(data.version || '').trim() || String(Date.now()),
    };
  }

  async function loadNotice() {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from('restaurant_flags')
      .select('flag_value, flag_text')
      .eq('flag_key', FLAG_KEY)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { enabled: false, title: '', body: '', version: '' };
    return parsePayload(data.flag_value, data.flag_text);
  }

  async function saveNotice(payload) {
    const sb = getClient();
    if (!sb) throw new Error('לא מחובר');
    const { data: authData } = await sb.auth.getSession();
    if (!authData?.session) throw new Error('יש להתחבר לאדמין');
    const title = String(payload?.title || '').trim();
    const body = String(payload?.body || '').trim();
    const enabled = Boolean(payload?.enabled);
    const version = String(payload?.version || Date.now());
    const { error } = await sb.from('restaurant_flags').upsert({
      flag_key: FLAG_KEY,
      flag_value: enabled,
      flag_text: JSON.stringify({ title, body, version }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'flag_key' });
    if (error) throw error;
    return { enabled, title, body, version };
  }

  function wasSeen(version) {
    try {
      return sessionStorage.getItem(SEEN_KEY) === String(version);
    } catch (_) {
      return false;
    }
  }

  function markSeen(version) {
    try {
      sessionStorage.setItem(SEEN_KEY, String(version));
    } catch (_) { /* private mode */ }
  }

  function fillBody(bodyEl, text) {
    if (!bodyEl) return;
    bodyEl.replaceChildren();
    const lines = String(text || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return;
    lines.forEach((line) => {
      const p = document.createElement('p');
      p.className = 'home-notice__p';
      p.textContent = line;
      bodyEl.appendChild(p);
    });
  }

  function ensureCustomerModal() {
    let root = document.getElementById('home-notice-modal');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'home-notice-modal';
    root.className = 'home-notice';
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <button type="button" class="home-notice__backdrop" data-home-notice-close aria-label="סגור"></button>
      <div class="home-notice__panel" role="dialog" aria-modal="true" aria-labelledby="home-notice-title">
        <button type="button" class="home-notice__close" data-home-notice-close aria-label="סגור">×</button>
        <div class="home-notice__head">
          <h2 class="home-notice__title" id="home-notice-title"></h2>
        </div>
        <div class="home-notice__scroll">
          <div class="home-notice__body" id="home-notice-body"></div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    root.addEventListener('click', (event) => {
      if (!event.target.closest('[data-home-notice-close]')) return;
      closeCustomerModal();
    });
    return root;
  }

  let focusRelease = null;
  let activeVersion = '';

  function closeCustomerModal() {
    const root = document.getElementById('home-notice-modal');
    if (!root) return;
    if (typeof focusRelease === 'function') focusRelease();
    focusRelease = null;
    if (activeVersion) markSeen(activeVersion);
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('home-notice-open');
  }

  function openCustomerModal(notice) {
    const root = ensureCustomerModal();
    const titleEl = document.getElementById('home-notice-title');
    const bodyEl = document.getElementById('home-notice-body');
    activeVersion = notice.version;
    if (titleEl) titleEl.textContent = notice.title || 'הודעה';
    fillBody(bodyEl, notice.body || '');
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('home-notice-open');
    if (typeof focusRelease === 'function') focusRelease();
    focusRelease = global.LechaimFocusTrap?.activate?.(root) || null;
  }

  async function maybeShowOnHome() {
    try {
      const notice = await loadNotice();
      if (!notice?.enabled || !notice.body) return;
      if (wasSeen(notice.version)) return;
      openCustomerModal(notice);
    } catch (err) {
      console.warn('[home-notice] show', err);
    }
  }

  global.LechaimHomeNotice = {
    FLAG_KEY,
    loadNotice,
    saveNotice,
    maybeShowOnHome,
    closeCustomerModal,
  };

  function isCustomerHomePage() {
    if (document.getElementById('admin-tabs')) return false;
    if (/admin\.html/i.test(location.pathname || '')) return false;
    return Boolean(document.getElementById('entry-gate'));
  }

  function bootCustomerNotice() {
    if (!isCustomerHomePage()) return;
    // Wait a tick so Supabase clients finish init from deferred scripts.
    window.setTimeout(() => {
      maybeShowOnHome();
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootCustomerNotice);
  } else {
    bootCustomerNotice();
  }
})(window);
