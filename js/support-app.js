/**
 * LECHAIM — Public support form (support.html).
 * Isolated from orders / till / print. Creates a ticket via RPC only.
 */
(function (global) {
  'use strict';

  const form = document.getElementById('support-form');
  const wrap = document.getElementById('support-form-wrap');
  const success = document.getElementById('support-success');
  const errorEl = document.getElementById('support-error');
  const submitBtn = document.getElementById('support-submit');
  const panel = document.getElementById('support-panel');
  const header = document.getElementById('support-header');
  const langToggle = document.getElementById('support-lang-toggle');
  const TOKEN_KEY = 'lechaim_support_last_token';
  const LANG_KEY = 'lechaim_ui_lang';
  const SESSION_KEY = 'lechaim-order-session';
  const DEFAULT_SUBJECT = 'פנייה לשירות לקוחות';
  const reduceMotion = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  try {
    if ('scrollRestoration' in global.history) global.history.scrollRestoration = 'manual';
  } catch (_) { /* ignore */ }
  global.addEventListener('pageshow', () => global.scrollTo(0, 0));

  const COPY = {
    he: {
      pageTitle: 'שירות לקוחות | לחיים בכרתים כשר למהדרין',
      pageDesc: 'שירות לקוחות של מסעדת לחיים בכרתים — כשר למהדרין. יש משהו שתרצו לומר לנו? נשמח לשמוע, ונחזור אליכם ב-WhatsApp.',
      skipForm: 'דלגו לטופס הפנייה',
      brandAria: 'לחיים בכרתים — חזרה לדף הבית',
      homeAria: 'לעמוד הראשי',
      langAria: 'החלפת שפה – עברית / English',
      kicker1: 'שירות',
      kicker2: 'הלקוחות',
      kicker3: 'של',
      kicker4: 'לחיים',
      heroMini: 'גם אני יודע שהלקוח במקום הראשון אצלנו.',
      heroTitle: 'צריכים מענה עכשיו?',
      heroCta: 'כתבו לנו',
      heroPhotoAlt: 'פנים מסעדת לחיים בכרתים',
      formTitle: 'יש לכם משהו לומר לנו?',
      formSub: 'מסעדת לחיים כאן בשבילכם',
      fieldName: 'שם מלא *',
      fieldPhone: 'טלפון *',
      fieldPhoneHint: 'לחזרה ב-WhatsApp',
      fieldOrder: 'מספר הזמנה',
      fieldOptional: '(אופציונלי)',
      fieldBody: 'הודעה *',
      fieldBodyPh: 'כתבו כאן בחופשיות',
      submit: 'שליחת פנייה',
      formNote: 'צוות לחיים יקבל את הפנייה ויחזור אליכם ב-WhatsApp בהקדם האפשרי.',
      successTitle: 'הפנייה התקבלה',
      successBody: 'תודה שכתבתם לנו.\nקיבלנו את הפנייה ונחזור אליכם ב-WhatsApp בהקדם האפשרי.',
      successHome: 'לעמוד הראשי שלנו',
      chatAria: 'שיחה על מסעדת לחיים',
      chat1: 'מה אתה הכי אוהב בלחיים?',
      chat2: 'קשה לבחור. יש פה הכול, בשר, דגים, סלטים, מנות ראשונות וקינוחים.',
      chat3: 'וזה עוד לפני שדיברנו על האווירה במסעדה.',
      chat4: 'נכון. אבל מבחינתי יש משהו חשוב אפילו יותר.',
      chat5: 'הכשרות?',
      chat6: 'בדיוק. כשר למהדרין, עם כשרות מהודרת ושחיטת ליובאוויטש.',
      chat7: 'אז אוכל טוב, אווירה טובה וכשרות מהודרת.',
      chat8: 'בדיוק. זה לחיים.',
      footerTag: 'מסעדה כשרה למהדרין • כרתים',
      followUs: 'עקבו אחרינו',
      footerAriaMaps: 'Google Maps',
      footerAriaPhone: 'התקשרו +30 694 650 2236',
      errHp: 'לא ניתן לשלוח את הפנייה.',
      errName: 'נא למלא שם מלא.',
      errPhone: 'נא למלא מספר טלפון תקין.',
      errBody: 'נא לכתוב הודעה בת 10 תווים לפחות.',
      errOffline: 'חיבור שירות הלקוחות אינו זמין כרגע.',
      errSend: 'לא הצלחנו לשלוח את הפנייה. נסו שוב או כתבו לנו ב-WhatsApp.',
    },
    en: {
      pageTitle: 'Customer Service | Lechaim in Crete Mehadrin Kosher',
      pageDesc: 'Customer service for Lechaim in Crete — Mehadrin kosher. Something you would like to tell us? We would love to hear from you, and we will get back to you on WhatsApp.',
      skipForm: 'Skip to the contact form',
      brandAria: 'Lechaim in Crete — back to the home page',
      homeAria: 'Home page',
      langAria: 'Switch language – Hebrew / English',
      kicker1: 'Customer',
      kicker2: 'Service',
      kicker3: 'of',
      kicker4: 'Lechaim',
      heroMini: 'I know the guest comes first here too.',
      heroTitle: 'Need a reply now?',
      heroCta: 'Write to us',
      heroPhotoAlt: 'Inside Lechaim restaurant in Crete',
      formTitle: 'Have something to tell us?',
      formSub: 'Lechaim restaurant is here for you',
      fieldName: 'Full name *',
      fieldPhone: 'Phone *',
      fieldPhoneHint: 'for a WhatsApp reply',
      fieldOrder: 'Order number',
      fieldOptional: '(optional)',
      fieldBody: 'Message *',
      fieldBodyPh: 'Write freely here',
      submit: 'Send message',
      formNote: 'The Lechaim team will receive your message and get back to you on WhatsApp as soon as possible.',
      successTitle: 'Message received',
      successBody: 'Thank you for writing to us.\nWe received your message and will get back to you on WhatsApp as soon as possible.',
      successHome: 'Back to our home page',
      chatAria: 'A conversation about Lechaim restaurant',
      chat1: 'What do you love most here?',
      chat2: 'Hard to choose. Meat, fish, salads, starters and desserts.',
      chat3: 'And that’s before the atmosphere.',
      chat4: 'True. But something matters even more.',
      chat5: 'The kashrut?',
      chat6: 'Exactly. Mehadrin kosher, Lubavitch shechita.',
      chat7: 'Good food, great vibe, Mehadrin kashrut.',
      chat8: 'Exactly. That’s Lechaim.',
      footerTag: 'Mehadrin kosher restaurant • Crete',
      followUs: 'Follow us',
      footerAriaMaps: 'Google Maps',
      footerAriaPhone: 'Call +30 694 650 2236',
      errHp: 'The message could not be sent.',
      errName: 'Please enter your full name.',
      errPhone: 'Please enter a valid phone number.',
      errBody: 'Please write a message of at least 10 characters.',
      errOffline: 'Customer service is unavailable right now.',
      errSend: 'We could not send your message. Please try again or write to us on WhatsApp.',
    },
  };

  let lang = 'he';

  function t(key) {
    return COPY[lang]?.[key] || COPY.he[key] || key;
  }

  function readStoredLang() {
    try {
      const q = new URLSearchParams(global.location.search).get('lang');
      if (q === 'he' || q === 'en') return q;
    } catch (_) { /* ignore */ }
    try {
      const stored = global.localStorage.getItem(LANG_KEY);
      if (stored === 'he' || stored === 'en') return stored;
    } catch (_) { /* ignore */ }
    try {
      const session = JSON.parse(global.localStorage.getItem(SESSION_KEY) || 'null');
      if (session?.lang === 'he' || session?.lang === 'en') return session.lang;
    } catch (_) { /* ignore */ }
    const htmlLang = String(document.documentElement.lang || '').slice(0, 2);
    return htmlLang === 'en' ? 'en' : 'he';
  }

  function persistLang(next) {
    try { global.localStorage.setItem(LANG_KEY, next); } catch (_) { /* ignore */ }
    try {
      const raw = global.localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      if (!session || typeof session !== 'object') return;
      session.lang = next;
      global.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (_) { /* ignore */ }
  }

  function applyCopy() {
    document.documentElement.lang = lang;
    document.documentElement.dir = 'rtl';
    document.documentElement.setAttribute('data-lang', lang);
    document.title = t('pageTitle');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('pageDesc'));
    const ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) ogLocale.setAttribute('content', lang === 'he' ? 'he_IL' : 'en_US');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', t('pageTitle'));
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', t('pageDesc'));

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const text = t(key);
      if (!key || text == null) return;
      if (String(text).includes('\n')) {
        el.innerHTML = String(text).split('\n').map((line) => line.replace(/</g, '&lt;')).join('<br>');
      } else {
        el.textContent = text;
      }
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      const text = t(key);
      if (key && text) el.setAttribute('aria-label', text);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = t(key);
      if (key && text) el.setAttribute('placeholder', text);
    });
    document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      const key = el.getAttribute('data-i18n-alt');
      const text = t(key);
      if (key && text) el.setAttribute('alt', text);
    });
    langToggle?.querySelectorAll('[data-lang]').forEach((opt) => {
      opt.classList.toggle('support-lang__option--active', opt.dataset.lang === lang);
    });
    syncChatBots();
  }

  function measureHebrewChatHeight() {
    const chat = document.querySelector('.chat');
    if (!chat) return 0;
    const clone = chat.cloneNode(true);
    clone.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
    clone.style.width = chat.getBoundingClientRect().width + 'px';
    clone.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const text = COPY.he?.[key];
      if (!key || text == null) return;
      el.textContent = String(text).replace(/\n/g, ' ');
    });
    clone.querySelectorAll('.chat__say').forEach((el) => {
      el.style.direction = 'rtl';
    });
    document.body.appendChild(clone);
    const height = clone.getBoundingClientRect().height;
    clone.remove();
    return height;
  }

  function syncChatBots() {
    const bots = document.querySelector('.chat__bots');
    if (!bots) return;
    if (lang !== 'en') {
      bots.style.top = '';
      bots.style.bottom = '';
      bots.style.height = '';
      return;
    }
    const height = measureHebrewChatHeight();
    if (!height) return;
    bots.style.top = '0px';
    bots.style.bottom = 'auto';
    bots.style.height = height + 'px';
  }

  function setLang(next) {
    if (next !== 'he' && next !== 'en') return;
    lang = next;
    persistLang(next);
    applyCopy();
  }

  function getClient() {
    const cfg = global.LECHAIM_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey || !global.supabase?.createClient) return null;
    return global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  function setError(message) {
    if (!errorEl) return;
    const text = String(message || '').trim();
    errorEl.textContent = text;
    errorEl.hidden = !text;
  }

  function val(id) {
    return String(document.getElementById(id)?.value || '').trim();
  }

  function scrollToForm() {
    const isPhone = global.matchMedia?.('(max-width: 819px)')?.matches;
    const hero = document.querySelector('.hero');
    if (isPhone && hero) {
      const heroBottom = hero.getBoundingClientRect().bottom + global.scrollY;
      const top = Math.max(0, heroBottom);
      global.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    panel?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function initHeroCta() {
    const cta = document.querySelector('a.hero__say');
    if (!cta) return;
    cta.addEventListener('click', (event) => {
      event.preventDefault();
      scrollToForm();
    });
  }

  function initHeader() {
    if (!header) return;
    const onScroll = () => header.classList.toggle('is-scrolled', global.scrollY > 12);
    onScroll();
    global.addEventListener('scroll', onScroll, { passive: true });
  }

  function initLang() {
    setLang(readStoredLang());
    langToggle?.addEventListener('click', (event) => {
      const picked = event.target.closest('[data-lang]')?.dataset.lang;
      const next = picked === 'he' || picked === 'en'
        ? picked
        : (lang === 'he' ? 'en' : 'he');
      setLang(next);
    });
  }

  function initReveal() {
    const nodes = document.querySelectorAll('.reveal');
    if (!nodes.length) return;
    if (reduceMotion || !('IntersectionObserver' in global)) {
      nodes.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const reveal = (el) => el.classList.add('is-in');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    nodes.forEach((el) => {
      observer.observe(el);
      const rect = el.getBoundingClientRect();
      if (rect.top < global.innerHeight * 0.9) reveal(el);
    });
  }

  function initParallax() {
    const node = document.querySelector('[data-parallax]');
    const isPhone = global.matchMedia?.('(max-width: 819px)')?.matches;
    if (!node || reduceMotion || isPhone) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = Math.min(22, global.scrollY * 0.08);
      node.style.transform = `scale(1.08) translate3d(0, ${y}px, 0)`;
    };
    global.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      global.requestAnimationFrame(update);
    }, { passive: true });
  }

  initHeader();
  initLang();
  initReveal();
  initParallax();
  initHeroCta();
  global.addEventListener('resize', () => {
    global.clearTimeout(syncChatBots._t);
    syncChatBots._t = global.setTimeout(syncChatBots, 120);
  });
  if (document.fonts?.ready) {
    document.fonts.ready.then(syncChatBots).catch(() => {});
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');
    if (val('support-website')) {
      setError(t('errHp'));
      return;
    }

    const name = val('support-name');
    const phone = val('support-phone');
    const orderNo = val('support-order');
    const body = val('support-body');

    if (name.length < 2) {
      setError(t('errName'));
      return;
    }
    if (phone.replace(/\D/g, '').length < 6) {
      setError(t('errPhone'));
      return;
    }
    if (body.length < 10) {
      setError(t('errBody'));
      return;
    }

    const sb = getClient();
    if (!sb) {
      setError(t('errOffline'));
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const { data, error } = await sb.rpc('create_support_ticket', {
        p_name: name,
        p_phone: phone,
        p_email: null,
        p_order_no: orderNo || null,
        p_subject: DEFAULT_SUBJECT,
        p_body: body,
        p_locale: lang,
      });
      if (error) {
        console.warn('[support] create failed', error);
        setError(t('errSend'));
        return;
      }
      const token = data && typeof data === 'object' ? data.public_token : null;
      if (token) {
        try { localStorage.setItem(TOKEN_KEY, String(token)); } catch (_) { /* ignore */ }
      }
      if (wrap) wrap.hidden = true;
      if (success) {
        success.hidden = false;
        success.focus?.();
      }
      scrollToForm();
    } catch (err) {
      console.warn('[support] create error', err);
      setError(t('errSend'));
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})(window);
