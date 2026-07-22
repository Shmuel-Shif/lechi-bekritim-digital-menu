/**
 * LECHAIM Print Service
 * Local HTTP server — accepts print jobs into a per-printer queue.
 *
 * POST http://localhost:3001/print
 * Body: { "printer": "kitchen" | "bar", "ticket": "..." }
 *
 * Flow: Website → Service → Queue → Printer (one job at a time per printer)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { enqueue, getStatus } = require('./queue');

const PORT = 3001;
const HOST = '127.0.0.1';

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error('[print-service] failed to load config.json', err);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    sendJson(res, 200, {
      service: 'lechaim-print-service',
      status: 'ok',
      endpoint: 'POST /print',
      queue: getStatus(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/queue') {
    sendJson(res, 200, {
      success: true,
      queue: getStatus(),
    });
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/print') {
    sendJson(res, 404, { success: false, error: 'Not found. Use POST /print' });
    return;
  }

  let payload;
  try {
    const raw = await readBody(req);
    payload = raw ? JSON.parse(raw) : {};
  } catch (err) {
    sendJson(res, 400, { success: false, error: 'Invalid JSON body' });
    return;
  }

  const printer = payload.printer;
  const ticket = payload.ticket;

  if (printer !== 'kitchen' && printer !== 'bar') {
    sendJson(res, 400, {
      success: false,
      error: 'printer must be "kitchen" or "bar"',
    });
    return;
  }

  if (ticket == null || typeof ticket !== 'string') {
    sendJson(res, 400, {
      success: false,
      error: 'ticket must be a string',
    });
    return;
  }

  const printerConfig = config.printers?.[printer] || null;

  try {
    const result = enqueue(printer, ticket, printerConfig);
    sendJson(res, 200, result);
  } catch (err) {
    console.error('[print-service] enqueue failed', err);
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Enqueue failed',
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LECHAIM Print Service listening on http://${HOST}:${PORT}`);
  console.log('POST /print  → enqueue (FIFO per printer)');
  console.log('GET  /queue  → queue status');
  console.log('Printers (config only — not connected yet):');
  console.log(`  kitchen → ${config.printers.kitchen.ip}:${config.printers.kitchen.port}`);
  console.log(`  bar     → ${config.printers.bar.ip}:${config.printers.bar.port}`);
});
