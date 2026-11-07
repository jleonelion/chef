import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIngredientLine } from './ingredient-line.mjs';

const parsed = (line) => {
  const { amount, unit, item, size, packageGrams, trace } = parseIngredientLine(line);
  return { amount, unit, item, size, packageGrams, trace };
};
const base = { amount: null, unit: null, size: null, packageGrams: null, trace: false };

test('reads amount, unit and the food, dropping preparation notes', () => {
  assert.deepEqual(parsed('200 g spaghetti'), { ...base, amount: 200, unit: 'g', item: 'spaghetti' });
  assert.deepEqual(parsed('2 cloves garlic, minced'), { ...base, amount: 2, unit: 'clove', item: 'garlic' });
  assert.deepEqual(parsed('1 1/2 cups of red lentils (rinsed)'), { ...base, amount: 1.5, unit: 'cup', item: 'red lentils' });
  assert.deepEqual(parsed('½ tsp finely chopped fresh thyme'), { ...base, amount: 0.5, unit: 'tsp', item: 'thyme' });
  assert.deepEqual(parsed('2 Tablespoons olive oil'), { ...base, amount: 2, unit: 'tbsp', item: 'olive oil' });
});

test('counts without a unit keep their size word', () => {
  assert.deepEqual(parsed('2 large eggs'), { ...base, amount: 2, item: 'eggs', size: 'large' });
  assert.deepEqual(parsed('1 onion, diced'), { ...base, amount: 1, item: 'onion' });
});

test('ranges use the low end; package weights are kept', () => {
  assert.deepEqual(parsed('2-3 carrots'), { ...base, amount: 2, item: 'carrots' });
  assert.deepEqual(parsed('1 (15 oz) can chickpeas, drained'), { ...base, amount: 1, unit: 'can', item: 'chickpeas', packageGrams: 425.24 });
});

test('trace amounts and lines without an amount', () => {
  assert.deepEqual(parsed('salt and pepper to taste'), { ...base, item: 'salt and pepper', trace: true });
  assert.deepEqual(parsed('1 pinch saffron'), { ...base, amount: 1, unit: 'pinch', item: 'saffron', trace: true });
  assert.deepEqual(parsed('olive oil for frying'), { ...base, item: 'olive oil for frying' });
});
