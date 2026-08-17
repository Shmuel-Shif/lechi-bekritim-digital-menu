/**
 * LECHAIM — Restaurant opening hours (Crete local clock via browser Date).
 * Single source for open/closed checks and related customer slots.
 *
 * Ordering window: Sun–Thu OPEN_HOUR ≤ hour < CLOSE_HOUR (Fri–Sat closed).
 * CLOSE_HOUR is exclusive → 21:59 open, 22:00 closed when CLOSE_HOUR = 22.
 *
 * Admin button follows the clock when nobody clicks:
 *   outside hours → "פתח חנות", inside hours → "סגור חנות".
 * "פתח חנות" force-opens until CLOSE_HOUR (or midnight if after close).
 * "סגור חנות" force-closes until CLOSE_HOUR. Next day the schedule resumes.
 *
 * Butcher shop is exempt: always accepts orders (any day/hour). Pickup slot
 * window for scheduled butcher orders is defined separately in main.js.
 */
(function (global) {
  'use strict';

  const OPEN_HOUR = 14;
  /** Exclusive end hour for is-open checks. */
  const CLOSE_HOUR = 22;

  /** Last selectable takeaway / delivery pickup slot (inclusive). */
  const TAKEAWAY_LAST_SLOT_HOUR = 21;
  const TAKEAWAY_LAST_SLOT_MINUTE = 45;

  /** Last customer place-reservation arrival slot (inclusive). */
  const PLACE_RES_LAST_SLOT_HOUR = 21;
  const PLACE_RES_LAST_SLOT_MINUTE = 0;

  /** Last admin place-reservation arrival slot (inclusive). */
  const ADMIN_PLACE_RES_LAST_SLOT_HOUR = 22;
  const ADMIN_PLACE_RES_LAST_SLOT_MINUTE = 0;

  let forceOpen = false;
  let forceOpenUntilMs = 0;
  let forceClose = false;
  let forceCloseUntilMs = 0;
  let scheduleTimer = null;
  const expireOpenListeners = new Set();
  const expireCloseListeners = new Set();
  const scheduleListeners = new Set();

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function todayAtMs(hour, date = new Date()) {
    const at = new Date(date);
    at.setHours(hour, 0, 0, 0);
    return at.getTime();
  }

  function nextMidnightMs(date = new Date()) {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next.getTime();
  }

  /**
   * Admin override expiry: 22:00 today, or midnight if already past close.
   */
  function overrideExpiryMs(date = new Date()) {
    const closeMs = todayAtMs(CLOSE_HOUR, date);
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

  function isNaturallyOpen(date = new Date()) {
    const day = date.getDay();
    if (day === 5 || day === 6) return false;
    const hour = date.getHours();
    return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
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
    if (isForceOpen() && !isForceClose()) return false;
    const day = date.getDay(); /* 0=Sun … 5=Fri 6=Sat */
    return day === 5 || day === 6;
  }

  function isWithinOrderingHours(date = new Date()) {
    if (isForceClose()) return false;
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
    const openMs = todayAtMs(OPEN_HOUR, date);
    const closeMs = todayAtMs(CLOSE_HOUR, date);
    if (openMs > now) candidates.push(openMs);
    else candidates.push(openMs + 24 * 60 * 60 * 1000);
    if (closeMs > now) candidates.push(closeMs);
    else candidates.push(closeMs + 24 * 60 * 60 * 1000);
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

  function takeawaySlotCloseMinutes() {
    return TAKEAWAY_LAST_SLOT_HOUR * 60 + TAKEAWAY_LAST_SLOT_MINUTE;
  }

  function adminPlaceResSlotCloseMinutes() {
    return ADMIN_PLACE_RES_LAST_SLOT_HOUR * 60 + ADMIN_PLACE_RES_LAST_SLOT_MINUTE;
  }

  /** Display range e.g. "14:00–22:00" (close shown as wall-clock close, not exclusive). */
  function hoursRangeLabel(sep = '–') {
    return `${pad2(OPEN_HOUR)}:00${sep}${pad2(CLOSE_HOUR)}:00`;
  }

  armScheduleTimer();

  global.LechaimOpeningHours = Object.freeze({
    OPEN_HOUR,
    CLOSE_HOUR,
    TAKEAWAY_LAST_SLOT_HOUR,
    TAKEAWAY_LAST_SLOT_MINUTE,
    PLACE_RES_LAST_SLOT_HOUR,
    PLACE_RES_LAST_SLOT_MINUTE,
    ADMIN_PLACE_RES_LAST_SLOT_HOUR,
    ADMIN_PLACE_RES_LAST_SLOT_MINUTE,
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
    adminPlaceResSlotCloseMinutes,
    hoursRangeLabel,
  });
})(typeof window !== 'undefined' ? window : globalThis);
