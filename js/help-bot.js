/**
 * LECHAIM — Customer help bot (prepared answers only).
 * Independent of orders and Supabase. Staff contact uses WhatsApp / phone.
 */
(function () {
  'use strict';

  const ROBOT_SRC = 'assets/images/help-bot/robot.webp';
  const TABLE_GUIDE_SRC = 'assets/images/help-bot/how-to-find-table.webp';
  const MAPS_HREF = 'https://maps.app.goo.gl/vMejA76qL8hCLQkF7?g_st=ac';

  const TOPICS = [
    { id: 'order', emoji: '🍽️', labelKey: 'helpBotTopicOrder' },
    { id: 'table', emoji: '🪑', labelKey: 'helpBotTopicTable' },
    { id: 'hours', emoji: '🕐', labelKey: 'helpBotTopicHours' },
    { id: 'location', emoji: '📍', labelKey: 'helpBotTopicLocation' },
    { id: 'around', emoji: '🚶', labelKey: 'helpBotTopicAround' },
    { id: 'delivery', emoji: '🚚', labelKey: 'helpBotTopicDelivery' },
    { id: 'pickup', emoji: '🛍️', labelKey: 'helpBotTopicPickup' },
    { id: 'butcher', emoji: '🥩', labelKey: 'helpBotTopicButcher' },
    { id: 'shabbat', emoji: '🕯️', labelKey: 'helpBotTopicShabbat' },
    { id: 'baby', emoji: '👶', labelKey: 'helpBotTopicBaby' },
    { id: 'pay', emoji: '💳', labelKey: 'helpBotTopicPay' },
    { id: 'veg', emoji: '🥗', labelKey: 'helpBotTopicVeg' },
    { id: 'gluten', emoji: '🌾', labelKey: 'helpBotTopicGluten' },
    { id: 'problem', emoji: '🧾', labelKey: 'helpBotTopicProblem' },
    { id: 'staff', emoji: '💬', labelKey: 'helpBotTopicStaff' },
  ];

  const TOPICS_HOME = ['delivery', 'pickup', 'butcher', 'shabbat', 'hours', 'location', 'around', 'baby', 'pay', 'veg', 'gluten', 'problem', 'staff'];
  const TOPICS_DINE_IN = ['order', 'table', 'hours', 'location', 'around', 'delivery', 'pickup', 'butcher', 'shabbat', 'baby', 'pay', 'veg', 'gluten', 'problem', 'staff'];

  const RELATED = {
    order: ['table', 'staff'],
    table: ['order', 'hours'],
    hours: ['order', 'shabbat', 'location', 'delivery'],
    location: ['hours', 'around'],
    around: ['location', 'hours'],
    delivery: ['pickup', 'pay'],
    pickup: ['delivery', 'pay'],
    butcher: ['pickup', 'shabbat'],
    shabbat: ['hours', 'pickup'],
    baby: ['hours', 'pay'],
    pay: ['delivery', 'pickup'],
    veg: ['gluten', 'order'],
    gluten: ['veg', 'staff'],
    problem: ['staff', 'order'],
    staff: ['problem', 'table', 'order', 'hours'],
  };

  const FALLBACK = {
    helpBotFabLabel: 'היי, איך אפשר לעזור?',
    helpBotTitle: 'היי, איך אפשר לעזור?',
    helpBotWelcomeTitle: 'היי! אני העוזר של לחיים 👋',
    helpBotWelcomeBody: 'איך אפשר לעזור לכם היום?',
    helpBotRelated: 'אולי תרצו לדעת גם:',
    helpBotClose: 'סגור',
    helpBotBack: 'חזרה לנושאים',
    helpBotTopicOrder: 'איך מזמינים?',
    helpBotTopicTable: 'איזה שולחן אני?',
    helpBotTopicHours: 'מה שעות הפעילות?',
    helpBotTopicLocation: 'איפה אתם נמצאים?',
    helpBotTopicAround: 'מה בסביבה שלנו',
    aroundUsHint: 'הכל במרחק הליכה באנליפסי',
    helpBotTopicDelivery: 'יש משלוחים?',
    helpBotTopicPickup: 'איך עושים איסוף עצמי?',
    helpBotTopicButcher: 'חנות הבשר',
    helpBotTopicShabbat: 'הזמנות לשבת',
    helpBotTopicBaby: 'יש כיסאות תינוק?',
    helpBotTopicPay: 'איך אפשר לשלם?',
    helpBotTopicVeg: 'יש מנות צמחוניות?',
    helpBotTopicGluten: 'יש מנות ללא גלוטן?',
    helpBotTopicProblem: 'יש לי בעיה עם ההזמנה',
    helpBotTopicStaff: 'לדבר עם נציג',
    helpBotAnswerOrder: 'מוסיפים לסל המוצרים מנות שאתם אוהבים, עוברים על הסל שהכל נכון ולא שכחתם שום דבר, לוחצים שלח הזמנה והמסעדה מיד מתחילה לעבוד על ההזמנה שלכם.\n\nרק נציג אחד מהשולחן יבצע את ההזמנה דרך המערכת.',
    helpBotAnswerHours: '{days} · {hours}\nשישי–שבת סגור.',
    helpBotAnswerLocation: 'Analipsi 700 14, Greece',
    helpBotAnswerDelivery: 'עלות המשלוח היא €10 · זמן משלוח 30–45 דקות · מינימום הזמנה €100 (לא כולל משלוח)',
    helpBotAnswerPickup: 'הזמינו ואספו מהמסעדה.\n\nניתן לבצע הזמנות לאיסוף עצמי בימי א - ה בין השעות 14:00 - 21:00.\n\nלשליחת ההזמנה נדרשים פרטי לקוח ומועד.',
    helpBotAnswerButcher: 'חנות הבשר של לחיים\nבשר חלק כשר למהדרין • שחיטת ליובאוויטש • כשרות מהודרת\n\nאצלנו תוכלו להזמין מגוון נתחי בשר ועוף איכותיים, טריים וכשרים למהדרין.\n\nכל המוצרים נבחרים בקפידה ומסופקים תחת סטנדרטים גבוהים של איכות וכשרות.\n\nשימו לב: כל המוצרים קפואים. ניתן לסמן וי אם ברצונכם מופשר.',
    helpBotAnswerShabbat: 'הזמנות לשבת\nתפריט מיוחד לשבת קודש\n\nאיסוף ביום שישי בשעה 14:00',
    helpBotAnswerBaby: 'כן, יש לנו כיסאות תינוק.',
    helpBotAnswerPay: '🚚 משלוח — מזומן בלבד.\n🛍️ איסוף עצמי — אשראי או מזומן.\n🪑 ישיבה במקום — אשראי או מזומן.',
    helpBotAnswerVeg: 'כן, יש לנו מנות צמחוניות.',
    helpBotAnswerGluten: 'יש לנו מנות ללא גלוטן, אך המסעדה אינה יכולה לקחת אחריות על נוכחות או מגע של גלוטן.',
    helpBotTableYouAre: 'אתם נמצאים בשולחן {n}',
    helpBotTableHowTitle: 'איך בוחרים שולחן?',
    helpBotTableHowBody: 'הסתכלו על המספר שמופיע על השולחן שלכם ובחרו את אותו מספר במסך בחירת השולחן.',
    helpBotTablePick: 'בחירת שולחן',
    helpBotTableImageAlt: 'מספר השולחן נמצא על השולחן.',
    helpBotStaffNeedTable: 'כדי לדבר עם נציג, קודם צריך לבחור שולחן.',
    helpBotStaffHow: 'איך תרצו לדבר איתנו?',
    helpBotStaffWhatsApp: 'WhatsApp',
    helpBotStaffCall: 'התקשרו אלינו',
    hoursDays: 'א׳ – ה׳',
    address: 'כתובת',
    addressText: 'Analipsi 700 14, Greece',
    footerAriaMaps: 'פתחו מיקום ב-Google Maps',
  };

  let fab = null;
  let panel = null;
  let topicsEl = null;
  let welcomeEl = null;
  let answerEl = null;
  let open = false;
  let view = 'topics';
  let currentTopicId = null;
  let trapRelease = null;
  let langObserver = null;

  function lang() {
    const fromToggle = document.querySelector('#entry-lang-toggle .lang-toggle__option--active, .lang-toggle .lang-toggle__option--active')?.dataset?.lang;
    if (fromToggle === 'he' || fromToggle === 'en') return fromToggle;
    const html = String(document.documentElement.lang || '').slice(0, 2);
    if (html === 'he' || html === 'en') return html;
    const ctx = window.LechaimOrderContext?.lang;
    if (ctx === 'he' || ctx === 'en') return ctx;
    const session = window.LechaimOrderSession?.getSession?.()?.lang;
    if (session === 'he' || session === 'en') return session;
    return 'he';
  }

  function t(key) {
    try {
      const overlay = window.LechaimAppSettings?.copy?.(key, lang());
      if (overlay) return overlay;
    } catch (_) { /* keep fallbacks */ }
    return window.TRANSLATIONS?.[lang()]?.[key]
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

  function currentTableNumber() {
    const ctx = window.LechaimOrderContext || {};
    const session = window.LechaimOrderSession?.getSession?.() || {};
    const type = String(ctx.orderType || session.orderType || '').toLowerCase();
    const dineIn = type === 'dine-in' || type === 'dinein' || type === 'dine_in';
    if (!dineIn || ctx.browseOnly) return null;
    const table = Number(ctx.tableNumber != null ? ctx.tableNumber : session.tableNumber);
    return Number.isFinite(table) && table > 0 ? table : null;
  }

  function isDineInPage() {
    const gate = document.getElementById('entry-gate');
    if (gate?.dataset?.mode === 'dine-in-only') return true;
    return String(location.pathname || '').toLowerCase().includes('dine-in');
  }

  function isDineInBot() {
    if (isDineInPage()) return true;
    const ctx = window.LechaimOrderContext || {};
    const session = window.LechaimOrderSession?.getSession?.() || {};
    const type = String(ctx.orderType || session.orderType || '').toLowerCase();
    const dineIn = type === 'dine-in' || type === 'dinein' || type === 'dine_in';
    return dineIn && !ctx.browseOnly && currentTableNumber() != null;
  }

  function visibleTopicIds() {
    return isDineInBot() ? TOPICS_DINE_IN : TOPICS_HOME;
  }

  function visibleTopics() {
    const allowed = new Set(visibleTopicIds());
    return TOPICS.filter((topic) => allowed.has(topic.id));
  }

  function hoursAnswer() {
    return window.LechaimAppSettings?.hoursSummary?.(lang())
      || window.LechaimOpeningHours?.hoursSummaryLabel?.(lang())
      || t('helpBotAnswerHours');
  }

  function locationAnswer() {
    return t('helpBotAnswerLocation') || t('addressText');
  }

  function existingContactLink(kind) {
    if (kind === 'whatsapp') {
      return document.querySelector(
        'a.entry-gate__foot-link--whatsapp[href], a.site-footer__link--whatsapp[href]'
      );
    }
    return document.querySelector(
      'a.entry-gate__foot-link--phone[href^="tel:"], a.site-footer__link--phone[href^="tel:"]'
    );
  }

  function contactActionsHtml() {
    const parts = [];
    if (existingContactLink('whatsapp')?.getAttribute('href')) {
      parts.push(
        `<button type="button" class="help-bot-answer__action" data-help-contact="whatsapp">` +
          `📱 ${escapeHtml(t('helpBotStaffWhatsApp'))}` +
        '</button>'
      );
    }
    if (existingContactLink('phone')?.getAttribute('href')) {
      parts.push(
        `<button type="button" class="help-bot-answer__action" data-help-contact="phone">` +
          `📞 ${escapeHtml(t('helpBotStaffCall'))}` +
        '</button>'
      );
    }
    return parts.join('');
  }

  function ensureDom() {
    if (fab) return;

    fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'lechaim-help-bot-fab';
    fab.className = 'help-bot-fab';
    fab.innerHTML = `
      <img class="help-bot-fab__avatar" src="${ROBOT_SRC}" alt="" width="40" height="40">
      <span class="help-bot-fab__label"></span>
    `;

    panel = document.createElement('div');
    panel.id = 'lechaim-help-bot-panel';
    panel.className = 'help-bot-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="help-bot-panel__card" role="dialog" aria-modal="true" aria-labelledby="lechaim-help-bot-title">
        <header class="help-bot-panel__header">
          <img class="help-bot-panel__avatar" src="${ROBOT_SRC}" alt="" width="48" height="48">
          <h2 class="help-bot-panel__title" id="lechaim-help-bot-title"></h2>
          <button type="button" class="help-bot-panel__close" id="lechaim-help-bot-close" aria-label="סגור">×</button>
        </header>
        <div class="help-bot-panel__body">
          <div class="help-bot-welcome" id="lechaim-help-bot-welcome">
            <p class="help-bot-welcome__title"></p>
            <p class="help-bot-welcome__body"></p>
          </div>
          <div class="help-bot-topics" id="lechaim-help-bot-topics"></div>
          <div class="help-bot-answer" id="lechaim-help-bot-answer" hidden></div>
        </div>
      </div>
    `;

    document.body.append(fab, panel);
    welcomeEl = panel.querySelector('#lechaim-help-bot-welcome');
    topicsEl = panel.querySelector('#lechaim-help-bot-topics');
    answerEl = panel.querySelector('#lechaim-help-bot-answer');

    fab.addEventListener('click', () => {
      if (open) closePanel();
      else openPanel();
    });
    panel.querySelector('#lechaim-help-bot-close')?.addEventListener('click', closePanel);
    topicsEl?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-help-topic]');
      if (!btn) return;
      showTopic(btn.getAttribute('data-help-topic'));
    });
    answerEl?.addEventListener('click', (event) => {
      const related = event.target.closest('[data-help-topic]');
      if (related) {
        showTopic(related.getAttribute('data-help-topic'));
        return;
      }
      const back = event.target.closest('[data-help-back]');
      if (back) {
        showTopics();
        return;
      }
      const pick = event.target.closest('[data-help-pick-table]');
      if (pick) goToExistingTablePicker();
      const contact = event.target.closest('[data-help-contact]');
      if (contact) openExistingContact(contact.getAttribute('data-help-contact'));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        closePanel();
      }
    });

    langObserver = new MutationObserver(() => applyCopy());
    langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.lang-toggle')) return;
      window.setTimeout(applyCopy, 0);
    });
    applyCopy();
  }

  function applyCopy() {
    if (!fab || !panel) return;
    const label = fab.querySelector('.help-bot-fab__label');
    if (label) label.textContent = t('helpBotFabLabel');
    fab.setAttribute('aria-label', t('helpBotFabLabel'));
    const title = panel.querySelector('#lechaim-help-bot-title');
    if (title) title.textContent = t('helpBotTitle');
    const closeBtn = panel.querySelector('#lechaim-help-bot-close');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('helpBotClose'));
    const welcomeTitle = welcomeEl?.querySelector('.help-bot-welcome__title');
    const welcomeBody = welcomeEl?.querySelector('.help-bot-welcome__body');
    if (welcomeTitle) welcomeTitle.textContent = t('helpBotWelcomeTitle');
    if (welcomeBody) welcomeBody.textContent = t('helpBotWelcomeBody');
    if (view === 'topics') renderTopics();
    else if (view === 'answer' && currentTopicId && visibleTopicIds().includes(currentTopicId)) {
      if ((currentTopicId === 'staff' || currentTopicId === 'problem') && currentTableNumber() != null) return;
      showTopic(currentTopicId);
    } else {
      showTopics();
    }
  }

  function scrollPanelTop() {
    panel?.querySelector('.help-bot-panel__body')?.scrollTo?.(0, 0);
  }

  function renderTopics() {
    if (!topicsEl) return;
    if (welcomeEl) welcomeEl.hidden = false;
    topicsEl.hidden = false;
    if (answerEl) answerEl.hidden = true;
    topicsEl.innerHTML = visibleTopics().map((topic) => (
      `<button type="button" class="help-bot-topic" data-help-topic="${topic.id}">` +
        `${topic.emoji} ${escapeHtml(t(topic.labelKey))}` +
      '</button>'
    )).join('');
    scrollPanelTop();
  }

  function relatedHtml(topicId) {
    const allowed = new Set(visibleTopicIds());
    const ids = (RELATED[topicId] || []).filter((id) => allowed.has(id) && id !== topicId).slice(0, 2);
    if (!ids.length) return '';
    const buttons = ids.map((id) => {
      const topic = TOPICS.find((row) => row.id === id);
      if (!topic) return '';
      return `<button type="button" class="help-bot-related__btn" data-help-topic="${topic.id}">` +
        `${topic.emoji} ${escapeHtml(t(topic.labelKey))}` +
      '</button>';
    }).join('');
    return `
      <div class="help-bot-related">
        <p class="help-bot-related__label">${escapeHtml(t('helpBotRelated'))}</p>
        <div class="help-bot-related__list">${buttons}</div>
      </div>
    `;
  }

  function renderAnswer({ topicId, title, body, image, maps, actionLabel, extraHtml, related }) {
    if (!topicsEl || !answerEl) return;
    if (welcomeEl) welcomeEl.hidden = true;
    topicsEl.hidden = true;
    answerEl.hidden = false;
    const imageHtml = image
      ? `<img class="help-bot-answer__image" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" width="640" height="640">`
      : '';
    const mapsHtml = maps
      ? `<a class="help-bot-answer__maps" href="${escapeHtml(MAPS_HREF)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('footerAriaMaps'))}</a>`
      : '';
    const actionHtml = actionLabel
      ? `<button type="button" class="help-bot-answer__action" data-help-pick-table>🪑 ${escapeHtml(actionLabel)}</button>`
      : '';
    answerEl.innerHTML = `
      <h3 class="help-bot-answer__title">${escapeHtml(title)}</h3>
      ${body ? `<p class="help-bot-answer__body">${escapeHtml(body)}</p>` : ''}
      ${imageHtml}
      ${mapsHtml}
      ${actionHtml}
      ${extraHtml || ''}
      ${related === false ? '' : relatedHtml(topicId)}
      <button type="button" class="help-bot-back" data-help-back>${escapeHtml(t('helpBotBack'))}</button>
    `;
    scrollPanelTop();
  }

  function showTopics() {
    view = 'topics';
    currentTopicId = null;
    renderTopics();
  }

  function showTopic(id) {
    if (!visibleTopicIds().includes(id)) {
      showTopics();
      return;
    }
    if (id === 'around') {
      view = 'answer';
      currentTopicId = id;
      renderAnswer({
        topicId: id,
        title: `🚶 ${t('helpBotTopicAround')}`,
        body: t('aroundUsHint'),
        extraHtml: window.LechaimAroundUs?.placesListHtml?.() || '',
      });
      return;
    }

    if (id === 'problem' || id === 'staff') {
      showStaffTopic(id);
      return;
    }

    if (id === 'table') {
      const table = currentTableNumber();
      view = 'answer';
      currentTopicId = id;
      if (table != null) {
        renderAnswer({
          topicId: id,
          title: `🪑 ${t('helpBotTableYouAre').replace('{n}', String(table))}`,
        });
        return;
      }
      renderAnswer({
        topicId: id,
        title: `🪑 ${t('helpBotTableHowTitle')}`,
        body: t('helpBotTableHowBody'),
        image: { src: TABLE_GUIDE_SRC, alt: t('helpBotTableImageAlt') },
        actionLabel: t('helpBotTablePick'),
      });
      return;
    }

    const answers = {
      order: { title: `🍽️ ${t('helpBotTopicOrder')}`, body: t('helpBotAnswerOrder') },
      hours: { title: `🕐 ${t('helpBotTopicHours')}`, body: hoursAnswer() },
      location: { title: `📍 ${t('helpBotTopicLocation')}`, body: locationAnswer(), maps: true },
      delivery: { title: `🚚 ${t('helpBotTopicDelivery')}`, body: t('helpBotAnswerDelivery') },
      pickup: { title: `🛍️ ${t('helpBotTopicPickup')}`, body: t('helpBotAnswerPickup') },
      butcher: { title: `🥩 ${t('helpBotTopicButcher')}`, body: t('helpBotAnswerButcher') },
      shabbat: { title: `🕯️ ${t('helpBotTopicShabbat')}`, body: t('helpBotAnswerShabbat') },
      baby: { title: `👶 ${t('helpBotTopicBaby')}`, body: t('helpBotAnswerBaby') },
      pay: { title: `💳 ${t('helpBotTopicPay')}`, body: t('helpBotAnswerPay') },
      veg: { title: `🥗 ${t('helpBotTopicVeg')}`, body: t('helpBotAnswerVeg') },
      gluten: { title: `🌾 ${t('helpBotTopicGluten')}`, body: t('helpBotAnswerGluten') },
    };
    const answer = answers[id];
    if (!answer) return;
    view = 'answer';
    currentTopicId = id;
    renderAnswer({ topicId: id, ...answer });
  }

  function showStaffTopic(id) {
    view = 'answer';
    currentTopicId = id;
    renderAnswer({
      topicId: id,
      title: `💬 ${t('helpBotStaffHow')}`,
      extraHtml: contactActionsHtml(),
      related: false,
    });
  }

  function openExistingContact(kind) {
    const href = existingContactLink(kind)?.getAttribute('href');
    if (!href) return;
    closePanel();
    window.setTimeout(() => {
      window.location.href = href;
    }, 50);
  }

  function goToExistingTablePicker() {
    closePanel();
    const gate = document.getElementById('entry-gate');
    const onGate = document.body.classList.contains('entry-pending') && gate && !gate.hidden;
    if (onGate && gate.dataset.mode === 'dine-in-only') return;
    const api = window.LechaimEntryGate;
    if (api?.reopenTablePicker?.()) return;
    api?.reopenOrderTypePicker?.();
  }

  function openPanel() {
    ensureDom();
    open = true;
    view = 'topics';
    panel.hidden = false;
    fab.classList.add('is-open');
    document.body.classList.add('help-bot-open');
    showTopics();
    applyCopy();
    if (typeof trapRelease === 'function') trapRelease();
    const release = window.LechaimFocusTrap?.activate?.(panel.querySelector('.help-bot-panel__card') || panel);
    trapRelease = typeof release === 'function' ? release : null;
  }

  function closePanel() {
    if (typeof trapRelease === 'function') trapRelease();
    trapRelease = null;
    open = false;
    view = 'topics';
    currentTopicId = null;
    if (panel) panel.hidden = true;
    fab?.classList.remove('is-open');
    document.body.classList.remove('help-bot-open');
  }

  function boot() {
    ensureDom();
    window.addEventListener('lechaim:dinein-session-ready', applyCopy);
    window.addEventListener('lechaim:dinein-table-ready', applyCopy);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
