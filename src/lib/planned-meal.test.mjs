import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leftoversFeeding, mealKind, withAmountToCook } from './planned-meal.mjs';

// The leftover chain: Monday dinner eats 2 and cooks for Tuesday lunch's 2; Tuesday dinner is out.
const chain = [
  { date: '2026-01-19', slot: 'dinner', slug: 'chili', title: 'Chili', servings: 2 },
  { date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' }, slug: 'chili', title: 'Chili', servings: 2 },
  { date: '2026-01-20', slot: 'dinner', food: 'Dinner out: Thai', servings: 2 },
];

test('the kind of a planned meal is read from its fields: leftovers, then food, else recipe', () => {
  assert.deepEqual(chain.map(mealKind), ['recipe', 'leftovers', 'food']);
  assert.equal(mealKind({ date: '2026-01-19', slug: 'chili', servings: 2 }), 'recipe');
});

test('2 servings eaten plus 2 servings of leftovers cook for 4; other meals get no amount to cook', () => {
  assert.deepEqual(withAmountToCook(chain).map((meal) => meal.cook_servings), [4, undefined, undefined]);
});

test('a v1 slotless recipe meal reads as dinner and cooks what it eats', () => {
  const v1 = [{ date: '2026-01-19', slug: 'chili', servings: 3 }];
  assert.deepEqual(withAmountToCook(v1), [{ date: '2026-01-19', slug: 'chili', servings: 3, cook_servings: 3 }]);
});

test('leftovers feeding a cooking meal are named, v1 slotless target included', () => {
  const meals = [{ date: '2026-01-19', slug: 'chili', servings: 2 }, chain[1]];
  assert.deepEqual(leftoversFeeding(meals, meals[0]), [chain[1]]);
  assert.deepEqual(withAmountToCook(meals)[0].cook_servings, 4);
});
