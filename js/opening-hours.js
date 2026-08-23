/**
 * LECHAIM — Restaurant opening hours (Crete local clock via browser Date).
 * Weekly schedule: each weekday can be open/closed with its own from–to.
 * Close is exclusive → 20:59 open, 21:00 closed when close is 21:00.
 *
 * Fallback before settings load: Sun–Thu 14:00–22:00, Fri–Sat closed.
 *
 * "פתח חנות" force-opens until today's close (or midnight if after close).
 * "סגור חנות" force-closes until today's close. Next day the schedule resumes.
 *
 * Butcher shop is exempt: always accepts orders (any day/hour).
 */
(function (global) {
  'use strict';

  const DEFAULT_OPEN_MINUTES = 14 * 60;
  const DEFAULT_CLOSE_MINUTES = 22 * 60;
  const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6];
  const DEFAULT_OPEN_DAYS = [0, 1, 2, 3, 4];
  const WEEKLY_CACHE_KEY = 'lechaim-app-hours-weekly';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseClockToMinutes(value, fallbackMinutes) {
    const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallbackMinutes;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallbackMinutes;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallbackMinutes;
    return hour * 60 + minute;
  }

  function formatMinutes(mins) {
    const safe = Math.max(0, Math.min(23 * 60 + 59, Number(mins) || 0));
    return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
  }

  function clockFromText(value, fallback) {
    const mins = parseClockToMinutes(value, parseClockToMinutes(fallback, DEFAULT_OPEN_MINUTES));
    return formatMinutes(mins);
  }

  function emptyWeekly(from, to, openDays) {
    const week = {};
    DAY_KEYS.forEach((day) => {
      week[day] = {
        open: openDays.includes(day),
        from,
        to,
      };
    });
    return week;
  }

  function normalizeWeekly(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const week = {};
    DAY_KEYS.forEach((day) => {
      const row = src[day] || src[String(day)] || (Array.isArray(src) ? src[day] : null) || {};
      const from = clockFromText(row.from, '14:00');
      const to = clockFromText(row.to, '21:00');
      const fromMins = parseClockToMinutes(from, DEFAULT_OPEN_MINUTES);
      const toMins = parseClockToMinutes(to, 21 * 60);
      const openFlag = row.open;
      week[day] = {
        open: openFlag !== false && openFlag !== 'false' && openFlag !== 0 && openFlag !== '0',
        from,
        to: toMins > fromMins ? to : formatMinutes(fromMins + 60),
      };
    });
    return week;
  }

  function readCachedWeekly() {
    try {
      const raw = global.localStorage?.getItem(WEEKLY_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  const cachedWeekly = readCachedWeekly();
  let weekly = cachedWeekly
    ? normalizeWeekly(cachedWeekly)
    : emptyWeekly('14:00', '22:00', DEFAULT_OPEN_DAYS);
  let openMinutes = DEFAULT_OPEN_MINUTES;
  let closeMinutes = DEFAULT_CLOSE_MINUTES;

  let forceOpen = false;
  let forceOpenUntilMs = 0;
  let forceClose = false;
  let forceCloseUntilMs = 0;
  let scheduleTimer = null;
  const expireOpenListeners = new Set();
  const expireCloseListeners = new Set();
  const scheduleListeners = new Set();

  function asDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const p = value.split('-');
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    return new Date();
  }

  function ruleForDate(date) {
    const d = asDate(date);
    const row = weekly[d.getDay()] || { open: false, from: '14:00', to: '21:00' };
    return {
      open: Boolean(row.open),
      from: row.from,
      to: row.to,
      openMinutes: parseClockToMinutes(row.from, DEFAULT_OPEN_MINUTES),
      closeMinutes: parseClockToMinutes(row.to, DEFAULT_CLOSE_MINUTES),
    };
  }

  function syncTodayClocks(date = new Date()) {
    const rule = ruleForDate(date);
    openMinutes = rule.openMinutes;
    closeMinutes = rule.closeMinutes;
  }

  function nowMinutes(date = new Date()) {
    return date.getHours() * 60 + date.getMinutes();
  }

  function todayAtMinutes(mins, date = new Date()) {
    const at = new Date(date);
    at.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return at.getTime();
  }

  function nextMidnightMs(date = new Date()) {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next.getTime();
  }

  function cloneWeekly() {
    const out = {};
    DAY_KEYS.forEach((day) => {
      out[day] = { ...weekly[day] };
    });
    return out;
  }

  function setWeeklySchedule(next, options = {}) {
    weekly = normalizeWeekly(next);
    try {
      global.localStorage?.setItem(WEEKLY_CACHE_KEY, JSON.stringify(cloneWeekly()));
    } catch (_) { /* ignore */ }
    syncTodayClocks();
    armScheduleTimer();
    if (options.silent !== true) notify(scheduleListeners);
    return true;
  }

  function setSchedule(openText, closeText, options = {}) {
    const nextOpen = parseClockToMinutes(openText, openMinutes);
    const nextClose = parseClockToMinutes(closeText, closeMinutes);
    if (nextClose <= nextOpen) return false;
    const from = formatMinutes(nextOpen);
    const to = formatMinutes(nextClose);
    const openDays = DAY_KEYS.filter((day) => weekly[day].open);
    if (!openDays.length) return false;
    openDays.forEach((day) => {
      weekly[day] = { open: true, from, to };
    });
    syncTodayClocks();
    armScheduleTimer();
    if (options.silent !== true) notify(scheduleListeners);
    return true;
  }

  function overrideExpiryMs(date = new Date()) {
    const rule = ruleForDate(date);
    const closeMs = todayAtMinutes(rule.closeMinutes, date);
    if (date.getTime() < closeMs) return closeMs;
    return nextMidnightMs(date);
  }

  function forceOpenExpiryMs(date = new Date()) {
    return overrideExpiryMs(date);
  }

  function formatClockFromMs(ms) {
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function isDayScheduledOpen(date = new Date()) {
    return ruleForDate(date).open === true;
  }

  function isNaturallyOpen(date = new Date()) {
    const rule = ruleForDate(date);
    if (!rule.open) return false;
    const mins = nowMinutes(date);
    return mins >= rule.openMinutes && mins < rule.closeMinutes;
  }

  function resolveOverrideState(flagValue, flagText, date = new Date()) {
    if (!flagValue) return { active: false, untilMs: 0, stale: false };
    const untilMs = Date.parse(String(flagText || ''));
    if (!Number.isFinite(untilMs)) {
      return { active: false, untilMs: 0, stale: true };
    }
    if (date.getTime() >= untilMs) {
      return { active: false, untilMs: 0, stale: true };
    }
    return { active: true, untilMs, stale: false };
  }

  function isForceOpen() {
    if (!forceOpen) return false;
    if (forceOpenUntilMs && Date.now() >= forceOpenUntilMs) return false;
    return true;
  }

  function isForceClose() {
    if (!forceClose) return false;
    if (forceCloseUntilMs && Date.now() >= forceCloseUntilMs) return false;
    return true;
  }

  function isWeekendClosed(date = new Date()) {
    return !isDayScheduledOpen(date);
  }

  function isWithinOrderingHours(date = new Date()) {
    if (isForceClose()) return false;
    if (!isDayScheduledOpen(date)) return false;
    if (isForceOpen()) return true;
    return isNaturallyOpen(date);
  }

  function addListener(set, fn) {
    if (typeof fn !== 'function') return function unsubscribe() {};
    set.add(fn);
    return function unsubscribe() {
      set.delete(fn);
    };
  }

  function notify(set) {
    set.forEach((fn) => {
      try { fn(); } catch (_) { /* ignore */ }
    });
  }

  function nextBoundaryMs(date = new Date()) {
    const now = date.getTime();
    const candidates = [];
    const rule = ruleForDate(date);
    const openMs = todayAtMinutes(rule.openMinutes, date);
    const closeMs = todayAtMinutes(rule.closeMinutes, date);
    if (openMs > now) candidates.push(openMs);
    if (closeMs > now) candidates.push(closeMs);
    candidates.push(nextMidnightMs(date));
    if (forceOpen && forceOpenUntilMs > now) candidates.push(forceOpenUntilMs);
    if (forceClose && forceCloseUntilMs > now) candidates.push(forceCloseUntilMs);
    return Math.min(...candidates);
  }

  function syncExpiredOverrides() {
    let openedExpired = false;
    let closedExpired = false;
    if (forceOpen && (!forceOpenUntilMs || Date.now() >= forceOpenUntilMs)) {
      forceOpen = false;
      forceOpenUntilMs = 0;
      openedExpired = true;
    }
    if (forceClose && (!forceCloseUntilMs || Date.now() >= forceCloseUntilMs)) {
      forceClose = false;
      forceCloseUntilMs = 0;
      closedExpired = true;
    }
    if (openedExpired) notify(expireOpenListeners);
    if (closedExpired) notify(expireCloseListeners);
    return openedExpired || closedExpired;
  }

  function armScheduleTimer() {
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    const delay = Math.max(30, nextBoundaryMs() - Date.now());
    scheduleTimer = setTimeout(() => {
      scheduleTimer = null;
      syncTodayClocks();
      syncExpiredOverrides();
      notify(scheduleListeners);
      armScheduleTimer();
    }, Math.min(delay + 30, 2147483647));
  }

  function applyOpenOverride(active, untilMs) {
    forceOpen = Boolean(active);
    forceOpenUntilMs = forceOpen && Number.isFinite(Number(untilMs)) && Number(untilMs) > Date.now()
      ? Number(untilMs)
      : 0;
    if (forceOpen && !forceOpenUntilMs) forceOpenUntilMs = overrideExpiryMs();
    if (forceOpen) {
      forceClose = false;
      forceCloseUntilMs = 0;
    }
    armScheduleTimer();
  }

  function applyCloseOverride(active, untilMs) {
    forceClose = Boolean(active);
    forceCloseUntilMs = forceClose && Number.isFinite(Number(untilMs)) && Number(untilMs) > Date.now()
      ? Number(untilMs)
      : 0;
    if (forceClose && !forceCloseUntilMs) forceCloseUntilMs = overrideExpiryMs();
    if (forceClose) {
      forceOpen = false;
      forceOpenUntilMs = 0;
    }
    armScheduleTimer();
  }

  function setForceOpen(value, untilMs) {
    applyOpenOverride(value, untilMs);
  }

  function setForceClose(value, untilMs) {
    applyCloseOverride(value, untilMs);
  }

  function applyForceOpenFromFlag(flagValue, flagText) {
    const resolved = resolveOverrideState(flagValue, flagText);
    applyOpenOverride(resolved.active, resolved.untilMs);
    return resolved;
  }

  function applyForceCloseFromFlag(flagValue, flagText) {
    const resolved = resolveOverrideState(flagValue, flagText);
    applyCloseOverride(resolved.active, resolved.untilMs);
    return resolved;
  }

  function getForceOpenUntilMs() {
    return isForceOpen() ? forceOpenUntilMs : 0;
  }

  function getForceCloseUntilMs() {
    return isForceClose() ? forceCloseUntilMs : 0;
  }

  function getOpenMinutes(date) {
    return date ? ruleForDate(date).openMinutes : openMinutes;
  }

  function getCloseMinutes(date) {
    return date ? ruleForDate(date).closeMinutes : closeMinutes;
  }

  function takeawaySlotCloseMinutes(date) {
    const close = getCloseMinutes(date);
    const open = getOpenMinutes(date);
    return Math.max(open, close - 15);
  }

  function placeResSlotCloseMinutes(date) {
    const close = getCloseMinutes(date);
    const open = getOpenMinutes(date);
    const remainder = close % 30;
    const last = remainder === 0 ? close - 30 : close - remainder;
    return Math.max(open, last);
  }

  function adminPlaceResSlotCloseMinutes(date) {
    const close = getCloseMinutes(date);
    const open = getOpenMinutes(date);
    return Math.max(open, close - 15);
  }

  function hoursRangeLabel(sep = '–', date) {
    const rule = ruleForDate(date || new Date());
    return `${rule.from}${sep}${rule.to}`;
  }

  function sameRule(a, b) {
    return Boolean(a.open) === Boolean(b.open) && a.from === b.from && a.to === b.to;
  }

  function hoursGroups() {
    const groups = [];
    let i = 0;
    while (i < 7) {
      let j = i;
      while (j + 1 < 7 && sameRule(weekly[j + 1], weekly[i])) j += 1;
      groups.push({
        start: i,
        end: j,
        open: Boolean(weekly[i].open),
        from: weekly[i].from,
        to: weekly[i].to,
      });
      i = j + 1;
    }
    return groups;
  }

  function hoursSummaryLabel(lang = 'he') {
    const he = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];
    const en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const names = lang === 'en' ? en : he;
    return hoursGroups().map((group) => {
      const days = group.start === group.end
        ? names[group.start]
        : `${names[group.start]}–${names[group.end]}`;
      if (!group.open) return lang === 'en' ? `${days} closed` : `${days} סגור`;
      return `${days} ${group.from}–${group.to}`;
    }).join(' · ');
  }

  syncTodayClocks();
  armScheduleTimer();

  global.LechaimOpeningHours = Object.freeze({
    get OPEN_HOUR() { return Math.floor(openMinutes / 60); },
    get CLOSE_HOUR() {
      return closeMinutes % 60 === 0
        ? Math.floor(closeMinutes / 60)
        : Math.ceil(closeMinutes / 60);
    },
    get DISPLAY_CLOSE_HOUR() { return Math.floor(closeMinutes / 60); },
    get TAKEAWAY_LAST_SLOT_HOUR() { return Math.floor(takeawaySlotCloseMinutes() / 60); },
    get TAKEAWAY_LAST_SLOT_MINUTE() { return takeawaySlotCloseMinutes() % 60; },
    get PLACE_RES_LAST_SLOT_HOUR() { return Math.floor(placeResSlotCloseMinutes() / 60); },
    get PLACE_RES_LAST_SLOT_MINUTE() { return placeResSlotCloseMinutes() % 60; },
    get ADMIN_PLACE_RES_LAST_SLOT_HOUR() { return Math.floor(adminPlaceResSlotCloseMinutes() / 60); },
    get ADMIN_PLACE_RES_LAST_SLOT_MINUTE() { return adminPlaceResSlotCloseMinutes() % 60; },
    parseClockToMinutes,
    formatMinutes,
    setSchedule,
    setWeeklySchedule,
    getWeeklySchedule: cloneWeekly,
    normalizeWeekly,
    ruleForDate,
    isDayScheduledOpen,
    hoursGroups,
    hoursSummaryLabel,
    getOpenMinutes,
    getCloseMinutes,
    getOpenClock: (date) => formatMinutes(getOpenMinutes(date)),
    getCloseClock: (date) => formatMinutes(getCloseMinutes(date)),
    forceOpenExpiryMs,
    overrideExpiryMs,
    formatClockFromMs,
    resolveForceOpenState: resolveOverrideState,
    resolveOverrideState,
    applyForceOpenFromFlag,
    applyForceCloseFromFlag,
    onForceOpenExpired: (fn) => addListener(expireOpenListeners, fn),
    onForceCloseExpired: (fn) => addListener(expireCloseListeners, fn),
    onScheduleChange: (fn) => addListener(scheduleListeners, fn),
    setForceOpen,
    setForceClose,
    isForceOpen,
    isForceClose,
    getForceOpenUntilMs,
    getForceCloseUntilMs,
    isNaturallyOpen,
    isWeekendClosed,
    isWithinOrderingHours,
    takeawaySlotCloseMinutes,
    placeResSlotCloseMinutes,
    adminPlaceResSlotCloseMinutes,
    hoursRangeLabel,
  });
})(typeof window !== 'undefined' ? window : globalThis);
