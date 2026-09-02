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
      pageDesc: 'שירות לקוחות של מסעדת לחיים בכרתים — כשר למהדרין. יש משהו שתרצו לומר לנו? נשמח לשמוע, ונחזור אליכם ב-WhatsApp או באימייל.',
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
      fieldPhone: 'טלפון',
      fieldPhoneHint: 'לחזרה ב-WhatsApp',
      fieldEmail: 'אימייל',
      contactHow: 'איך נוח לכם שנחזור אליכם?',
      contactWhatsApp: 'WhatsApp',
      contactEmail: 'אימייל',
      fieldOrder: 'מספר הזמנה',
      fieldOrderPh: '#',
      fieldOptional: '(אופציונלי)',
      fieldBody: 'הודעה *',
      fieldBodyPh: 'כתבו כאן בחופשיות',
      submit: 'שליחת פנייה',
      formNote: 'צוות לחיים יקבל את הפנייה ויחזור אליכם בהקדם האפשרי.',
      successTitle: 'הפנייה התקבלה',
      successThanks: 'תודה שכתבתם לנו.\nקיבלנו את הפנייה ונחזור אליכם בהקדם האפשרי.',
      successReplyWhatsApp: 'נחזור אליכם ב-WhatsApp.',
      successReplyEmail: 'נחזור אליכם באימייל.',
      successReplyBoth: 'נחזור אליכם ב-WhatsApp או באימייל.',
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
      errPhone: 'נא למלא מספר טלפון בינלאומי תקין.',
      errEmail: 'נא למלא כתובת אימייל תקינה.',
      errChannel: 'נא לבחור WhatsApp או אימייל.',
      errBody: 'נא לכתוב הודעה בת 10 תווים לפחות.',
      errOffline: 'חיבור שירות הלקוחות אינו זמין כרגע.',
      errSend: 'לא הצלחנו לשלוח את הפנייה. נסו שוב או כתבו לנו ב-WhatsApp.',
    },
    en: {
      pageTitle: 'Customer Service | Lechaim in Crete Mehadrin Kosher',
      pageDesc: 'Customer service for Lechaim in Crete — Mehadrin kosher. Something you would like to tell us? We would love to hear from you, and we will get back to you on WhatsApp or by email.',
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
      fieldPhone: 'Phone',
      fieldPhoneHint: 'for a WhatsApp reply',
      fieldEmail: 'Email',
      contactHow: 'How should we get back to you?',
      contactWhatsApp: 'WhatsApp',
      contactEmail: 'Email',
      fieldOrder: 'Order number',
      fieldOrderPh: '#',
      fieldOptional: '(optional)',
      fieldBody: 'Message *',
      fieldBodyPh: 'Write freely here',
      submit: 'Send message',
      formNote: 'The Lechaim team will receive your message and get back to you as soon as possible.',
      successTitle: 'Message received',
      successThanks: 'Thank you for writing to us.\nWe received your message and will get back to you as soon as possible.',
      successReplyWhatsApp: 'We will get back to you on WhatsApp.',
      successReplyEmail: 'We will get back to you by email.',
      successReplyBoth: 'We will get back to you on WhatsApp or by email.',
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
      errPhone: 'Please enter a valid international phone number.',
      errEmail: 'Please enter a valid email address.',
      errChannel: 'Please choose WhatsApp or email.',
      errBody: 'Please write a message of at least 10 characters.',
      errOffline: 'Customer service is unavailable right now.',
      errSend: 'We could not send your message. Please try again or write to us on WhatsApp.',
    },
  };

  let lang = 'he';
  let lastPreference = 'whatsapp';

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
    const reply = document.getElementById('support-success-reply');
    if (reply) reply.textContent = successReplyText();
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

  function wantWhatsApp() {
    return Boolean(document.getElementById('support-contact-wa')?.checked);
  }

  function wantEmail() {
    return Boolean(document.getElementById('support-contact-email')?.checked);
  }

  function contactPreference() {
    return wantEmail() ? 'email' : 'whatsapp';
  }

  function successReplyText() {
    if (lastPreference === 'email') return t('successReplyEmail');
    if (lastPreference === 'whatsapp_email') return t('successReplyBoth');
    return t('successReplyWhatsApp');
  }

  function toWhatsAppDigits(raw) {
    const original = String(raw || '').trim();
    let digits = original.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (!digits) return '';
    if (/^\s*\+|^\s*00/.test(original)) {
      return digits.length >= 10 && digits.length <= 15 ? digits : '';
    }
    if (digits.startsWith('972') && digits.length >= 11 && digits.length <= 15) return digits;
    if (digits.startsWith('30') && digits.length >= 11 && digits.length <= 15) return digits;
    if (digits.startsWith('05') && digits.length === 10) return `972${digits.slice(1)}`;
    if (digits.length === 9 && digits.startsWith('5')) return `972${digits}`;
    if (digits.startsWith('069') && digits.length === 11) return `30${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('69')) return `30${digits}`;
    if (!digits.startsWith('0') && digits.length >= 10 && digits.length <= 15) return digits;
    return '';
  }

  function isValidIntlPhone(raw) {
    const digits = toWhatsAppDigits(raw);
    return digits.length >= 10 && digits.length <= 15;
  }

  function isValidEmail(raw) {
    const email = String(raw || '').trim();
    if (email.length < 3 || email.length > 120) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function sanitizeOrderNo(raw) {
    return String(raw || '').replace(/\D/g, '').slice(0, 40);
  }

  function syncContactUi() {
    const phoneField = document.getElementById('support-phone-field');
    const emailField = document.getElementById('support-email-field');
    const phone = document.getElementById('support-phone');
    const email = document.getElementById('support-email');
    const wa = wantWhatsApp();
    const em = wantEmail();
    if (phoneField) phoneField.hidden = !wa;
    if (emailField) emailField.hidden = !em;
    if (phone) {
      phone.required = wa;
      phone.disabled = !wa;
    }
    if (email) {
      email.required = em;
      email.disabled = !em;
    }
  }

  function initContactPrefs() {
    const waEl = document.getElementById('support-contact-wa');
    const emEl = document.getElementById('support-contact-email');
    waEl?.addEventListener('change', syncContactUi);
    emEl?.addEventListener('change', syncContactUi);
    syncContactUi();
  }

  function initOrderField() {
    const input = document.getElementById('support-order');
    if (!input) return;
    const paint = () => {
      const next = sanitizeOrderNo(input.value);
      if (input.value !== next) input.value = next;
    };
    input.addEventListener('input', paint);
    input.addEventListener('blur', paint);
    if (!String(input.value || '').trim()) {
      let fromUrl = '';
      try {
        fromUrl = sanitizeOrderNo(new URLSearchParams(global.location.search).get('order'));
      } catch (_) { /* ignore */ }
      if (fromUrl) {
        input.value = fromUrl;
      } else {
        try {
          const session = JSON.parse(global.localStorage.getItem(SESSION_KEY) || 'null');
          const n = Number(session?.publicOrderNo);
          if (Number.isFinite(n) && n > 0) input.value = String(n).slice(0, 40);
        } catch (_) { /* ignore */ }
      }
    }
    paint();
  }

  function scrollToForm() {
    if (!panel) return;
    const headerH = header?.getBoundingClientRect().height || 54;
    const y = panel.getBoundingClientRect().top + global.scrollY - headerH - 10;
    global.scrollTo({
      top: Math.max(0, y),
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
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
  initContactPrefs();
  initOrderField();
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
    const email = val('support-email');
    const orderNo = val('support-order');
    const body = val('support-body');
    const wa = wantWhatsApp();
    const em = wantEmail();
    const preference = contactPreference();

    if (name.length < 2) {
      setError(t('errName'));
      return;
    }
    if (!wa && !em) {
      setError(t('errChannel'));
      return;
    }
    if (wa && !isValidIntlPhone(phone)) {
      setError(t('errPhone'));
      return;
    }
    if (em && !isValidEmail(email)) {
      setError(t('errEmail'));
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

    const phoneDigits = toWhatsAppDigits(phone);
    const pPhone = wa && phoneDigits ? `+${phoneDigits}` : null;
    const pEmail = em && isValidEmail(email) ? email : null;

    if (submitBtn) submitBtn.disabled = true;
    try {
      const { data, error } = await sb.rpc('create_support_ticket', {
        p_name: name,
        p_phone: pPhone,
        p_email: pEmail,
        p_order_no: sanitizeOrderNo(orderNo) || null,
        p_subject: DEFAULT_SUBJECT,
        p_body: body,
        p_locale: lang,
        p_contact_preference: preference,
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
      lastPreference = preference;
      const reply = document.getElementById('support-success-reply');
      if (reply) reply.textContent = successReplyText();
      if (success) {
        success.hidden = false;
        document.body.classList.add('support-success-open');
        success.focus?.();
      }
    } catch (err) {
      console.warn('[support] create error', err);
      setError(t('errSend'));
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})(window);
