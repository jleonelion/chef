import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { bestMatch, fdcClient } from './fdc.mjs';

const samples = JSON.parse(fs.readFileSync(new URL('./__fixtures__/fdc-samples.json', import.meta.url), 'utf8'));
const key = { ok: true, value: 'hsurr:secret', placement: { in: 'query', name: 'api_key' } };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function recorder(reply) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return reply(new URL(url));
  };
  return { calls, fetchImpl };
}

test('search asks USDA for SR Legacy foods with the key in the registered query param, redirects off', async () => {
  const { calls, fetchImpl } = recorder(() => json(samples.search.onion));
  const result = await fdcClient({ credential: key, fetchImpl }).search('onion');
  assert.equal(result.ok, true);
  assert.equal(result.foods[0].description, 'Onions, raw');
  assert.deepEqual(result.foods[0].per100g, { calories: 40, protein: 1.1, fat: 0.1, saturated_fat: 0.042, carbs: 9.34, fiber: 1.7, sugar: 4.24, sodium: 4, cholesterol: 0 });
  const { url, init } = calls[0];
  assert.equal(url.origin + url.pathname, 'https://api.nal.usda.gov/fdc/v1/foods/search');
  assert.equal(url.searchParams.get('query'), 'onion');
  assert.equal(url.searchParams.get('dataType'), 'SR Legacy');
  assert.equal(url.searchParams.get('api_key'), 'hsurr:secret');
  assert.equal(init.redirect, 'error');
});

test('food returns USDA portions and per-100 g nutrients', async () => {
  const { calls, fetchImpl } = recorder(() => json(samples.food['169230']));
  const result = await fdcClient({ credential: key, fetchImpl }).food(169230);
  assert.equal(calls[0].url.pathname, '/fdc/v1/food/169230');
  assert.equal(result.food.description, 'Garlic, raw');
  assert.equal(result.food.per100g.calories, 149);
  assert.deepEqual(result.food.portions[1], { amount: 1, modifier: 'clove', gramWeight: 3 });
});

test('failures map to reasons and never carry the key', async () => {
  const reasons = {};
  for (const [name, reply] of Object.entries({ rejected: () => json({}, 403), limited: () => json({}, 429), server: () => json({}, 500) })) {
    reasons[name] = await fdcClient({ credential: key, fetchImpl: async () => reply() }).search('x');
  }
  const thrown = await fdcClient({ credential: key, fetchImpl: async (url) => { throw new TypeError(`redirect refused for ${url}`); } }).search('x');
  assert.deepEqual(reasons.rejected, { ok: false, reason: 'rejected' });
  assert.deepEqual(reasons.limited, { ok: false, reason: 'rate-limited' });
  assert.deepEqual(reasons.server, { ok: false, reason: 'unreachable' });
  assert.deepEqual(thrown, { ok: false, reason: 'unreachable' });
  assert.doesNotMatch(JSON.stringify([reasons, thrown]), /secret/);
});

test('no credential means no request', async () => {
  const client = fdcClient({ credential: { ok: false, reason: 'not-connected' }, fetchImpl: async () => assert.fail('must not fetch') });
  assert.deepEqual(await client.search('onion'), { ok: false, reason: 'not-connected' });
});

const foods = async (name) => (await fdcClient({ credential: key, fetchImpl: async () => json(samples.search[name]) }).search(name)).foods;

test('bestMatch takes the plain food, not brands, products or other foods', async () => {
  assert.equal(bestMatch('onion', await foods('onion'))?.description, 'Onions, raw');
  assert.equal(bestMatch('olive oil', await foods('olive oil'))?.description, 'Oil, olive, salad or cooking');
  assert.equal(bestMatch('parmesan', await foods('parmesan'))?.description, 'Cheese, parmesan, grated');
  assert.equal(bestMatch('lemon', await foods('lemon'))?.description, 'Lemons, raw, without peel');
  assert.equal(bestMatch('garlic', await foods('garlic'))?.description, 'Garlic, raw');
});

test('bestMatch returns nothing rather than a different food', async () => {
  assert.equal(bestMatch('spaghetti', await foods('spaghetti')), null);
  assert.equal(bestMatch('onion', []), null);
});
