/**
 * Kitchen horizontal order board — pure logic / source checks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function closedBoardEntries(board, openEntryIds, closedTailIds) {
  const open = new Set(openEntryIds.map(String));
  const tail = new Set(closedTailIds.map(String));
  const regular = board.filter((entry) => {
    const sid = String(entry?.order?.sessionId || '');
    return sid && !open.has(sid) && !tail.has(sid);
  });
  const parked = closedTailIds
    .map((id) => board.find((e) => String(e.order?.sessionId) === String(id)))
    .filter(Boolean);
  return [...regular, ...parked];
}

function run() {
  let open = [];
  open.push('s1');
  open.push('s2');
  open.push('s3');
  assert.deepEqual(open, ['s1', 's2', 's3']);

  // X parks at end of closed tail
  open = open.filter((id) => id !== 's2');
  let closedTail = ['s2'];
  const board = [
    { order: { sessionId: 's1' } },
    { order: { sessionId: 's2' } },
    { order: { sessionId: 's3' } },
    { order: { sessionId: 's4' } },
  ];
  const closed = closedBoardEntries(board, open, closedTail);
  assert.deepEqual(
    closed.map((e) => e.order.sessionId),
    ['s4', 's2'],
    'closed: natural then parked-at-end'
  );
  assert.deepEqual(open, ['s1', 's3'], 'open keeps remaining');

  const src = fs.readFileSync(path.join(root, 'js/kitchen-admin.js'), 'utf8');
  assert.match(src, /kt-order-rail/, 'order rail in JS');
  assert.match(src, /closedTailIds/, 'closed tail park list');
  assert.match(src, /showOverflowToast/, 'overflow toast');
  assert.match(src, /notifyOverflowIfNeeded/, 'overflow detect');
  assert.doesNotMatch(src, /kt-tables--strip/, 'old strip removed from JS');
  assert.doesNotMatch(src, /function renderStrip/, 'renderStrip removed');

  const html = fs.readFileSync(path.join(root, 'kitchen.html'), 'utf8');
  assert.match(html, /id="kt-order-rail"/, 'order rail in HTML');
  assert.match(html, /id="kt-overflow-toast"/, 'overflow toast in HTML');
  assert.doesNotMatch(html, /kt-tables--strip/, 'strip removed from HTML');
  assert.doesNotMatch(html, /id="kt-tables-grid"/, 'old grid removed');

  const css = fs.readFileSync(path.join(root, 'css/kitchen-tablet.css'), 'utf8');
  assert.match(css, /\.kt-order-rail/, 'order rail styles');
  assert.match(css, /\.kt-overflow-toast/, 'overflow toast styles');
  assert.doesNotMatch(css, /\.kt-tables--strip/, 'strip styles removed');

  console.log('test-kitchen-multi-open: OK');
}

run();
