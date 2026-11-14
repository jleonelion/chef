import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fdcClient } from './fdc.mjs';
import { computeNutrition, rollupNutrition } from './nutrition.mjs';

const samples = JSON.parse(fs.readFileSync(new URL('../../fixtures/usda/fdc-samples.json', import.meta.url), 'utf8'));
const key = { ok: true, value: 'k', placement: { in: 'query', name: 'api_key' } };

// Serves the recorded USDA responses; anything not recorded is a 404.
function usda() {
  const calls = [];
  const fetchImpl = async (href) => {
    const url = new URL(href);
    calls.push(url.pathname + (url.searchParams.get('query') ? `?${url.searchParams.get('query')}` : ''));
    const body = url.pathname.endsWith('/foods/search') ? samples.search[url.searchParams.get('query')] : samples.food[url.pathname.split('/').pop()];
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('{}', { status: 404 });
  };
  return { calls, fdc: fdcClient({ credential: key, fetchImpl }) };
}

test('sums USDA per-100 g values over each ingredient\'s grams, per serving, rounded', async () => {
  const { fdc } = usda();
  const result = await computeNutrition({ lines: ['100 g onion', '2 cloves garlic, minced', 'salt to taste'], servings: 1, fdc });
  assert.equal(result.status, 'complete');
  // onion 100 g + garlic 2 x 3 g (USDA "clove" portion), USDA SR Legacy values.
  assert.deepEqual(result.per_serving, { calories: 49, protein: 1.5, fat: 0.1, saturated_fat: 0, carbs: 11.3, fiber: 1.8, sugar: 4.3, sodium: 5, cholesterol: 0 });
  assert.deepEqual(result.sources, ['100 g onion: Onions, raw (FDC 170000), 100 g', '2 cloves garlic, minced: Garlic, raw (FDC 169230), 6 g', 'salt to taste: excluded: trace amount']);
});

test('seasonings, garnishes and optional lines are excluded, listed with their reason, and never block complete', async () => {
  const { calls, fdc } = usda();
  const lines = ['100 g onion', 'salt and pepper', 'Kosher salt', 'parsley, for garnish', 'lemon wedges, for serving', '1/4 cup toasted pine nuts (optional)', 'salt to taste', '100 g spaghetti, to serve'];
  const result = await computeNutrition({ lines, servings: 1, fdc });
  assert.equal(result.status, 'complete');
  // A measured line served alongside is not nominal: onion 40 kcal + spaghetti 371 kcal.
  assert.equal(result.per_serving.calories, 411);
  assert.deepEqual(result.sources, [
    '100 g onion: Onions, raw (FDC 170000), 100 g',
    'salt and pepper: excluded: seasoning',
    'Kosher salt: excluded: seasoning',
    'parsley, for garnish: excluded: garnish',
    'lemon wedges, for serving: excluded: garnish',
    '1/4 cup toasted pine nuts (optional): excluded: optional',
    'salt to taste: excluded: trace amount',
    '100 g spaghetti, to serve: Pasta, dry, enriched (FDC 169736), 100 g',
  ]);
  assert.deepEqual(calls, ['/fdc/v1/foods/search?onion', '/fdc/v1/food/169736']);
});

test('citrus juice by the fruit uses USDA\'s per-fruit juice yield; zest by the fruit has none, so it is excluded', async () => {
  const { fdc } = usda();
  const lines = ['Juice of 1 lemon', 'Zest and juice of 2 limes', 'Juice of ½ lemon', '1 lime, juiced', 'Zest of 1 lemon', '1 tsp lemon zest'];
  const result = await computeNutrition({ lines, servings: 1, fdc });
  assert.equal(result.status, 'complete');
  // USDA portions: "1 lemon yields" 48 g lemon juice, "1 lime yields" 44 g lime juice, 1 tsp lemon peel 2 g.
  assert.deepEqual(result.sources, [
    'Juice of 1 lemon: Lemon juice, raw (FDC 167747), 48 g',
    'Zest and juice of 2 limes: Lime juice, raw (FDC 168156), 88 g; zest excluded: no USDA per-fruit yield',
    'Juice of ½ lemon: Lemon juice, raw (FDC 167747), 24 g',
    '1 lime, juiced: Lime juice, raw (FDC 168156), 44 g',
    'Zest of 1 lemon: excluded: zest, no USDA per-fruit yield',
    '1 tsp lemon zest: Lemon peel, raw (FDC 167749), 2 g',
  ]);
  assert.equal(result.per_serving.calories, 50);
  assert.equal(result.per_serving.carbs, 16.4);
});

