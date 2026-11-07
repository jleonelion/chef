import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyItems } from './apply.mjs';
import { validateInventory } from './store.mjs';

const now = '2026-01-15T12:00:00.000Z';
const base = { lastUpdated: '2026-01-10T00:00:00.000Z', fridge: { dairy: { whole_milk: { name: 'whole milk', amount: 1, unit: 'gal', expires: '2026-01-18' } } } };
const item = (over) => ({ name: 'bananas', quantity: 2, unit: 'lb', price: 1, expires: null, target: null, lineNumber: 1, ...over });

test('adds new items at their default place and leaves the input untouched', () => {
  const { inventory, changes, rejected } = applyItems(base, [item()], { date: '2026-01-15', now });
  assert.deepEqual(rejected, []);
  assert.deepEqual(changes, [{ path: 'fridge.produce.bananas', action: 'added', amount: 2, unit: 'lb' }]);
  assert.deepEqual(inventory.fridge.produce.bananas, { name: 'bananas', amount: 2, unit: 'lb', purchased: '2026-01-15', updated: now });
  assert.equal(base.fridge.produce, undefined);
  assert.equal(inventory.lastUpdated, now);
  assert.deepEqual(validateInventory(inventory), []);
});

test('adds to an existing entry in the same unit and keeps the earliest expiry', () => {
  const { inventory, changes } = applyItems(base, [item({ name: 'whole milk', quantity: 1, unit: 'gal', expires: '2026-01-25' })], { date: '2026-01-15', now });
  assert.equal(inventory.fridge.dairy.whole_milk.amount, 2);
  assert.equal(inventory.fridge.dairy.whole_milk.expires, '2026-01-18');
  assert.equal(changes[0].action, 'updated');
});

test('honours an explicit target and a two-part placement', () => {
  const { inventory } = applyItems(base, [item({ name: 'milk', quantity: 1, unit: 'gal', target: 'fridge.dairy.whole_milk' }), item({ name: 'peas', target: 'freezer.veg' })], { date: '2026-01-15', now });
  assert.equal(inventory.fridge.dairy.whole_milk.amount, 2);
  assert.equal(inventory.freezer.veg.peas.amount, 2);
});

test('rejects a unit mismatch instead of converting', () => {
  const { rejected } = applyItems(base, [item({ name: 'whole milk', quantity: 2, unit: 'l', lineNumber: 4 })], { date: '2026-01-15', now });
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].lineNumber, 4);
  assert.match(rejected[0].reason, /gal/);
});

test('reserved property names in a target are rejected, not followed', () => {
  const { rejected } = applyItems(base, [item({ target: 'pantry.constructor.x' }), item({ target: 'pantry.other.__proto__' }), item({ target: 'fridge.hasownproperty' })], { date: '2026-01-15', now });
  assert.equal(rejected.length, 3);
  assert.equal(Object.hasOwn(Object, 'x'), false);
});
