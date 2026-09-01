/**
 * LECHAIM — Optional cloud print-job poller.
 * Pulls pending rows from Supabase and feeds the existing local queue.
 * Does not change POST /print. If .env is missing, this is a no-op.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { enqueue } = require('./queue');

const POLL_MS = 2000;
const CLAIM_LIMIT = 5;
const REST_TIMEOUT_MS = 15000;

let printersConfig = null;
let restUrl = '';
let serviceRoleKey = '';
let pollTimer = null;
let tickBusy = false;
let lastErrorLogAt = 0;

function envPath() {
  return path.join(__dirname, '.env');
}

function readEnvText(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le');
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf);
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  return buf.toString('utf8');
}

function loadDotEnv() {
  const filePath = envPath();
  try {
    require('dotenv').config({ path: filePath });
  } catch (_) {
    /* ignore missing dotenv; parser below still runs */
  }
  if (!fs.existsSync(filePath)) return;
  let text = readEnvText(filePath);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

function restHeaders() {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function rest(method, pathname, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REST_TIMEOUT_MS);
  try {
    const res = await fetch(`${restUrl}${pathname}`, {
      method,
      headers: restHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = text;
      }
    }
    if (!res.ok) {
      const msg = typeof data === 'object' && data
        ? (data.message || data.error || text)
        : text;
      throw new Error(`Supabase ${method} ${pathname} ${res.status}: ${msg}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

function logSparseError(err) {
  const now = Date.now();
  if (now - lastErrorLogAt < 30000) return;
  lastErrorLogAt = now;
  console.error('[cloud-jobs]', err?.message || err);
}

async function claimJobs() {
  const rows = await rest('POST', '/rest/v1/rpc/claim_print_jobs', {
    p_limit: CLAIM_LIMIT,
  });
  return Array.isArray(rows) ? rows : [];
}

async function finishJob(id, status, errorMessage) {
  const payload = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'printed') {
    payload.printed_at = new Date().toISOString();
    payload.error = null;
  } else {
    payload.error = String(errorMessage || 'print failed').slice(0, 500);
  }

  let lastErr;
  for (let i = 0; i < 3; i += 1) {
    try {
      await rest('PATCH', `/rest/v1/print_jobs?id=eq.${id}`, payload);
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

async function handleJob(job, config) {
  const id = job.id;
  const printer = job.printer === 'bar' ? 'bar' : job.printer === 'kitchen' ? 'kitchen' : null;
  if (!printer) {
    await finishJob(id, 'failed', `invalid printer: ${job.printer}`);
    return;
  }

  const ticket = job.ticket;
  if (ticket == null || typeof ticket !== 'string' || !ticket.length) {
    await finishJob(id, 'failed', 'empty ticket');
    return;
  }

  const printerConfig = config.printers?.[printer] || null;

  try {
    const result = enqueue(printer, ticket, printerConfig);
    if (!result || result.success !== true) {
      await finishJob(id, 'failed', 'local enqueue rejected');
      return;
    }
    await finishJob(id, 'printed');
    console.log(`[cloud-jobs] printed ${id} → ${printer} (${result.jobId})`);
  } catch (err) {
    const message = err?.message || 'enqueue failed';
    console.error(`[cloud-jobs] failed ${id} → ${printer}`, message);
    try {
      await finishJob(id, 'failed', message);
    } catch (updateErr) {
      console.error('[cloud-jobs] could not mark failed', id, updateErr?.message || updateErr);
    }
  }
}

async function tick() {
  if (tickBusy) return;
  tickBusy = true;
  try {
    const jobs = await claimJobs();
    for (const job of jobs) {
      await handleJob(job, printersConfig);
    }
  } catch (err) {
    logSparseError(err);
  } finally {
    tickBusy = false;
  }
}

function start(config) {
  loadDotEnv();
  printersConfig = config || {};

  restUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!restUrl || !serviceRoleKey || serviceRoleKey.includes('paste-service-role')) {
    const filePath = envPath();
    let reason = `missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (looked at ${filePath})`;
    if (!fs.existsSync(filePath)) {
      reason = `.env not found at ${filePath}`;
    } else if (fs.statSync(filePath).size === 0) {
      reason = `.env is empty at ${filePath}`;
    } else if (serviceRoleKey.includes('paste-service-role')) {
      reason = 'placeholder SUPABASE_SERVICE_ROLE_KEY — paste the real service_role key';
    }
    console.log(`[cloud-jobs] skipped — ${reason} (local /print still works)`);
    return;
  }

  if (pollTimer) return;
  console.log(`[cloud-jobs] polling print_jobs every ${POLL_MS / 1000}s`);
  tick();
  pollTimer = setInterval(tick, POLL_MS);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();
}

module.exports = { start };
