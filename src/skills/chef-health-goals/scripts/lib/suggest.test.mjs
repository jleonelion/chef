import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOT_MEDICAL_ADVICE } from '../../../../lib/safety-text.mjs';
import { healthSuggestions } from './suggest.mjs';

const goal = { status: 'active', goal: 'Lower sodium', targets: { sodium: { max: 2300 }, protein: { min: 90 } }, set: '2026-01-10' };
const meal = (date, slug, sodium, protein) => ({ date, slug, servings: 2, totals: { sodium: sodium * 2, protein: protein * 2 } });

test('suggestions compare one serving of each planned meal with the daily targets', () => {
  const plan = { meals: [{ slug: 'soup' }, { slug: 'stew' }], nutrition: { status: 'complete', meals: [meal('2026-01-19', 'soup', 2500, 20), meal('2026-01-20', 'stew', 700, 40)] } };
  const result = healthSuggestions(plan, goal);
  assert.equal(result.status, 'advisory');
  assert.equal(result.goal, 'Lower sodium');
  assert.equal(result.footer, NOT_MEDICAL_ADVICE);
  assert.deepEqual(result.targets, [
    { nutrient: 'sodium', max: 2300, per_serving_average: 1600, share_of_target: 70, over_daily_max: [{ date: '2026-01-19', slug: 'soup', per_serving: 2500 }] },
    { nutrient: 'protein', min: 90, per_serving_average: 30, share_of_target: 33 },
  ]);
});

test('suggestions never change the gated plan or name recipes outside it', () => {
  const plan = { meals: [{ slug: 'soup' }], nutrition: { status: 'complete', meals: [meal('2026-01-19', 'soup', 2500, 20)] } };
  const before = structuredClone(plan);
  const slugs = JSON.stringify(healthSuggestions(plan, goal)).match(/"slug":"[^"]+"/g);
  assert.deepEqual(plan, before);
  assert.deepEqual(slugs, ['"slug":"soup"']);
});

test('without complete plan nutrition there is nothing to compare, and Chef says so', () => {
  const plan = { meals: [{ slug: 'soup' }], nutrition: { status: 'incomplete', meals: [], missing: [] } };
  assert.deepEqual(healthSuggestions(plan, goal), {
    status: 'unavailable',
    goal: 'Lower sodium',
    reason: 'some planned recipes have no complete nutrition, so Chef cannot compare the plan with your targets',
    footer: NOT_MEDICAL_ADVICE,
  });
});
