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
