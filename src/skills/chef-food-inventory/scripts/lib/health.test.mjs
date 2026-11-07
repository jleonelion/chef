import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';
import { checkHealth } from './health.mjs';
import { addReceipt } from './receipt.mjs';
import { ROLLUP_PATH } from './rollup.mjs';
import { STORE } from './store.mjs';

const dataRoot = () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-health-')), 'root');
  initDataRoot(root);
  addReceipt(root, { transcript: '- 1 gal whole milk — $3.49 (expires 2026-01-16)\n', source: 'text', date: '2026-01-15', trustedSenders: [], now: '2026-01-15T12:00:00.000Z' });
  return root;
};

test('a store written by Chef is healthy and reports stats', () => {
  const result = checkHealth(dataRoot(), { today: '2026-01-15', days: 3 });
  assert.deepEqual(result.problems, []);
  assert.equal(result.status, 'healthy');
  assert.deepEqual(result.stats, { items: 1, empty: 0, expired: 0, expiring_soon: 1, receipts: 1 });
});

test('a hand edit to the store is caught by the audit hash and the rollup comparison', () => {
  const root = dataRoot();
  const file = path.join(root, STORE.inventory);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"amount": 1', '"amount": 5'));
  const result = checkHealth(root, { today: '2026-01-15', days: 3 });
  assert.equal(result.status, 'problems');
  assert.ok(result.problems.some((p) => /audit/.test(p)));
  assert.ok(result.problems.some((p) => /rollup/.test(p)));
});

test('a missing purchase record and an invalid store are reported, not thrown', () => {
  const root = dataRoot();
  fs.rmSync(path.join(root, STORE.purchases), { recursive: true });
  assert.ok(checkHealth(root, { today: '2026-01-15', days: 3 }).problems.some((p) => /purchase record/.test(p)));
  fs.writeFileSync(path.join(root, STORE.inventory), '{"lastUpdated": 1}');
  fs.rmSync(path.join(root, ROLLUP_PATH));
  const result = checkHealth(root, { today: '2026-01-15', days: 3 });
  assert.equal(result.status, 'problems');
  assert.ok(result.problems.some((p) => /invalid/.test(p)));
});
