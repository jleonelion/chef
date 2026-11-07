import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { git } from '../../../../lib/git.mjs';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';
import { addReceipt } from './receipt.mjs';
import { renderRollup, ROLLUP_PATH } from './rollup.mjs';
import { listItems, loadInventory, STORE } from './store.mjs';

const dataRoot = () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-receipt-')), 'root');
  initDataRoot(root);
  return root;
};
const transcript = '- 2 lb bananas — $1.38\n- 1 gal whole milk — $3.49 (expires 2026-01-22)\n';
const base = { transcript, source: 'text', date: '2026-01-15', trustedSenders: [], now: '2026-01-15T12:00:00.000Z' };
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('receipt text becomes inventory items, audit, ledger, purchase, raw and rollup in one commit', () => {
  const root = dataRoot();
  const result = addReceipt(root, base);
  assert.equal(result.status, 'added');
  assert.deepEqual(listItems(loadInventory(root)).map((i) => i.path).sort(), ['fridge.dairy.whole_milk', 'fridge.produce.bananas']);
  const audit = read(root, STORE.audit).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(audit.length, 1);
  assert.equal(audit[0].before_hash, null);
  assert.equal(JSON.parse(read(root, STORE.ledger)).receipts[result.receipt_id].items, 2);
  assert.ok(read(root, `knowledge/raw/receipts/2026-01-15-${result.receipt_id}.txt`).includes('bananas'));
  assert.ok(read(root, ROLLUP_PATH).includes('- bananas: 2 lb'));
  assert.equal(git(root, ['status', '--porcelain']), '');
  assert.match(git(root, ['log', '-1', '--format=%s']), /receipt 2026-01-15/);
});

test('the same receipt twice is a duplicate and changes nothing', () => {
  const root = dataRoot();
  addReceipt(root, base);
  const head = git(root, ['rev-parse', 'HEAD']);
  assert.equal(addReceipt(root, { ...base, now: '2026-01-16T00:00:00.000Z' }).status, 'duplicate');
  assert.equal(git(root, ['rev-parse', 'HEAD']), head);
});

test('a forwarded email from an untrusted sender is refused before anything is read or written', () => {
  const root = dataRoot();
  const result = addReceipt(root, { ...base, source: 'email', from: 'Market <orders@example.com>', trustedSenders: ['receipts@example.com'] });
  assert.equal(result.status, 'refused');
  assert.equal(fs.existsSync(path.join(root, STORE.inventory)), false);
});

test('a forwarded email from a trusted sender is accepted and the sender is not stored', () => {
  const root = dataRoot();
  const result = addReceipt(root, { ...base, source: 'email', from: 'Market <Receipts@Example.com>', id: '<abc@example.com>', trustedSenders: ['receipts@example.com'] });
  assert.equal(result.status, 'added');
  assert.throws(() => git(root, ['grep', '-i', '-q', 'receipts@example.com', 'HEAD']), 'sender address must not be committed');
});

test('one unreadable line refuses the whole receipt', () => {
  const root = dataRoot();
  const result = addReceipt(root, { ...base, transcript: `${transcript}TOTAL $4.87\n` });
  assert.equal(result.status, 'invalid-input');
  assert.equal(result.rejected[0].lineNumber, 3);
  assert.equal(fs.existsSync(path.join(root, STORE.inventory)), false);
});

test('the rollup page matches the store after successive receipts', () => {
  const root = dataRoot();
  addReceipt(root, base);
  addReceipt(root, { ...base, transcript: '- 1 gal whole milk — $3.49\n- 3 ct avocados — $4.50\n', now: '2026-01-16T09:00:00.000Z', date: '2026-01-16' });
  const expected = renderRollup(loadInventory(root));
  assert.ok(read(root, ROLLUP_PATH).endsWith(expected.body));
  assert.equal(loadInventory(root).fridge.dairy.whole_milk.amount, 2);
});

test('commitInventory refuses an invalid inventory', async () => {
  const { commitInventory } = await import('./commit.mjs');
  const root = dataRoot();
  const result = commitInventory(root, { inventory: { lastUpdated: 'x' }, action: 'edit', details: {}, message: 'm' });
  assert.equal(result.status, 'invalid-input');
  assert.equal(fs.existsSync(path.join(root, STORE.inventory)), false);
});
