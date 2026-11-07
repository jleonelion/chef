import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';
import { editItem } from './edit.mjs';
import { loadInventory, STORE } from './store.mjs';

const dataRoot = () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-edit-')), 'root');
  initDataRoot(root);
  return root;
};
const now = '2026-01-15T12:00:00.000Z';

test('creates, updates and removes an item, auditing each change', () => {
  const root = dataRoot();
  assert.equal(editItem(root, { path: 'fridge.dairy.eggs', amount: 12, unit: 'each', reason: 'counted', now }).status, 'saved');
  assert.equal(editItem(root, { path: 'fridge.dairy.eggs', amount: 6, expires: '2026-01-30', now }).status, 'saved');
  assert.deepEqual(loadInventory(root).fridge.dairy.eggs, { name: 'eggs', amount: 6, unit: 'each', updated: now, expires: '2026-01-30' });
  assert.equal(editItem(root, { path: 'fridge.dairy.eggs', remove: true, reason: 'spoiled', now }).status, 'saved');
  assert.equal(loadInventory(root).fridge.dairy.eggs, undefined);
  const audit = fs.readFileSync(path.join(root, STORE.audit), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(audit.map((a) => a.action), ['edit', 'edit', 'remove']);
  assert.equal(audit[2].details.reason, 'spoiled');
});

test('rejects bad input without writing', () => {
  const root = dataRoot();
  assert.equal(editItem(root, { path: 'garage.x.y', amount: 1, unit: 'each', now }).status, 'invalid-input');
  assert.equal(editItem(root, { path: 'fridge.dairy.eggs', amount: 1, now }).status, 'invalid-input');
  assert.equal(editItem(root, { path: 'fridge.dairy.eggs', amount: -1, unit: 'each', now }).status, 'invalid-input');
  assert.equal(editItem(root, { path: 'fridge.dairy.eggs', remove: true, now }).status, 'invalid-input');
  assert.equal(fs.existsSync(path.join(root, STORE.inventory)), false);
});
