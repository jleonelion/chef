import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemKey, placeItem } from './placement.mjs';

test('shipped defaults place common foods', () => {
  assert.equal(placeItem('Whole Milk'), 'fridge.dairy');
  assert.equal(placeItem('baby spinach'), 'fridge.produce');
  assert.equal(placeItem('bananas'), 'pantry.produce');
  assert.equal(placeItem('chicken thighs'), 'fridge.proteins');
  assert.equal(placeItem('frozen peas'), 'freezer.other');
  assert.equal(placeItem('jasmine rice'), 'pantry.grains');
  assert.equal(placeItem('mystery item'), 'pantry.other');
});

test('item keys are safe property names', () => {
  assert.equal(itemKey('Whole Milk 2%'), 'whole_milk_2');
  assert.equal(itemKey('__proto__'), 'proto');
  assert.equal(itemKey('constructor'), 'constructor_item');
  assert.equal(itemKey('!!!'), null);
});
