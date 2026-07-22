/**
 * LECHAIM — Printer module (Stage 9.1)
 * Real TCP raw print to kitchen / bar (port 9100).
 * Called by the print queue, one job at a time per printer.
 */

'use strict';

const net = require('net');

/** ESC/POS full cut */
const CUT_COMMAND = Buffer.from([0x1D, 0x56, 0x00]);
const CONNECT_TIMEOUT_MS = 8000;

/**
 * Encode ticket for ESC/POS printers (single-byte + control codes).
 * Maps Unicode € to CP858 euro so it does not print as garbage (e.g. €ΓU).
 */
function encodeTicketBytes(ticket) {
  const s = String(ticket == null ? '' : ticket);
  const chunks = [];

  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);

    if (code === 0x20AC) {
      /* ESC t 19 (PC858) + euro 0xD5, then restore PC437 */
      chunks.push(Buffer.from([0x1B, 0x74, 0x13, 0xD5, 0x1B, 0x74, 0x00]));
      continue;
    }

    /* Keep ASCII + ESC/POS control bytes as-is */
    if (code <= 0xff) {
      chunks.push(Buffer.from([code]));
      continue;
    }

    chunks.push(Buffer.from([0x3F])); /* ? */
  }

  return Buffer.concat(chunks);
}

/**
 * @param {string} printerName - "kitchen" | "bar"
 * @param {string} ticket - plain-text ticket body
 * @param {{ ip?: string, port?: number } | null} [printerConfig]
 * @returns {Promise<{ success: true } | { success: false, error: string }>}
 */
function sendToPrinter(printerName, ticket, printerConfig) {
  const label = printerName === 'bar'
    ? 'Bar'
    : printerName === 'kitchen'
      ? 'Kitchen'
      : String(printerName || 'Unknown');

  console.log('Received Print Request');
  console.log('');
  console.log('Printer:');
  console.log(label);
  if (printerConfig?.ip) {
    console.log(`Config: ${printerConfig.ip}:${printerConfig.port ?? 9100}`);
  }
  console.log('');
  console.log('-----------------');
  console.log(ticket == null ? '' : String(ticket));
  console.log('-----------------');
  console.log('');

  const ip = printerConfig?.ip ? String(printerConfig.ip) : '';
  const port = Number(printerConfig?.port) || 9100;

  if (!ip) {
    console.error('[printer] missing printer IP in config');
    return Promise.resolve({
      success: false,
      error: 'Missing printer IP',
    });
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      try {
        socket.removeAllListeners();
        socket.destroy();
      } catch (err) {
        console.warn('[printer] socket cleanup warning', err?.message || err);
      }
      resolve(result);
    }

    socket.setTimeout(CONNECT_TIMEOUT_MS);

    socket.once('connect', () => {
      console.log(`[printer] connected → ${label} ${ip}:${port}`);

      const body = Buffer.concat([
        encodeTicketBytes(`${String(ticket)}\n\n\n`),
        CUT_COMMAND,
      ]);
      const payload = body;

      socket.write(payload, (writeErr) => {
        if (writeErr) {
          console.error('[printer] write failed', writeErr.message || writeErr);
          finish({ success: false, error: writeErr.message || 'Write failed' });
          return;
        }

        socket.end(() => {
          console.log(`[printer] sent + closed → ${label} ${ip}:${port}`);
          finish({ success: true });
        });
      });
    });

    socket.once('timeout', () => {
      console.error(`[printer] timeout → ${label} ${ip}:${port}`);
      finish({ success: false, error: `Connection timeout (${ip}:${port})` });
    });

    socket.once('error', (err) => {
      console.error(`[printer] connection error → ${label} ${ip}:${port}`, err.message || err);
      finish({ success: false, error: err.message || 'Connection error' });
    });

    console.log(`[printer] connecting → ${label} ${ip}:${port} ...`);
    socket.connect(port, ip);
  });
}

module.exports = {
  sendToPrinter,
};
