import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { listItems, loadInventory, STORE, validateInventory } from './store.mjs';

const valid = {
  lastUpdated: '2026-01-15T12:00:00.000Z',
  fridge: { dairy: { milk: { name: 'milk', amount: 1, unit: 'gal', expires: '2026-01-22' } } },
  pantry: { grains: { rice: { amount: 2, unit: 'lb' } } },
};

test('a valid inventory has no problems and lists its items by path', () => {
  assert.deepEqual(validateInventory(valid), []);
  assert.deepEqual(listItems(valid).map((i) => [i.path, i.name, i.amount]), [
    ['pantry.grains.rice', 'rice', 2],
    ['fridge.dairy.milk', 'milk', 1],
  ]);
});

test('reports bad amounts, dates and unknown locations', () => {
  const problems = validateInventory({
    lastUpdated: 'nope',
    garage: {},
    fridge: { dairy: { milk: { amount: -1, unit: 'gal', expires: '2026-02-30' } } },
  });
  assert.equal(problems.length, 4);
});

test('a missing store loads as empty; a broken one throws', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-inv-'));
  assert.deepEqual(listItems(loadInventory(root)), []);
  fs.mkdirSync(path.join(root, path.dirname(STORE.inventory)), { recursive: true });
  fs.writeFileSync(path.join(root, STORE.inventory), '{"lastUpdated": 1}');
  assert.throws(() => loadInventory(root), /lastUpdated/);
});
