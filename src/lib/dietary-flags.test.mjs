import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIETARY_FLAGS, dietaryFlags } from './dietary-flags.mjs';

test('the flag set is the US major allergens plus gluten, nuts split', () => {
  assert.deepEqual(DIETARY_FLAGS, [
    'contains-dairy', 'contains-egg', 'contains-fish', 'contains-gluten', 'contains-peanuts',
    'contains-sesame', 'contains-shellfish', 'contains-soy', 'contains-tree-nuts', 'contains-wheat',
  ]);
});

test('flags each allergen named in the ingredient lines, sorted', () => {
  assert.deepEqual(dietaryFlags(['200 g spaghetti', '30 g parmesan', '2 eggs']), ['contains-dairy', 'contains-egg', 'contains-gluten', 'contains-wheat']);
  assert.deepEqual(dietaryFlags(['1 tbsp soy sauce', '1 tsp toasted sesame oil', '200 g shrimp']), ['contains-gluten', 'contains-sesame', 'contains-shellfish', 'contains-soy', 'contains-wheat']);
  assert.deepEqual(dietaryFlags(['2 tbsp tahini', '1 anchovy fillet', '1 tbsp worcestershire sauce']), ['contains-fish', 'contains-sesame']);
  assert.deepEqual(dietaryFlags(['1 cup rolled oats', '1 tbsp barley malt']), ['contains-gluten']);
});

test('tree nuts and peanuts are separate; generic nuts mean both', () => {
  assert.deepEqual(dietaryFlags(['2 tbsp peanut butter']), ['contains-peanuts']);
  assert.deepEqual(dietaryFlags(['50 g walnuts', '1/4 cup basil pesto']), ['contains-dairy', 'contains-tree-nuts']);
  assert.deepEqual(dietaryFlags(['1/2 cup mixed nuts']), ['contains-peanuts', 'contains-tree-nuts']);
});

test('look-alike ingredients do not raise a flag', () => {
  assert.deepEqual(dietaryFlags(['1 eggplant', '1 tsp nutmeg', '400 ml coconut milk', '1 tbsp buckwheat', '1 butternut squash', '1/2 tsp cream of tartar']), []);
  assert.deepEqual(dietaryFlags(['1 cup almond milk']), ['contains-tree-nuts']);
  assert.deepEqual(dietaryFlags(['1 cup almond flour']), ['contains-tree-nuts']);
});

test('"-free" wording is a label claim Chef cannot verify, so the flag stays (fail closed)', () => {
  assert.deepEqual(dietaryFlags(['200 g gluten-free spaghetti']), ['contains-gluten', 'contains-wheat']);
  assert.deepEqual(dietaryFlags(['2 tbsp dairy-free butter']), ['contains-dairy']);
});

test('no lines means no flags', () => {
  assert.deepEqual(dietaryFlags([]), []);
});
