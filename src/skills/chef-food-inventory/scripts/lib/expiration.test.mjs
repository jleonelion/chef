import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expiringItems } from './expiration.mjs';

const inventory = {
  lastUpdated: '2026-01-15T00:00:00.000Z',
  fridge: {
    dairy: { milk: { amount: 1, unit: 'gal', expires: '2026-01-18' }, yogurt: { amount: 2, unit: 'each', expires: '2026-01-14' } },
    produce: { kale: { amount: 1, unit: 'bunch', expires: '2026-02-01' }, apples: { amount: 0, unit: 'each', expires: '2026-01-16' } },
  },
  pantry: { grains: { rice: { amount: 2, unit: 'lb' } } },
};

test('splits stocked items into expired and expiring within the window, soonest first', () => {
  const result = expiringItems(inventory, { today: '2026-01-15', days: 7 });
  assert.deepEqual(result.expired.map((i) => [i.path, i.days_left]), [['fridge.dairy.yogurt', -1]]);
  assert.deepEqual(result.soon.map((i) => [i.path, i.days_left]), [['fridge.dairy.milk', 3]]);
});
