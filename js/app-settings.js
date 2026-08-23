/**
 * LECHAIM — Central restaurant settings reader (hours, delivery copy, Shabbat pickup).
 * Values live on restaurant_flags.flag_text. Fallbacks match today's hardcoded copy
 * until a row is loaded. Does not rewrite stored order totals or pickup_time.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    hours_open: '14:00',
    hours_close: '21:00',
    hours_weekly: '',
    delivery_fee: '10',
    delivery_min_order: '100',
    delivery_eta: '30–45 דקות',
    shabbat_pickup_time: '14:00',
  };

  const SETTING_KEYS = Object.keys(DEFAULTS);
  const WEEKLY_CACHE_KEY = 'lechaim-app-hours-weekly';
  const listeners = new Set();
  const loadedKeys = new Set();
  const values = { ...DEFAULTS };
  let started = false;
  let flagsUnsub = null;
  let inflightLoad = null;
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseClock(value, fallback) {
    const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallback;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
    return `${pad2(hour)}:${pad2(minute)}`;
  }

  function parseMoney(value, fallback) {
    const n = Number(String(value ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function detectLang() {
    const html = String(document.documentElement.lang || '').slice(0, 2);
    if (html === 'en' || html === 'he') return html;
    const fromToggle = document.querySelector('.lang-toggle__option--active')?.dataset?.lang;
    if (fromToggle === 'en' || fromToggle === 'he') return fromToggle;
    const shell = document.getElementById('entry-shell');
    if (shell?.dir === 'ltr') return 'en';
    return 'he';
  }

  function setNodeText(el, text) {
    if (!el || text == null) return;
    el.textContent = text;
  }

  function patchTranslations() {
    const T = global.TRANSLATIONS;
    if (T?.he) {
      T.he.deliveryFeeNotice = deliveryNotice('he');
      T.he.deliveryMinOrder = deliveryMinOrderText('he');
      T.he.helpBotAnswerDelivery = deliveryNotice('he');
    }
    if (T?.en) {
      T.en.deliveryFeeNotice = deliveryNotice('en');
      T.en.deliveryMinOrder = deliveryMinOrderText('en');
      T.en.helpBotAnswerDelivery = deliveryNotice('en');
    }
  }

  function paintCustomerCopy() {
    const lang = detectLang();
    document.querySelectorAll('[data-entry-i18n="deliveryOrderHint"]').forEach((el) => {
      setNodeText(el, deliveryHint(lang));
    });
    document.querySelectorAll('[data-entry-i18n="takeAwayHintWithDelivery"]').forEach((el) => {
      setNodeText(el, takeawayHintWithDelivery(lang));
    });
    document.querySelectorAll('[data-entry-i18n="hoursSummary"]').forEach((el) => {
      setNodeText(el, hoursSummary(lang));
    });
    setNodeText(document.getElementById('delivery-fee-text'), deliveryNotice(lang));
    setNodeText(document.getElementById('delivery-min-order-text'), deliveryMinOrderText(lang));
    setNodeText(document.getElementById('delivery-fee-notice'), deliveryNotice(lang));
    patchTranslations();
  }

  function notify() {
    listeners.forEach((fn) => {
      try { fn(snapshot()); } catch (_) { /* ignore */ }
    });
    try { paintCustomerCopy(); } catch (_) { /* ignore */ }
  }

  function parseWeekly(text) {
    try {
      const parsed = JSON.parse(String(text || ''));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function applyHoursFromState() {
    const hours = global.LechaimOpeningHours;
    if (loadedKeys.has('hours_weekly') && typeof hours?.setWeeklySchedule === 'function') {
      const weekly = parseWeekly(values.hours_weekly);
      if (weekly) {
        hours.setWeeklySchedule(weekly);
        return;
      }
    }
    if (typeof hours?.setSchedule !== 'function') return;
    const open = loadedKeys.has('hours_open') ? values.hours_open : hours.getOpenClock?.() || '14:00';
    const close = loadedKeys.has('hours_close') ? values.hours_close : hours.getCloseClock?.() || '22:00';
    hours.setSchedule(open, close);
  }

  function applyGlobals() {
    global.TAKEAWAY_DEFAULT_DELIVERY_FEE = getDeliveryFee();
    global.TAKEAWAY_DELIVERY_MIN_ORDER = getDeliveryMinOrder();
  }

  function applyFlagRow(key, text) {
    const k = String(key || '');
    if (!SETTING_KEYS.includes(k)) return false;
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return false;
    if (k === 'hours_weekly') {
      if (!parseWeekly(raw)) return false;
      values[k] = raw;
      try { global.localStorage?.setItem(WEEKLY_CACHE_KEY, raw); } catch (_) { /* ignore */ }
    } else if (k === 'hours_open' || k === 'hours_close' || k === 'shabbat_pickup_time') {
      values[k] = parseClock(raw, values[k]);
    } else if (k === 'delivery_fee' || k === 'delivery_min_order') {
      values[k] = String(parseMoney(raw, Number(values[k]) || 0));
    } else {
      values[k] = raw;
    }
    loadedKeys.add(k);
    return true;
  }

  function snapshot() {
    return {
      hours_open: getHoursOpen(),
      hours_close: getHoursClose(),
      delivery_fee: getDeliveryFee(),
      delivery_min_order: getDeliveryMinOrder(),
      delivery_eta: values.delivery_eta || DEFAULTS.delivery_eta,
      shabbat_pickup_time: getShabbatPickupTime(),
    };
  }

  function getHoursOpen() {
    const hours = global.LechaimOpeningHours;
    if (typeof hours?.getOpenClock === 'function') return hours.getOpenClock();
    return values.hours_open || DEFAULTS.hours_open;
  }

  function getHoursClose() {
    const hours = global.LechaimOpeningHours;
    if (typeof hours?.getCloseClock === 'function') return hours.getCloseClock();
    return values.hours_close || DEFAULTS.hours_close;
  }

  function hoursRange(sep = '–') {
    return global.LechaimOpeningHours?.hoursRangeLabel?.(sep)
      || `${getHoursOpen()}${sep}${getHoursClose()}`;
  }

  function hoursSummary(lang) {
    const L = lang === 'en' ? 'en' : 'he';
    return global.LechaimOpeningHours?.hoursSummaryLabel?.(L) || hoursRange();
  }

  function getDeliveryFee() {
    return parseMoney(values.delivery_fee, 10);
  }

  function getDeliveryMinOrder() {
    return parseMoney(values.delivery_min_order, 100);
  }

  function deliveryMinOrderText(lang) {
    const min = getDeliveryMinOrder();
    if (lang === 'en') return `Minimum delivery order €${min} (excluding delivery)`;
    return `מינימום הזמנה למשלוח €${min} (לא כולל משלוח)`;
  }

  function applyPatch(partial) {
    let changed = false;
    Object.keys(partial || {}).forEach((key) => {
      if (applyFlagRow(key, partial[key])) changed = true;
    });
    if (!changed) return snapshot();
    applyHoursFromState();
    applyGlobals();
    notify();
    return snapshot();
  }

  function getDeliveryEta(lang) {
    const raw = values.delivery_eta || DEFAULTS.delivery_eta;
    if (lang === 'en') {
      return String(raw)
        .replace(/דקות/g, 'minutes')
        .replace(/דקה/g, 'minute');
    }
    return raw;
  }

  function getShabbatPickupTime() {
    return loadedKeys.has('shabbat_pickup_time')
      ? values.shabbat_pickup_time
      : DEFAULTS.shabbat_pickup_time;
  }

  function deliveryNotice(lang) {
    const fee = getDeliveryFee();
    const min = getDeliveryMinOrder();
    const eta = getDeliveryEta(lang);
    if (lang === 'en') {
      return `Delivery is €${fee} · ${eta} · minimum order €${min} (excluding delivery)`;
    }
    return `עלות המשלוח היא €${fee} · זמן משלוח ${eta} · מינימום הזמנה €${min} (לא כולל משלוח)`;
  }

  function deliveryHint(lang) {
    const fee = getDeliveryFee();
    const min = getDeliveryMinOrder();
    const eta = getDeliveryEta(lang);
    if (lang === 'en') {
      return `Delivery €${fee} · ${eta} · minimum order €${min}`;
    }
    return `משלוח בעלות €${fee} · זמן משלוח ${eta} · מינימום הזמנה €${min}`;
  }

  function takeawayHintWithDelivery(lang) {
    const fee = getDeliveryFee();
    const min = getDeliveryMinOrder();
    const eta = getDeliveryEta(lang);
    if (lang === 'en') {
      return `Pickup from the restaurant or delivery (€${fee}, ${eta}) · min. order €${min}`;
    }
    return `איסוף מהמסעדה או משלוח בעלות €${fee} · זמן משלוח ${eta} · מינימום הזמנה €${min}`;
  }

  function closedHoursText(lang, kind) {
    const summary = hoursSummary(lang);
    if (lang === 'en') {
      const who = kind === 'dine-in' ? 'Dine-in' : 'Takeaway';
      return `${who} orders follow restaurant hours:\n${summary}.`;
    }
    const who = kind === 'dine-in' ? 'לישיבה במקום' : 'לאיסוף עצמי';
    return `ניתן לבצע הזמנות ${who} בשעות הפעילות:\n${summary}.`;
  }

  function orderingClosedBanner(lang) {
    const summary = hoursSummary(lang);
    if (lang === 'en') {
      return `Ordering is closed right now. Hours: ${summary}. You can browse the menu only.`;
    }
    return `לא ניתן להזמין כרגע. שעות פעילות: ${summary}. ניתן לצפות בתפריט בלבד.`;
  }

  function orderingClosedToast(lang) {
    const summary = hoursSummary(lang);
    if (lang === 'en') return `Ordering is closed — ${summary}`;
    return `לא ניתן להזמין כרגע — ${summary}`;
  }

  function pickupHelp(lang) {
    const summary = hoursSummary(lang);
    if (lang === 'en') {
      return `Order and pick up from the restaurant.\n\nHours: ${summary}.\n\nCustomer details and pickup time are required to send the order.`;
    }
    return `הזמינו ואספו מהמסעדה.\n\nשעות פעילות: ${summary}.\n\nלשליחת ההזמנה נדרשים פרטי לקוח ומועד.`;
  }

  function shabbatPickupLabel(lang) {
    const time = getShabbatPickupTime();
    if (lang === 'en') return `Pickup on Friday at ${time}`;
    return `איסוף ביום שישי בשעה ${time}`;
  }

  function shabbatHelp(lang) {
    if (lang === 'en') {
      return `Shabbat Orders\nSpecial menu for Shabbat\n\n${shabbatPickupLabel('en')}`;
    }
    return `הזמנות לשבת\nתפריט מיוחד לשבת קודש\n\n${shabbatPickupLabel('he')}`;
  }

  function placeResTimeRequired(lang) {
    const range = hoursRange(' ל־');
    if (lang === 'en') return `Please choose a time between ${hoursRange(' and ')}`;
    return `נא לבחור שעה בין ${range}`;
  }

  function copy(key, lang) {
    const L = lang === 'en' ? 'en' : 'he';
    switch (key) {
      case 'orderingClosedBanner':
        return orderingClosedBanner(L);
      case 'orderingClosedToast':
        return orderingClosedToast(L);
      case 'deliveryFeeNotice':
      case 'helpBotAnswerDelivery':
        return deliveryNotice(L);
      case 'deliveryMinOrder':
        return deliveryMinOrderText(L);
      case 'helpBotAnswerPickup':
        return pickupHelp(L);
      case 'helpBotAnswerShabbat':
        return shabbatHelp(L);
      case 'takeAwayHintWithDelivery':
        return takeawayHintWithDelivery(L);
      case 'deliveryOrderHint':
        return deliveryHint(L);
      case 'pickupClosedText':
        return closedHoursText(L, 'takeaway');
      case 'dineInClosedText':
        return closedHoursText(L, 'dine-in');
      case 'placeResTimeRequired':
        return placeResTimeRequired(L);
      case 'pickupFixed':
        return shabbatPickupLabel(L);
      case 'hoursSummary':
      case 'helpBotAnswerHours':
        return hoursSummary(L);
      case 'placeResWeekendClosed':
        return L === 'en'
          ? 'The restaurant is closed on this day — please choose another date'
          : 'המסעדה סגורה ביום זה — נא לבחור תאריך אחר';
      default:
        return null;
    }
  }

  function hydrateCachedWeekly() {
    try {
      const cached = global.localStorage?.getItem(WEEKLY_CACHE_KEY);
      if (cached && applyFlagRow('hours_weekly', cached)) {
        applyHoursFromState();
      }
    } catch (_) { /* ignore */ }
  }

  async function loadOnce() {
    const api = global.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.getAppSettings !== 'function') {
      applyHoursFromState();
      applyGlobals();
      notify();
      readyResolve(snapshot());
      return snapshot();
    }
    try {
      const found = await api.getAppSettings();
      if (!found.hours_weekly && typeof api.getWeeklyHours === 'function') {
        const weekly = await api.getWeeklyHours();
        if (weekly) found.hours_weekly = weekly;
      }
      Object.keys(found || {}).forEach((key) => applyFlagRow(key, found[key]));
    } catch (err) {
      console.warn('[app-settings] load failed', err);
    }
    applyHoursFromState();
    applyGlobals();
    notify();
    readyResolve(snapshot());
    return snapshot();
  }

  function load() {
    if (inflightLoad) return inflightLoad;
    inflightLoad = loadOnce().finally(() => {
      inflightLoad = null;
    });
    return inflightLoad;
  }

  function start() {
    if (started) return;
    started = true;
    const api = global.LechaimSupabaseOrders;
    if (typeof api?.subscribeRestaurantFlags === 'function') {
      flagsUnsub = api.subscribeRestaurantFlags((evt) => {
        if (!SETTING_KEYS.includes(evt?.flagKey)) return;
        if (applyFlagRow(evt.flagKey, evt.flagText)) {
          applyHoursFromState();
          applyGlobals();
          notify();
        }
      });
    }
    hydrateCachedWeekly();
    load();
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function unsubscribe() {};
    listeners.add(fn);
    try { fn(snapshot()); } catch (_) { /* ignore */ }
    return function unsubscribe() {
      listeners.delete(fn);
    };
  }

  global.LechaimAppSettings = {
    DEFAULTS,
    start,
    load,
    ready,
    applyPatch,
    onChange,
    snapshot,
    paintCustomerCopy,
    copy,
    hoursRange,
    hoursSummary,
    getHoursOpen,
    getHoursClose,
    getDeliveryFee,
    getDeliveryMinOrder,
    getDeliveryEta,
    getShabbatPickupTime,
    deliveryNotice,
    deliveryMinOrderText,
    deliveryHint,
    takeawayHintWithDelivery,
    closedHoursText,
    orderingClosedBanner,
    shabbatPickupLabel,
    placeResTimeRequired,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
