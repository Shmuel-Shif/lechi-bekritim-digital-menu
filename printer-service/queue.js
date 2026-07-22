/**
 * LECHAIM — Print Queue (Stage 9.0)
 * Per-printer FIFO queue: jobs for the same printer never run in parallel.
 * Kitchen and bar queues are independent (different physical printers).
 */

'use strict';

const { sendToPrinter } = require('./printer');

let jobSeq = 0;

/** @type {Map<string, { queue: object[], running: boolean }>} */
const lanes = new Map();

function getLane(printer) {
  const key = String(printer || '');
  if (!lanes.has(key)) {
    lanes.set(key, { queue: [], running: false });
  }
  return lanes.get(key);
}

function createJobId() {
  jobSeq += 1;
  return `job_${Date.now().toString(36)}_${jobSeq}`;
}

function getStatus() {
  const printers = {};
  lanes.forEach((lane, name) => {
    printers[name] = {
      pending: lane.queue.length,
      running: lane.running,
      jobs: lane.queue.map((job) => ({
        jobId: job.jobId,
        createdAt: job.createdAt,
      })),
    };
  });
  return { printers };
}

/**
 * Enqueue a print job and start the worker if idle.
 * Resolves when the job is accepted into the queue (not when printing finishes).
 *
 * @param {string} printer
 * @param {string} ticket
 * @param {{ ip?: string, port?: number } | null} printerConfig
 * @returns {{ success: true, queued: true, jobId: string, position: number, printer: string }}
 */
function enqueue(printer, ticket, printerConfig) {
  const lane = getLane(printer);
  const jobId = createJobId();
  const job = {
    jobId,
    printer,
    ticket: String(ticket),
    printerConfig: printerConfig || null,
    createdAt: new Date().toISOString(),
  };

  lane.queue.push(job);
  const position = lane.queue.length;

  console.log(`[queue] enqueued ${jobId} → ${printer} (position ${position})`);
  pump(printer);

  return {
    success: true,
    queued: true,
    jobId,
    position,
    printer,
  };
}

function pump(printer) {
  const lane = getLane(printer);
  if (lane.running) return;
  if (!lane.queue.length) return;

  lane.running = true;
  const job = lane.queue.shift();

  Promise.resolve()
    .then(() => {
      console.log(`[queue] printing ${job.jobId} → ${job.printer} (${lane.queue.length} waiting)`);
      return sendToPrinter(job.printer, job.ticket, job.printerConfig);
    })
    .then((result) => {
      if (result && result.success === true) {
        console.log(`[queue] done ${job.jobId} → ${job.printer}`);
      } else {
        console.error(`[queue] failed ${job.jobId} → ${job.printer}`, result);
      }
    })
    .catch((err) => {
      console.error(`[queue] error ${job.jobId} → ${job.printer}`, err);
    })
    .finally(() => {
      lane.running = false;
      pump(printer);
    });
}

module.exports = {
  enqueue,
  getStatus,
};
