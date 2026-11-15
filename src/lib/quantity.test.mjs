import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertQuantity, displayQuantity, quantityDimension } from './quantity.mjs';

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

const shown = (amount, unit, system, options) => displayQuantity(amount, unit, system, options).text;

test('US volume climbs tsp -> tbsp -> cup -> qt, largest unit keeping the amount >= 1', () => {
  assert.equal(shown(2, 'tsp', 'us'), '2 tsp');
  assert.equal(shown(3, 'tsp', 'us'), '1 tbsp');
  assert.equal(shown(15, 'tbsp', 'us'), '15 tbsp');
  assert.equal(shown(16, 'tbsp', 'us'), '1 cup');
  assert.equal(shown(3.5, 'cup', 'us'), '3 1/2 cups');
  assert.equal(shown(4, 'cup', 'us'), '1 qt');
  assert.equal(shown(1, 'gal', 'us'), '4 qt');
  assert.equal(shown(500, 'ml', 'us'), '2 1/4 cups');
});

test('US rounds up: 1/2 tsp and tbsp, 1/4 cup, qt and lb, whole oz', () => {
  assert.equal(shown(0.3, 'tsp', 'us'), '1/2 tsp');
  assert.equal(shown(1.1, 'tbsp', 'us'), '1 1/2 tbsp');
  assert.equal(shown(1.01, 'cup', 'us'), '1 1/4 cups');
  assert.equal(shown(1.6, 'qt', 'us'), '1 3/4 qt');
  assert.equal(shown(12.2, 'oz', 'us'), '13 oz');
  assert.equal(shown(500, 'g', 'us'), '1 1/4 lb');
  assert.equal(shown(0.75, 'lb', 'us'), '12 oz');
});

test('rounding up across a ladder boundary moves to the bigger unit', () => {
  assert.equal(shown(2.9, 'tsp', 'us'), '1 tbsp');
  assert.equal(shown(15.8, 'tbsp', 'us'), '1 cup');
  assert.equal(shown(3.9, 'cup', 'us'), '1 qt');
  assert.equal(shown(15.5, 'oz', 'us'), '1 lb');
  assert.equal(shown(998, 'g', 'metric'), '1 kg');
});

test('metric climbs ml -> l and g -> kg, rounding up 5 below 100, 25 below 1000, 0.1 above', () => {
  assert.equal(shown(97, 'g', 'metric'), '100 g');
  assert.equal(shown(101, 'g', 'metric'), '125 g');
  assert.equal(shown(999, 'ml', 'metric'), '1 l');
  assert.equal(shown(1001, 'g', 'metric'), '1.1 kg');
  assert.equal(shown(1, 'lb', 'metric'), '475 g');
  assert.equal(shown(2, 'cup', 'metric'), '475 ml');
  assert.equal(shown(1.5, 'qt', 'metric'), '1.5 l');
});

test('spoons stay spoons below 1/4 cup in both systems; metric uses ml otherwise', () => {
  assert.equal(shown(2, 'tbsp', 'metric'), '2 tbsp');
  assert.equal(shown(7, 'tsp', 'metric'), '2 1/2 tbsp');
  assert.equal(shown(4, 'tbsp', 'metric'), '60 ml');
  assert.equal(shown(30, 'ml', 'metric'), '30 ml');
  assert.equal(shown(10, 'tsp', 'metric', { spoon: false }), '50 ml');
  assert.equal(shown(30, 'ml', 'metric', { spoon: true }), '2 1/2 tbsp');
  assert.equal(shown(7, 'tsp', 'us'), '2 1/2 tbsp');
});

test('US amounts print as ASCII fractions, never glyphs; display also returns amount and unit', () => {
  assert.deepEqual(displayQuantity(0.75, 'lb', 'us'), { amount: 12, unit: 'oz', text: '12 oz' });
  assert.deepEqual(displayQuantity(1.5, 'cup', 'us'), { amount: 1.5, unit: 'cup', text: '1 1/2 cups' });
  assert.equal(shown(0.25, 'cup', 'us'), '4 tbsp');
  assert.equal(shown(1, 'cup', 'us'), '1 cup');
  assert.doesNotMatch(shown(2.75, 'lb', 'us'), /[½¼¾]/);
  assert.equal(shown(2.75, 'lb', 'us'), '2 3/4 lb');
});

test('count and unknown units keep their unit and are never converted', () => {
  assert.deepEqual(displayQuantity(1.5, 'bunch', 'metric'), { amount: 1.5, unit: 'bunch', text: '1.5 bunch' });
  assert.equal(shown(2, 'can', 'us'), '2 can');
  assert.equal(shown(1 / 3, 'handful', 'us'), '0.33 handful');
});
