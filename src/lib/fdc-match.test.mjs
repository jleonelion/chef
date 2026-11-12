import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fdcClient } from './fdc.mjs';
import { bestMatch, reviewedMatch, singular } from './fdc-match.mjs';

const samples = JSON.parse(fs.readFileSync(new URL('../../fixtures/usda/fdc-samples.json', import.meta.url), 'utf8'));
const key = { ok: true, value: 'k', placement: { in: 'query', name: 'api_key' } };
const foods = async (name) => (await fdcClient({ credential: key, fetchImpl: async () => Response.json(samples.search[name]) }).search(name)).foods;

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

test('reviewedMatch resolves pantry aliases to verified SR Legacy foods', () => {
  assert.deepEqual(reviewedMatch('EVOO'), {
    fdcId: 171413,
    description: 'Oil, olive, salad or cooking',
    dataType: 'SR Legacy',
  });
  assert.deepEqual(reviewedMatch('  lemon   zest '), {
    fdcId: 167749,
    description: 'Lemon peel, raw',
    dataType: 'SR Legacy',
  });
  assert.equal(reviewedMatch('tahini'), null);
});

test('reviewedMatch maps pasta shapes and pantry staples to verified SR Legacy foods', () => {
  const described = (alias) => reviewedMatch(alias)?.description;
  for (const shape of ['spaghetti', 'penne', 'linguine', 'fettuccine', 'rigatoni', 'elbow macaroni', 'dry pasta']) {
    assert.equal(described(shape), 'Pasta, dry, enriched', shape);
  }
  assert.equal(described('all-purpose flour'), 'Wheat flour, white, all-purpose, enriched, bleached');
  assert.equal(described('granulated sugar'), 'Sugars, granulated');
  assert.equal(described('unsalted butter'), 'Butter, without salt');
  assert.equal(described('eggs'), 'Egg, whole, raw, fresh');
  assert.equal(described('ground black pepper'), 'Spices, pepper, black');
});

test('every reviewed food matches a recorded USDA reply', async () => {
  const { REVIEWED_FDC_FOODS } = await import('./fdc-synonyms-data.mjs');
  const recorded = [...Object.values(samples.food), ...Object.values(samples.search).flatMap((reply) => reply.foods)];
  for (const { fdcId, description, dataType } of REVIEWED_FDC_FOODS) {
    const reply = recorded.find((food) => food.fdcId === fdcId);
    assert.deepEqual(reply && { fdcId: reply.fdcId, description: reply.description, dataType: reply.dataType }, { fdcId, description, dataType });
  }
});

test('singular folds the plural forms USDA and recipes use', () => {
  assert.deepEqual(
    ['onions', 'tomatoes', 'cherries', 'leaves', 'bunches', 'cloves', 'olives', 'glass'].map(singular),
    ['onion', 'tomato', 'cherry', 'leaf', 'bunch', 'clove', 'olive', 'glass'],
  );
});