const pesto = {
  servings: 4,
  yield: '1 cup',
  nutrition_status: 'complete',
  nutrition_per_serving: { calories: 200, protein: 4, fat: 20, saturated_fat: 3, carbs: 3, fiber: 1, sugar: 0.5, sodium: 150, cholesterol: 5 },
};

test('a linked sub-recipe adds its stored per-serving nutrition, scaled by servings or by its yield', async () => {
  const { fdc } = usda();
  const subRecipe = (slug) => ({ 'basil-pesto': pesto })[slug];
  const lines = ['100 g onion', '1/2 cup [[basil-pesto]]', '1 serving [[basil-pesto|pesto]]'];
  const result = await computeNutrition({ lines, servings: 2, fdc, subRecipe });
  assert.equal(result.status, 'complete');
  // 1/2 cup of a 1-cup, 4-serving yield = 2 servings, plus 1 serving: 3 x 200 kcal + 40 kcal onion, over 2 servings.
  assert.equal(result.per_serving.calories, 320);
  assert.equal(result.per_serving.sodium, 227);
  assert.deepEqual(result.sources, [
    '100 g onion: Onions, raw (FDC 170000), 100 g',
    '1/2 cup [[basil-pesto]]: sub-recipe basil-pesto, 2 servings',
    '1 serving [[basil-pesto|pesto]]: sub-recipe basil-pesto, 1 serving',
  ]);
});

test('a missing, incomplete or unmeasurable sub-recipe leaves the parent incomplete, with the reason', async () => {
  const { fdc } = usda();
  const recipes = { 'basil-pesto': pesto, 'green-sauce': { servings: 2, nutrition_status: 'incomplete' }, salsa: { ...pesto, yield: undefined } };
  const lines = ['1 cup [[green-sauce]]', '2 tbsp [[nope]]', '50 g [[basil-pesto]]', '[[basil-pesto]]', '1 cup [[salsa]]'];
  const result = await computeNutrition({ lines, servings: 2, fdc, subRecipe: (slug) => recipes[slug] });
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missing, [
    '1 cup [[green-sauce]]: sub-recipe green-sauce nutrition is incomplete',
    '2 tbsp [[nope]]: sub-recipe nope not found',
    '50 g [[basil-pesto]]: g does not convert to the basil-pesto yield of 1 cup',
    '[[basil-pesto]]: no amount',
    '1 cup [[salsa]]: sub-recipe salsa has no yield; give servings instead',
  ]);
});

test('volumes use a USDA portion of the same food', async () => {
  const { fdc } = usda();
  const result = await computeNutrition({ lines: ['1 tbsp garlic'], servings: 1, fdc });
  // USDA: 1 tsp garlic = 2.8 g, so 1 tbsp = 3 tsp = 8.4 g.
  assert.deepEqual(result.sources, ['1 tbsp garlic: Garlic, raw (FDC 169230), 8.4 g']);
});

test('anything it cannot source from USDA leaves nutrition incomplete, with reasons', async () => {
  const { fdc } = usda();
  const result = await computeNutrition({ lines: ['200 g tahini', '1 bunch garlic', 'olive oil for frying', '100 g onion'], servings: 2, fdc });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.per_serving, undefined);
  assert.deepEqual(result.missing, [
    '200 g tahini: no matching USDA food',
    '1 bunch garlic: USDA has no "bunch" portion for Garlic, raw',
    'olive oil for frying: no amount',
  ]);
});

test('reviewed staples take count and weight units from their USDA food', async () => {
  const { calls, fdc } = usda();
  const result = await computeNutrition({ lines: ['2 large eggs', '1 stick unsalted butter', '8 oz spaghetti'], servings: 4, fdc });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.sources, [
    '2 large eggs: Egg, whole, raw, fresh (FDC 171287), 100 g',
    '1 stick unsalted butter: Butter, without salt (FDC 173430), 113 g',
    '8 oz spaghetti: Pasta, dry, enriched (FDC 169736), 226.8 g',
  ]);
  assert.deepEqual(calls, ['/fdc/v1/food/171287', '/fdc/v1/food/173430', '/fdc/v1/food/169736']);
});

