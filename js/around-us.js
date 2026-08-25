/**
 * LECHAIM — Walking-distance things to do in Analipsi (customer overlay).
 */
(function (global) {
  'use strict';

  const COPY = {
    he: {
      title: 'מה בסביבה שלנו',
      hint: 'הכל במרחק הליכה באנליפסי',
      maps: '📍 פתח במפות',
      open: 'מה בסביבה שלנו',
      close: 'סגור',
    },
    en: {
      title: 'What’s around us',
      hint: 'All within walking distance in Analipsi',
      maps: '📍 Open in Maps',
      open: 'What’s around us',
      close: 'Close',
    },
  };

  const PLACES = [
    {
      id: 'beach',
      emoji: '🏖️',
      maps: 'https://www.google.com/maps/search/?api=1&query=Analipsi+Beach',
      title: { he: 'חוף אנליפסי', en: 'Analipsi Beach' },
      hint: {
        he: 'ים, שחייה, שמש ומנוחה על החוף.',
        en: 'Sea, swimming, sunshine and a rest on the beach.',
      },
    },
    {
      id: 'promenade',
      emoji: '🚶',
      maps: 'https://www.google.com/maps/search/?api=1&query=%D7%98%D7%99%D7%99%D7%9C%D7%AA+%D7%90%D7%A0%D7%9C%D7%99%D7%A4%D7%A1%D7%99',
      title: { he: 'טיילת אנליפסי', en: 'Analipsi promenade' },
      hint: {
        he: 'טיול נעים לאורך החוף והטיילת, עם בתי קפה, ברים, מסעדות וחנויות. אזור החוף כולל טיילת ארוכה לאורך הים.',
        en: 'A pleasant walk along the seafront, with cafés, bars, restaurants and shops. The beach area has a long promenade by the water.',
      },
    },
    {
      id: 'souvenirs',
      emoji: '🛍️',
      maps: 'https://www.google.com/maps/search/?api=1&query=%D7%97%D7%A0%D7%95%D7%99%D7%95%D7%AA+%D7%95%D7%9E%D7%96%D7%9B%D7%A8%D7%95%D7%AA+%D7%91%D7%90%D7%A0%D7%9C%D7%99%D7%A4%D7%A1%D7%99',
      title: { he: 'חנויות ומזכרות', en: 'Shops & souvenirs' },
      hint: {
        he: 'באנליפסי יש חנויות מתנות, מזכרות, מוצרים מסורתיים מכרתים, תכשיטים וביגוד.',
        en: 'In Analipsi you’ll find gift shops, souvenirs, traditional Cretan products, jewellery and clothing.',
      },
    },
    {
      id: 'watersports',
      emoji: '🌊',
      maps: 'https://www.google.com/maps/search/?api=1&query=Aris+Water+Sports+Analipsi',
      title: { he: 'ספורט ימי', en: 'Water sports' },
      hint: {
        he: 'באזור החוף יש פעילויות כמו ג׳ט סקי, מצנח ים, סירות, בננה, סאפ, סקי מים, ווייקבורד וצלילה. אפשר להפנות ל־Aris Water Sports.',
        en: 'On the beach you’ll find jet ski, parasailing, boats, banana rides, SUP, water skiing, wakeboarding and diving. Look for Aris Water Sports.',
      },
    },
  ];

  let root = null;
  let trapRelease = null;
  let langObserver = null;

  function lang() {
    const fromToggle = document.querySelector(
      '#entry-lang-toggle .lang-toggle__option--active, .lang-toggle .lang-toggle__option--active'
    )?.dataset?.lang;
    if (fromToggle === 'he' || fromToggle === 'en') return fromToggle;
    const html = String(document.documentElement.lang || '').slice(0, 2);
    if (html === 'he' || html === 'en') return html;
    const ctx = global.LechaimOrderContext?.lang;
    if (ctx === 'he' || ctx === 'en') return ctx;
    return 'he';
  }

  function t(key) {
    const L = lang();
    return COPY[L]?.[key] || COPY.he[key] || key;
  }

  function placeText(place, field) {
    const L = lang();
    return place[field]?.[L] || place[field]?.he || '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render() {
    if (!root) return;
    const title = root.querySelector('#lechaim-around-us-title');
    const hint = root.querySelector('#lechaim-around-us-hint');
    const closeBtn = root.querySelector('#lechaim-around-us-close');
    const list = root.querySelector('#lechaim-around-us-list');
    const panel = root.querySelector('.around-us__panel');
    if (panel) panel.setAttribute('dir', lang() === 'en' ? 'ltr' : 'rtl');
    if (title) title.textContent = t('title');
    if (hint) hint.textContent = t('hint');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('close'));
    if (list) {
      list.innerHTML = PLACES.map((place) => (
        `<article class="around-us__place">`
        + `<div class="around-us__place-head">`
        + `<span class="around-us__emoji" aria-hidden="true">${escapeHtml(place.emoji)}</span>`
        + `<h3 class="around-us__name">${escapeHtml(placeText(place, 'title'))}</h3>`
        + `</div>`
        + `<p class="around-us__meta">${escapeHtml(placeText(place, 'hint'))}</p>`
        + `<a class="around-us__maps" href="${escapeHtml(place.maps)}" target="_blank" rel="noopener noreferrer">`
        + `${escapeHtml(t('maps'))}`
        + `</a>`
        + `</article>`
      )).join('');
    }
  }

  function close() {
    if (!root || root.hidden) return;
    if (typeof trapRelease === 'function') trapRelease();
    trapRelease = null;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('around-us-open');
  }

  function open() {
    ensureDom();
    render();
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('around-us-open');
    if (typeof trapRelease === 'function') trapRelease();
    const release = global.LechaimFocusTrap?.activate?.(root);
    trapRelease = typeof release === 'function' ? release : null;
    root.querySelector('.around-us__maps')?.focus();
  }

  function ensureDom() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'lechaim-around-us';
    root.className = 'around-us';
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <button type="button" class="around-us__backdrop" id="lechaim-around-us-backdrop" aria-label="סגור"></button>
      <div class="around-us__panel" role="dialog" aria-modal="true" aria-labelledby="lechaim-around-us-title">
        <p class="around-us__kicker" aria-hidden="true">🚶</p>
        <h2 class="around-us__title" id="lechaim-around-us-title"></h2>
        <p class="around-us__hint" id="lechaim-around-us-hint"></p>
        <div class="around-us__list" id="lechaim-around-us-list"></div>
        <button type="button" class="around-us__close" id="lechaim-around-us-close" aria-label="סגור">×</button>
      </div>
    `;
    document.body.append(root);
    root.querySelector('#lechaim-around-us-backdrop')?.addEventListener('click', close);
    root.querySelector('#lechaim-around-us-close')?.addEventListener('click', close);
  }

  function init() {
    if (document.body?.getAttribute('data-staff-order') === '1') return;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && root && !root.hidden) close();
    });
    langObserver = new MutationObserver(() => {
      if (root && !root.hidden) render();
    });
    langObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });
  }

  global.LechaimAroundUs = { open, close };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(window));
