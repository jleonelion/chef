import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertQuantity, quantityDimension } from './quantity.mjs';

test('quantity conversion stays within measurement dimensions', () => {
  assert.equal(convertQuantity(500, 'g', 'kg'), 0.5);
  assert.equal(convertQuantity(1, 'cup', 'tbsp'), 16);
  assert.equal(convertQuantity(1, 'dozen', 'each'), 12);
  assert.equal(convertQuantity(1, 'cup', 'g'), null);
  assert.equal(quantityDimension('cups'), 'volume');
});

test('count units convert only to themselves or between each and dozen', () => {
  assert.equal(convertQuantity(2, 'bunch', 'bunch'), 2);
  assert.equal(convertQuantity(6, 'each', 'dozen'), 0.5);
  assert.equal(convertQuantity(0.5, 'dozen', 'each'), 6);
  assert.equal(convertQuantity(1, 'bunch', 'each'), null);
  assert.equal(convertQuantity(1, 'clove', 'head'), null);
});
