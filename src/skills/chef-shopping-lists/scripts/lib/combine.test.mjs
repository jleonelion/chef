import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combineLines, subtractInventory } from './combine.mjs';

const use = (line, multiplier = 1, recipe = 'r') => ({ line, multiplier, recipe });

test('same item in compatible units combines into the first unit, scaled per meal', () => {
  const { items } = combineLines([use('1 cup rice', 2, 'a'), use('4 tbsp rice', 1, 'b')]);
  assert.deepEqual(items, [{ item: 'rice', amount: 2.25, unit: 'cup', recipes: ['a', 'b'] }]);
});

test('units that cannot be converted are listed separately, never guessed', () => {
  const { items } = combineLines([use('1 bunch spinach'), use('150 g spinach'), use('2 clove garlic'), use('1 head garlic')]);
  assert.deepEqual(items.map(({ item, amount, unit }) => [item, amount, unit]), [
    ['spinach', 1, 'bunch'],
    ['spinach', 150, 'g'],
    ['garlic', 2, 'clove'],
    ['garlic', 1, 'head'],
  ]);
});

test('a bare count is "each"; lines with no quantity or a trace amount are unquantified', () => {
  const { items, unquantified } = combineLines([use('1 onion'), use('3 onion, diced'), use('salt to taste'), use('1 pinch nutmeg'), use('olive oil')]);
  assert.deepEqual(items, [{ item: 'onion', amount: 4, unit: 'each', recipes: ['r'] }]);
  assert.deepEqual(unquantified.map((u) => u.item), ['salt', 'nutmeg', 'olive oil']);
});

const stock = (name, amount, unit) => ({ name, amount, unit, path: `pantry.x.${name}` });

test('inventory is subtracted in convertible units; fully covered items move to covered', () => {
  const { items } = combineLines([use('500 g spaghetti'), use('3 can chickpeas'), use('2 cup milk')]);
  const result = subtractInventory(items, [stock('spaghetti', 1, 'kg'), stock('chickpeas', 1, 'can'), stock('milk', 0.25, 'cup')]);
  assert.deepEqual(result.items.map(({ item, amount, unit }) => [item, amount, unit]), [['chickpeas', 2, 'can'], ['milk', 1.75, 'cup']]);
  assert.deepEqual(result.covered.map((c) => c.item), ['spaghetti']);
});

test('inventory in a unit that cannot be converted is noted, not subtracted', () => {
  const { items } = combineLines([use('150 g spinach')]);
  const result = subtractInventory(items, [stock('spinach', 1, 'bunch')]);
  assert.deepEqual(result.items, [{ item: 'spinach', amount: 150, unit: 'g', recipes: ['r'], on_hand: { amount: 1, unit: 'bunch' } }]);
});
