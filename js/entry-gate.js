/**
 * LECHAIM — Entry gate (Stage 1 + Stage 2 session resume)
 * Home welcome → order type → table (dine-in only).
 * Persists dine-in table session via LechaimOrderSession (localStorage).
 */
(function () {
  'use strict';

  const Session = window.LechaimOrderSession;
  const TABLE_MIN = Session?.TABLE_MIN || 60;
  const TABLE_MAX = Session?.TABLE_MAX || 73;

  const COPY = {
    en: {
      welcome: 'Welcome',
      title: 'Lechaim Restaurant in Crete',
      kosher: 'Mehadrin Kosher',
      promptOrder: 'How would you like to order?',
      promptTable: 'Choose your table',
      dineIn: 'Dine In',
      takeAway: 'Take Away',
      delivery: 'Delivery',
      back: 'Back',
      comingSoon: 'Coming Soon',
      langAria: 'Switch language – Hebrew / English',
    },
    he: {
      welcome: 'ברוכים הבאים',
      title: 'מסעדת לחיים בכרתים',
      kosher: 'כשר למהדרין',
      promptOrder: 'איך תרצו להזמין?',
      promptTable: 'בחרו מספר שולחן',
      dineIn: 'ישיבה במקום',
      takeAway: 'באים לקחת',
      delivery: 'משלוח',
      back: 'חזרה',
      comingSoon: 'Coming Soon',
      langAria: 'החלפת שפה – עברית / English',
    },
  };

  const gate = document.getElementById('entry-gate');
  if (!gate) return;

  const stepOrder = document.getElementById('entry-step-order');
  const stepTable = document.getElementById('entry-step-table');
  const tablesEl = document.getElementById('entry-tables');
  const noticeEl = document.getElementById('entry-notice');
  const promptEl = document.getElementById('entry-prompt');
  const welcomeEl = document.getElementById('entry-hero-welcome');
  const titleEl = document.getElementById('entry-hero-title');
  const kosherEl = document.getElementById('entry-hero-kosher');
  const langToggle = document.getElementById('entry-lang-toggle');
  const tableBackBtn = stepTable?.querySelector('[data-entry-back]');

  const state = {
    orderType: null, // 'dine-in' | 'takeaway'
    lang: 'he',
    tableNumber: null,
  };

  let noticeTimer = null;
  let started = false;
  let changingTable = false;

  function t(key) {
    return (COPY[state.lang] || COPY.en)[key] || key;
  }

  function applyDocumentDir() {
    const dir = state.lang === 'he' ? 'rtl' : 'ltr';
    const shell = document.getElementById('entry-shell');
    if (shell) shell.dir = dir;
  }

  function updateLangToggleUI() {
    langToggle?.querySelectorAll('[data-lang]').forEach((opt) => {
      opt.classList.toggle('lang-toggle__option--active', opt.dataset.lang === state.lang);
    });
    if (langToggle) langToggle.setAttribute('aria-label', t('langAria'));
  }

  function applyEntryCopy() {
    if (welcomeEl) welcomeEl.textContent = t('welcome');
    if (titleEl) titleEl.textContent = t('title');
    if (kosherEl) kosherEl.textContent = t('kosher');

    gate.querySelectorAll('[data-entry-i18n]').forEach((el) => {
      const key = el.getAttribute('data-entry-i18n');
      if (key && COPY.en[key] != null) el.textContent = t(key);
    });

    if (promptEl) {
      const onTable = stepTable && !stepTable.hidden;
      promptEl.textContent = onTable ? t('promptTable') : t('promptOrder');
    }

    if (tableBackBtn) tableBackBtn.textContent = t('back');

    updateLangToggleUI();
    applyDocumentDir();
  }

  function showStep(step) {
    [stepOrder, stepTable].forEach((el) => {
      if (!el) return;
      el.hidden = el !== step;
    });
    applyEntryCopy();
  }

  function showNotice(message) {
    if (!noticeEl) return;
    noticeEl.hidden = false;
    noticeEl.textContent = message;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      noticeEl.hidden = true;
      noticeEl.textContent = '';
    }, 2600);
  }

  function buildTables() {
    if (!tablesEl || tablesEl.childElementCount) return;

    const fragment = document.createDocumentFragment();
    for (let n = TABLE_MIN; n <= TABLE_MAX; n += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'entry-gate__table';
      btn.dataset.table = String(n);
      btn.textContent = String(n);
      btn.setAttribute('aria-label', `Table ${n}`);
      fragment.appendChild(btn);
    }
    tablesEl.appendChild(fragment);
  }

  function highlightSelectedTable(tableNumber) {
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.toggle('is-selected', Number(btn.dataset.table) === tableNumber);
    });
  }

  function openGate() {
    document.body.classList.add('entry-pending');
    gate.hidden = false;
    gate.setAttribute('aria-hidden', 'false');
  }

  function closeGate() {
    document.body.classList.remove('entry-pending');
    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');
    changingTable = false;
  }

  function buildMenuContext(extra = {}) {
    const fromSession = Session?.toMenuContext?.({ lang: state.lang }) || {};
    const orderType = extra.orderType != null
      ? extra.orderType
      : (state.orderType || fromSession.orderType || null);
    const isTakeaway = orderType === 'takeaway';

    return {
      orderType,
      tableNumber: isTakeaway
        ? null
        : (extra.tableNumber !== undefined
          ? extra.tableNumber
          : (state.tableNumber != null ? state.tableNumber : fromSession.tableNumber)),
      lang: extra.lang || state.lang || fromSession.lang || null,
      sessionId: isTakeaway ? (fromSession.sessionId || null) : (fromSession.sessionId || null),
      openedAt: fromSession.openedAt || null,
      status: fromSession.status || null,
    };
  }

  function enterMenu(context) {
    window.LechaimOrderContext = context;
    closeGate();

    if (!started) {
      started = true;
      if (typeof window.LechaimMenu?.start === 'function') {
        window.LechaimMenu.start(context);
      } else {
        console.error('[entry-gate] LechaimMenu.start is missing');
      }
      return;
    }

    if (typeof window.LechaimMenu?.updateOrderContext === 'function') {
      window.LechaimMenu.updateOrderContext(context);
    }
  }

  function setLang(lang) {
    if (lang !== 'he' && lang !== 'en') return;
    state.lang = lang;
    Session?.setLang?.(lang);
    applyEntryCopy();
  }

  function goToOrderType() {
    state.orderType = null;
    state.tableNumber = null;
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.remove('is-selected');
    });
    if (tableBackBtn) tableBackBtn.dataset.entryBack = 'order';
    showStep(stepOrder);
  }

  function goToTable() {
    buildTables();
    highlightSelectedTable(state.tableNumber);
    if (tableBackBtn) tableBackBtn.dataset.entryBack = 'order';
    showStep(stepTable);
    applyEntryCopy();
  }

  function finishWithTable(table) {
    state.orderType = 'dine-in';
    state.tableNumber = table;
    highlightSelectedTable(table);

    if (Session) {
      if (changingTable || Session.hasActiveDineInSession()) {
        Session.updateTable(table, { lang: state.lang });
      } else {
        Session.startDineIn(table, { lang: state.lang });
      }
    }

    enterMenu(buildMenuContext({
      orderType: 'dine-in',
      tableNumber: table,
      lang: state.lang,
    }));
  }

  function finishTakeaway() {
    state.orderType = 'takeaway';
    state.tableNumber = null;
    changingTable = false;
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.remove('is-selected');
    });

    if (Session) {
      Session.startTakeaway({ lang: state.lang });
    }

    enterMenu({
      orderType: 'takeaway',
      tableNumber: null,
      lang: state.lang,
      sessionId: Session?.getSession?.()?.sessionId || null,
      openedAt: Session?.getSession?.()?.openedAt || null,
      status: Session?.getSession?.()?.status || null,
    });
  }

  function reopenTablePicker() {
    const order = window.LechaimOrderEngine?.getOrder?.();
    const locked = Boolean(order?.items?.some((item) => item && Number(item.qty) > 0));
    if (locked) {
      if (typeof window.LechaimMenu?.notifyTableLocked === 'function') {
        window.LechaimMenu.notifyTableLocked();
      }
      return false;
    }

    const ctx = window.LechaimOrderContext || Session?.toMenuContext?.() || {};
    if (ctx.orderType !== 'dine-in') return false;

    changingTable = true;
    started = true;
    state.orderType = 'dine-in';
    state.lang = ctx.lang || state.lang || 'he';
    state.tableNumber = ctx.tableNumber != null ? Number(ctx.tableNumber) : null;

    openGate();
    goToTable();
    return true;
  }

  function reopenOrderTypePicker() {
    const ctx = window.LechaimOrderContext || Session?.toMenuContext?.() || {};
    started = true;
    changingTable = false;
    state.lang = ctx.lang || state.lang || 'he';
    state.orderType = null;
    state.tableNumber = null;

    setLang(state.lang);
    openGate();
    goToOrderType();
    return true;
  }

  function tryResumeSession() {
    if (!Session?.hasActiveDineInSession()) return false;

    const session = Session.getSession();
    if (!session) return false;

    state.orderType = 'dine-in';
    state.tableNumber = session.tableNumber;
    if (session.lang === 'he' || session.lang === 'en') {
      state.lang = session.lang;
    }

    setLang(state.lang);
    enterMenu(buildMenuContext({
      orderType: 'dine-in',
      tableNumber: session.tableNumber,
      lang: state.lang,
    }));
    return true;
  }

  langToggle?.addEventListener('click', (event) => {
    const picked = event.target.closest('[data-lang]')?.dataset.lang;
    const next = picked === 'he' || picked === 'en'
      ? picked
      : (state.lang === 'he' ? 'en' : 'he');
    setLang(next);
  });

  gate.addEventListener('click', (event) => {
    if (event.target.closest('#entry-lang-toggle')) return;

    const orderBtn = event.target.closest('[data-order-type]');
    if (orderBtn) {
      const type = orderBtn.dataset.orderType;
      if (type === 'delivery') {
        showNotice(t('comingSoon'));
        return;
      }
      if (type === 'dine-in') {
        state.orderType = 'dine-in';
        /* Existing active table → skip picker and resume */
        if (!changingTable && Session?.hasActiveDineInSession()) {
          const session = Session.getSession();
          state.tableNumber = session.tableNumber;
          Session.setLang?.(state.lang);
          enterMenu(buildMenuContext({
            orderType: 'dine-in',
            tableNumber: session.tableNumber,
            lang: state.lang,
          }));
          return;
        }
        goToTable();
        return;
      }
      if (type === 'takeaway') {
        state.orderType = 'takeaway';
        finishTakeaway();
      }
      return;
    }

    const tableBtn = event.target.closest('[data-table]');
    if (tableBtn && stepTable && !stepTable.hidden) {
      const table = Number(tableBtn.dataset.table);
      if (!Number.isInteger(table) || table < TABLE_MIN || table > TABLE_MAX) return;
      finishWithTable(table);
      return;
    }

    const backBtn = event.target.closest('[data-entry-back]');
    if (backBtn) goToOrderType();
  });

  window.LechaimEntryGate = {
    reopenTablePicker,
    reopenOrderTypePicker,
  };

  document.body.classList.add('entry-pending');
  gate.hidden = false;
  gate.setAttribute('aria-hidden', 'false');

  if (tryResumeSession()) return;

  setLang('he');
  goToOrderType();
})();
