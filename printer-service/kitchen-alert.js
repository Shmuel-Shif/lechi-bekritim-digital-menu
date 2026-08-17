/**
 * Kitchen print buzzer.
 * One beep per kitchen ticket. Manual beep is separate.
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
  queueBeep();
  console.log('[kitchen-alert] printed → beep once');
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
