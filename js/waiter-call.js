/**
 * LECHAIM — Dine-in call-waiter FAB (next to the help-bot robot).
 * Independent of till / print / close. Writes waiter_called on the open session.
 */
(function () {
  'use strict';

  const NEED_IDS = ['water', 'cutlery', 'napkin', 'other'];
  const NEED_EMOJI = {
    water: '💧',
    cutlery: '🍴',
    napkin: '🧻',
    other: '❔',
  };

  const FALLBACK = {
    waiterCallFab: 'קרא למלצר',
    waiterCallTitle: 'במה אפשר לעזור?',
    waiterCallHint: 'לחצו על מה שצריך — נשלח למלצר.',
    waiterCallSent: 'המלצר בדרך',
    waiterCallFail: 'לא ניתן לקרוא למלצר',
    waiterNeedWater: 'מים',
    waiterNeedCutlery: 'סכום',
    waiterNeedNapkin: 'מפיות',
    waiterNeedOther: 'כללי / אחר',
    helpBotClose: 'סגור',
  };

  let fab = null;
  let panel = null;
  let open = false;
  let sending = false;
  let trapRelease = null;
  let langObserver = null;
  let bodyObserver = null;

  function lang() {
    const html = String(document.documentElement.lang || '').slice(0, 2);
    if (html === 'he' || html === 'en' || html === 'el') return html;
    const ctx = window.LechaimOrderContext?.lang;
    if (ctx === 'he' || ctx === 'en' || ctx === 'el') return ctx;
    return 'he';
  }

  function t(key) {
    const L = lang();
    const dict = window.TRANSLATIONS;
    return dict?.[L]?.[key] || dict?.he?.[key] || FALLBACK[key] || key;
  }

  function isStaffPage() {
    return document.body?.getAttribute('data-staff-order') === '1';
  }

  function isDineInWithTable() {
    if (isStaffPage()) return false;
    if (document.body.classList.contains('entry-pending')) return false;
    const ctx = window.LechaimOrderContext || {};
    if (ctx.browseOnly) return false;
    const type = String(ctx.orderType || '').toLowerCase();
    const dineIn = type === 'dine-in' || type === 'dinein' || type === 'dine_in';
    if (!dineIn) return false;
    const table = Number(ctx.tableNumber);
    return Number.isFinite(table) && table > 0;
  }

  function needLabel(id) {
    if (id === 'water') return t('waiterNeedWater');
    if (id === 'cutlery') return t('waiterNeedCutlery');
    if (id === 'napkin') return t('waiterNeedNapkin');
    return t('waiterNeedOther');
  }

  function ensureDom() {
    if (fab) return;

    fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'lechaim-waiter-call-fab';
    fab.className = 'waiter-call-fab';
    fab.hidden = true;
    fab.innerHTML = '<span class="waiter-call-fab__icon" aria-hidden="true">🛎️</span>';

    panel = document.createElement('div');
    panel.id = 'lechaim-waiter-call-panel';
    panel.className = 'waiter-call-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="waiter-call-panel__card" role="dialog" aria-modal="true" aria-labelledby="lechaim-waiter-call-title">
        <header class="waiter-call-panel__header">
          <h2 class="waiter-call-panel__title" id="lechaim-waiter-call-title"></h2>
          <button type="button" class="waiter-call-panel__close" id="lechaim-waiter-call-close" aria-label="סגור">×</button>
        </header>
        <p class="waiter-call-panel__hint" id="lechaim-waiter-call-hint"></p>
        <div class="waiter-call-panel__options" id="lechaim-waiter-call-options"></div>
        <p class="waiter-call-panel__status" id="lechaim-waiter-call-status" hidden></p>
      </div>
    `;

    document.body.append(fab, panel);

    fab.addEventListener('click', () => {
      if (open) closePanel();
      else openPanel();
    });
    panel.querySelector('#lechaim-waiter-call-close')?.addEventListener('click', closePanel);
    panel.querySelector('#lechaim-waiter-call-options')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-waiter-need]');
      if (!btn) return;
      void submitCall(btn.getAttribute('data-waiter-need'));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) closePanel();
    });
  }

  function renderOptions() {
    const wrap = panel?.querySelector('#lechaim-waiter-call-options');
    if (!wrap) return;
    wrap.innerHTML = NEED_IDS.map((id) => (
      `<button type="button" class="waiter-call-option" data-waiter-need="${id}">` +
        `<span class="waiter-call-option__icon" aria-hidden="true">${NEED_EMOJI[id] || ''}</span>` +
        `<span class="waiter-call-option__label">${needLabel(id)}</span>` +
      '</button>'
    )).join('');
  }

  function applyCopy() {
    if (!fab || !panel) return;
    fab.setAttribute('aria-label', t('waiterCallFab'));
    fab.title = t('waiterCallFab');
    const title = panel.querySelector('#lechaim-waiter-call-title');
    const hint = panel.querySelector('#lechaim-waiter-call-hint');
    const closeBtn = panel.querySelector('#lechaim-waiter-call-close');
    if (title) title.textContent = t('waiterCallTitle');
    if (hint) hint.textContent = t('waiterCallHint');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('helpBotClose'));
    renderOptions();
  }

  function setStatus(message, isError) {
    const el = panel?.querySelector('#lechaim-waiter-call-status');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
  }

  function applyVisibility() {
    ensureDom();
    const show = isDineInWithTable();
    if (fab) fab.hidden = !show;
    document.body.classList.toggle('waiter-fab-on', show);
    if (!show && open) closePanel();
  }

  function openPanel() {
    if (!isDineInWithTable()) return;
    ensureDom();
    applyCopy();
    setStatus('');
    panel.hidden = false;
    fab.classList.add('is-open');
    open = true;
    if (typeof trapRelease === 'function') trapRelease();
    const release = window.LechaimFocusTrap?.activate?.(panel);
    trapRelease = typeof release === 'function' ? release : null;
    panel.querySelector('[data-waiter-need]')?.focus();
  }

  function closePanel() {
    if (typeof trapRelease === 'function') trapRelease();
    trapRelease = null;
    open = false;
    if (panel) panel.hidden = true;
    fab?.classList.remove('is-open');
  }

  async function submitCall(needId) {
    if (sending) return;
    if (!NEED_IDS.includes(needId)) return;

    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.()) {
      setStatus(t('waiterCallFail'), true);
      return;
    }

    sending = true;
    panel?.querySelectorAll('[data-waiter-need]').forEach((btn) => {
      btn.disabled = true;
    });
    setStatus('');

    try {
      const sessionId = await window.LechaimMenu?.ensureDineInRemoteSession?.();
      if (!sessionId) {
        setStatus(t('waiterCallFail'), true);
        return;
      }
      if (typeof api.setWaiterCall === 'function') {
        await api.setWaiterCall(sessionId, [needId], true);
      } else {
        await api.updateSessionStatus(sessionId, {
          waiterCalled: true,
          waiterNeed: [needId],
        });
      }
      setStatus(t('waiterCallSent'), false);
      window.setTimeout(() => closePanel(), 800);
    } catch (err) {
      console.warn('[waiter-call] failed', err);
      setStatus(t('waiterCallFail'), true);
    } finally {
      sending = false;
      panel?.querySelectorAll('[data-waiter-need]').forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  function boot() {
    if (isStaffPage()) return;
    ensureDom();
    applyCopy();
    applyVisibility();

    langObserver = new MutationObserver(() => applyCopy());
    langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    bodyObserver = new MutationObserver(() => applyVisibility());
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('lechaim:dinein-session-ready', applyVisibility);
    window.addEventListener('lechaim:dinein-table-ready', applyVisibility);
    window.setTimeout(applyVisibility, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
