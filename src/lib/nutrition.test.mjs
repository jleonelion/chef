import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fdcClient } from './fdc.mjs';
import { computeNutrition } from './nutrition.mjs';

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
  assert.deepEqual(result.sources, ['100 g onion: Onions, raw (FDC 170000), 100 g', '2 cloves garlic, minced: Garlic, raw (FDC 169230), 6 g']);
});

test('volumes use a USDA portion of the same food', async () => {
  const { fdc } = usda();
  const result = await computeNutrition({ lines: ['1 tbsp garlic'], servings: 1, fdc });
  // USDA: 1 tsp garlic = 2.8 g, so 1 tbsp = 3 tsp = 8.4 g.
  assert.deepEqual(result.sources, ['1 tbsp garlic: Garlic, raw (FDC 169230), 8.4 g']);
});

test('anything it cannot source from USDA leaves nutrition incomplete, with reasons', async () => {
  const { fdc } = usda();
  const result = await computeNutrition({ lines: ['200 g spaghetti', '1 bunch garlic', 'olive oil for frying', '100 g onion'], servings: 2, fdc });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.per_serving, undefined);
  assert.deepEqual(result.missing, [
    '200 g spaghetti: no matching USDA food',
    '1 bunch garlic: USDA has no "bunch" portion for Garlic, raw',
    'olive oil for frying: no amount',
  ]);
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
