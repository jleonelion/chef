import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fdcClient } from './fdc.mjs';
import { bestMatch, singular } from './fdc-match.mjs';

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

test('singular folds the plural forms USDA and recipes use', () => {
  assert.deepEqual(
    ['onions', 'tomatoes', 'cherries', 'leaves', 'bunches', 'cloves', 'olives', 'glass'].map(singular),
    ['onion', 'tomato', 'cherry', 'leaf', 'bunch', 'clove', 'olive', 'glass'],
  );
});