test('without servings nothing per serving can be computed, and USDA is not asked', async () => {
  const { calls, fdc } = usda();
  const result = await computeNutrition({ lines: ['100 g onion'], servings: undefined, fdc });
  assert.deepEqual(result, { status: 'incomplete', missing: ['servings: the recipe does not say how many it serves'], sources: [] });
  assert.deepEqual(calls, []);
});

test('no USDA key, or USDA refusing the key, means not computed', async () => {
  const none = fdcClient({ credential: { ok: false, reason: 'not-connected' }, fetchImpl: async () => assert.fail('no fetch') });
  assert.deepEqual(await computeNutrition({ lines: ['100 g onion'], servings: 1, fdc: none }), { status: 'not-computed', reason: 'not-connected' });
  const refused = fdcClient({ credential: key, fetchImpl: async () => new Response('{}', { status: 403 }) });
  assert.deepEqual(await computeNutrition({ lines: ['100 g onion'], servings: 1, fdc: refused }), { status: 'not-computed', reason: 'rejected' });
});

test('looks each food up once', async () => {
  const { calls, fdc } = usda();
  await computeNutrition({ lines: ['100 g onion', '50 g onion'], servings: 1, fdc });
  assert.deepEqual(calls, ['/fdc/v1/foods/search?onion']);
});

test('uses a reviewed ingredient match before USDA search', async () => {
  const fdc = {
    unavailable: null,
    search: async () => assert.fail('reviewed aliases must not use search'),
    food: async (fdcId) => ({
      ok: true,
      food: {
        fdcId,
        description: 'Oil, olive, salad or cooking',
        dataType: 'SR Legacy',
        per100g: { calories: 884, protein: 0, fat: 100, saturated_fat: 13.8, carbs: 0, fiber: 0, sugar: 0, sodium: 2, cholesterol: 0 },
        portions: [],
      },
    }),
  };
  const result = await computeNutrition({ lines: ['100 g EVOO'], servings: 1, fdc });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.sources, ['100 g EVOO: Oil, olive, salad or cooking (FDC 171413), 100 g']);
});

test('rolls complete recipe nutrition into meal and plan totals', () => {
  const result = rollupNutrition([
    {
      date: '2026-01-19',
      slug: 'bean-stew',
      servings: 3,
      nutrition_per_serving: { calories: 250, protein: 12, fat: 4.5, saturated_fat: 1, carbs: 40, fiber: 8, sugar: 5, sodium: 300, cholesterol: 0 },
    },
    {
      date: '2026-01-20',
      slug: 'pasta',
      servings: 2,
      nutrition_per_serving: { calories: 400, protein: 15, fat: 10, saturated_fat: 2.5, carbs: 60, fiber: 4, sugar: 3, sodium: 500, cholesterol: 10 },
    },
  ]);

  assert.deepEqual(result, {
    status: 'complete',
    meals: [
      { date: '2026-01-19', slug: 'bean-stew', servings: 3, totals: { calories: 750, protein: 36, fat: 13.5, saturated_fat: 3, carbs: 120, fiber: 24, sugar: 15, sodium: 900, cholesterol: 0 } },
      { date: '2026-01-20', slug: 'pasta', servings: 2, totals: { calories: 800, protein: 30, fat: 20, saturated_fat: 5, carbs: 120, fiber: 8, sugar: 6, sodium: 1000, cholesterol: 20 } },
    ],
    totals: { calories: 1550, protein: 66, fat: 33.5, saturated_fat: 8, carbs: 240, fiber: 32, sugar: 21, sodium: 1900, cholesterol: 20 },
  });
});

test('keeps a rollup on the plan when recipe nutrition is unavailable', () => {
  const result = rollupNutrition([
    { date: '2026-01-19', slug: 'bean-stew', servings: 3, nutrition_status: 'not-computed' },
  ]);

  assert.deepEqual(result, {
    status: 'incomplete',
    meals: [{ date: '2026-01-19', slug: 'bean-stew', servings: 3, status: 'not-computed' }],
    missing: [{ date: '2026-01-19', slug: 'bean-stew', reason: 'recipe nutrition is not complete' }],
  });
});
