/**
 * Kitchen print buzzer.
 * Manual beep only (admin button /cloud beep job).
 * Auto-beep after kitchen tickets is disabled.
 * Beeps go through the kitchen print queue so they never overlap a ticket.
 */
'use strict';

let kitchenConfig = null;

function setKitchenConfig(cfg) {
  kitchenConfig = cfg || null;
}

function queueBeep() {
  const { enqueueBeep } = require('./queue');
  enqueueBeep(kitchenConfig);
}

function onKitchenPrinted() {
  /* No auto-beep when Admin/Service prints a kitchen ticket.
     Manual beep stays available via beepOnce / admin kitchen beep button. */
  console.log('[kitchen-alert] printed → beep skipped');
}

function beepOnce() {
  queueBeep();
  console.log('[kitchen-alert] manual beep');
  return { success: true };
}

module.exports = {
  setKitchenConfig,
  onKitchenPrinted,
  beepOnce,
};
