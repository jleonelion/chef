import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DAY_MS } from '../diagnostics/trace.mjs';
import { listReceipts, saveReceipt, saveToOutbox } from './store.mjs';

const REPORT_ID = 'a0d56f28-88d4-45f2-8ab0-3993ac31d370';

function sentDaysAgo(days) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-store-'));
  const sent = new Date(Date.now() - days * DAY_MS);
  const receipt = path.join(root, saveReceipt(root, { report_id: REPORT_ID, receipt_secret: 'x'.repeat(40) }, { now: sent }));
  const outbox = path.join(root, saveToOutbox(root, '{}', { nonce: 'nonce-1234', now: sent }));
  for (const file of [receipt, outbox]) fs.utimesSync(file, sent, sent);
  return { root, receipt, outbox };
}

test('a receipt outlives the 14-day outbox so the report can be deleted while intake keeps it', () => {
  const { root, receipt, outbox } = sentDaysAgo(20);

  assert.deepEqual(listReceipts(root).map((r) => r.report_id), [REPORT_ID]);
  assert.equal(fs.existsSync(receipt), true);
  assert.equal(fs.existsSync(outbox), false);
});

test('a receipt older than intake retention (90 days) is pruned', () => {
  const { root, receipt } = sentDaysAgo(91);

  assert.deepEqual(listReceipts(root), []);
  assert.equal(fs.existsSync(receipt), false);
});
