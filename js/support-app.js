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
  const TOKEN_KEY = 'lechaim_support_last_token';
  const DEFAULT_SUBJECT = 'פנייה לשירות לקוחות';
  const reduceMotion = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

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
    const cta = document.querySelector('.hero__cta');
    if (!cta) return;
    cta.addEventListener('click', (event) => {
      event.preventDefault();
      scrollToForm();
      try { global.history.replaceState(null, '', '#support-panel'); } catch (_) { /* ignore */ }
    });
    if (global.location.hash === '#support-panel') {
      global.requestAnimationFrame(scrollToForm);
    }
  }

  function initHeader() {
    if (!header) return;
    const onScroll = () => header.classList.toggle('is-scrolled', global.scrollY > 12);
    onScroll();
    global.addEventListener('scroll', onScroll, { passive: true });
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
  initReveal();
  initParallax();
  initHeroCta();

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');
    if (val('support-website')) {
      setError('לא ניתן לשלוח את הפנייה.');
      return;
    }

    const name = val('support-name');
    const phone = val('support-phone');
    const orderNo = val('support-order');
    const body = val('support-body');

    if (name.length < 2) {
      setError('נא למלא שם מלא.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 6) {
      setError('נא למלא מספר טלפון תקין.');
      return;
    }
    if (body.length < 10) {
      setError('נא לכתוב הודעה בת 10 תווים לפחות.');
      return;
    }

    const sb = getClient();
    if (!sb) {
      setError('חיבור שירות הלקוחות אינו זמין כרגע.');
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
        p_locale: 'he',
      });
      if (error) {
        console.warn('[support] create failed', error);
        setError('לא הצלחנו לשלוח את הפנייה. נסו שוב או כתבו לנו ב-WhatsApp.');
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
      setError('לא הצלחנו לשלוח את הפנייה. נסו שוב או כתבו לנו ב-WhatsApp.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})(window);
