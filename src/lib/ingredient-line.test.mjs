import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measuredLead, parseIngredientLine } from './ingredient-line.mjs';

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

test('spelled-out counts and hyphenated package sizes', () => {
  assert.deepEqual(parsed('One 15-ounce can chickpeas, drained'), { ...base, amount: 1, unit: 'can', item: 'chickpeas', packageGrams: 425.24 });
  assert.deepEqual(parsed('Two 15-ounce cans cannellini beans'), { ...base, amount: 2, unit: 'can', item: 'cannellini beans', packageGrams: 425.24 });
  assert.deepEqual(parsed('A 400-g can crushed tomatoes'), { ...base, amount: 1, unit: 'can', item: 'crushed tomatoes', packageGrams: 400 });
  assert.deepEqual(parsed('a disc of butter'), { ...base, item: 'a disc of butter' });
});

test('approximate qualifiers keep the stated amount', () => {
  assert.deepEqual(parsed('About 12 basil leaves'), { ...base, amount: 12, item: 'basil leaves' });
  assert.deepEqual(parsed('Scant 1 teaspoon fine salt'), { ...base, amount: 1, unit: 'tsp', item: 'fine salt' });
  assert.deepEqual(parsed('Up to ½ cup pasta water'), { ...base, amount: 0.5, unit: 'cup', item: 'pasta water' });
});

test('a pinch or dash without a number is a trace amount', () => {
  assert.deepEqual(parsed('Pinch of sea salt'), { ...base, amount: 1, unit: 'pinch', item: 'sea salt', trace: true });
  assert.deepEqual(parsed('a dash hot sauce'), { ...base, amount: 1, unit: 'dash', item: 'hot sauce', trace: true });
});

test('"plus" adds a second amount of the same kind and never reaches the item', () => {
  assert.deepEqual(parsed('1 tablespoon plus 1 teaspoon tamari'), { ...base, amount: 1.33, unit: 'tbsp', item: 'tamari' });
  assert.deepEqual(parsed('1 cup plus 2 tbsp flour'), { ...base, amount: 1.13, unit: 'cup', item: 'flour' });
  assert.deepEqual(parsed('1 lb plus 4 oz potatoes'), { ...base, amount: 1.25, unit: 'lb', item: 'potatoes' });
  assert.deepEqual(parsed('2 cups plus 1 pinch salt'), { ...base, amount: 2, unit: 'cup', item: 'salt' });
});

test('measuredLead returns the leading weight or volume as written, with its amount and unit', () => {
  assert.deepEqual(measuredLead('1 cup milk'), { text: '1 cup', amount: 1, unit: 'cup' });
  assert.deepEqual(measuredLead('1 1/2 cups of red lentils'), { text: '1 1/2 cups', amount: 1.5, unit: 'cup' });
  assert.deepEqual(measuredLead('½ tsp thyme'), { text: '½ tsp', amount: 0.5, unit: 'tsp' });
  assert.deepEqual(measuredLead('1½ lb. potatoes'), { text: '1½ lb.', amount: 1.5, unit: 'lb' });
  assert.deepEqual(measuredLead('400g crushed tomatoes'), { text: '400g', amount: 400, unit: 'g' });
  assert.deepEqual(measuredLead('1 cup plus 2 tbsp flour'), { text: '1 cup plus 2 tbsp', amount: 1.13, unit: 'cup' });
});

test('measuredLead is null for counts, ranges, packages, mixed sums and unmeasured lines', () => {
  for (const line of ['2 cloves garlic', '1 onion', '2-3 cups stock', '2 to 3 cups stock', '1 (15 oz) can chickpeas', '2 cups plus 1 pinch salt', 'salt to taste', 'About 2 cups flour', 'Juice of 1 lemon']) {
    assert.equal(measuredLead(line), null, line);
  }
});
