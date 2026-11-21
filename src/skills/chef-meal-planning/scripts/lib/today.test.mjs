import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { serializePage } from '../../../../lib/frontmatter.mjs';
import { todayPlan } from './today.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function rootWithPlan(meals) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-today-test-'));
  roots.push(root);
  const file = path.join(root, 'knowledge/wiki/meal-plans/2026-01-19.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializePage({ type: 'meal-plan', title: 'Meal plan: week of 2026-01-19', week_start: '2026-01-19', meals }, '# Plan\n'));
  return root;
}

test('a day with three planned meals lists them in slot order with their slots', () => {
  const root = rootWithPlan([
    { date: '2026-01-20', slot: 'snack', slug: 'apple-slices', title: 'Apple Slices', servings: 1 },
    { date: '2026-01-20', slot: 'dinner', slug: 'bean-chili', title: 'Bean Chili', servings: 3 },
    { date: '2026-01-19', slot: 'dinner', slug: 'bean-chili', title: 'Bean Chili', servings: 3 },
    { date: '2026-01-20', slot: 'breakfast', slug: 'overnight-oats', title: 'Overnight Oats', servings: 3 },
    { date: '2026-01-20', slot: 'lunch', slug: 'lentil-salad', title: 'Lentil Salad', servings: 3, note: 'pack for work' },
  ]);

  const result = todayPlan(root, '2026-01-20');

  assert.equal(result.status, 'planned');
  assert.deepEqual(result.meals.map((meal) => [meal.slot, meal.slug]), [
    ['breakfast', 'overnight-oats'],
    ['lunch', 'lentil-salad'],
    ['dinner', 'bean-chili'],
    ['snack', 'apple-slices'],
  ]);
  assert.equal(result.meals[1].note, 'pack for work');
});

test('a v1 one-per-day plan reads as dinner', () => {
  const root = rootWithPlan([
    { date: '2026-01-19', slug: 'bean-chili', title: 'Bean Chili', servings: 2 },
    { date: '2026-01-20', slug: 'lentil-salad', title: 'Lentil Salad', servings: 2 },
  ]);

  const result = todayPlan(root, '2026-01-20');

  assert.deepEqual(result.meals, [{ date: '2026-01-20', slot: 'dinner', slug: 'lentil-salad', title: 'Lentil Salad', servings: 2, cook_servings: 2 }]);
});

test('the cooking meal reports the amount to cook for its leftovers; leftovers and free-text food keep their shapes', () => {
  const root = rootWithPlan([
    { date: '2026-01-19', slot: 'dinner', slug: 'chili', title: 'Chili', servings: 2 },
    { date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' }, slug: 'chili', title: 'Chili', servings: 2 },
    { date: '2026-01-20', slot: 'dinner', food: 'Dinner out: Thai', servings: 2 },
  ]);

  assert.deepEqual(todayPlan(root, '2026-01-19').meals, [
    { date: '2026-01-19', slot: 'dinner', slug: 'chili', title: 'Chili', servings: 2, cook_servings: 4 },
  ]);
  assert.deepEqual(todayPlan(root, '2026-01-20').meals, [
    { date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' }, slug: 'chili', title: 'Chili', servings: 2 },
    { date: '2026-01-20', slot: 'dinner', food: 'Dinner out: Thai', servings: 2 },
  ]);
});
