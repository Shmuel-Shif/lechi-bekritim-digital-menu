/**
 * LECHAIM — Restaurant opening hours (Crete local clock via browser Date).
 * Single source for open/closed checks and related customer slots.
 *
 * Ordering window: Sun–Thu OPEN_HOUR ≤ hour < CLOSE_HOUR (Fri–Sat closed).
 * CLOSE_HOUR is exclusive → 21:59 open, 22:00 closed when CLOSE_HOUR = 22.
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

  function isWeekendClosed(date = new Date()) {
    const day = date.getDay(); /* 0=Sun … 5=Fri 6=Sat */
    return day === 5 || day === 6;
  }

  function isWithinOrderingHours(date = new Date()) {
    if (isWeekendClosed(date)) return false;
    const hour = date.getHours();
    return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
  }

  function takeawaySlotCloseMinutes() {
    return TAKEAWAY_LAST_SLOT_HOUR * 60 + TAKEAWAY_LAST_SLOT_MINUTE;
  }

  function adminPlaceResSlotCloseMinutes() {
    return ADMIN_PLACE_RES_LAST_SLOT_HOUR * 60 + ADMIN_PLACE_RES_LAST_SLOT_MINUTE;
  }

  /** Display range e.g. "14:00–22:00" (close shown as wall-clock close, not exclusive). */
  function hoursRangeLabel(sep = '–') {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(OPEN_HOUR)}:00${sep}${pad(CLOSE_HOUR)}:00`;
  }

  global.LechaimOpeningHours = Object.freeze({
    OPEN_HOUR,
    CLOSE_HOUR,
    TAKEAWAY_LAST_SLOT_HOUR,
    TAKEAWAY_LAST_SLOT_MINUTE,
    PLACE_RES_LAST_SLOT_HOUR,
    PLACE_RES_LAST_SLOT_MINUTE,
    ADMIN_PLACE_RES_LAST_SLOT_HOUR,
    ADMIN_PLACE_RES_LAST_SLOT_MINUTE,
    isWeekendClosed,
    isWithinOrderingHours,
    takeawaySlotCloseMinutes,
    adminPlaceResSlotCloseMinutes,
    hoursRangeLabel,
  });
})(typeof window !== 'undefined' ? window : globalThis);
