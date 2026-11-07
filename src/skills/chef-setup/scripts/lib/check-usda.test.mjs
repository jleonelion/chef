import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fdcClient } from '../../../../lib/fdc.mjs';
import { checkUsda } from './check-usda.mjs';

const key = { ok: true, value: 'k', placement: { in: 'query', name: 'api_key' }, source: 'connector' };

test('a harmless one-food search proves the connection', async () => {
  const seen = [];
  const fetchImpl = async (href) => {
    seen.push(new URL(href).searchParams.get('query'));
    return Response.json({ foods: [{ fdcId: 171688, description: 'Apples, raw, with skin', dataType: 'SR Legacy', foodNutrients: [] }] });
  };
  assert.deepEqual(await checkUsda(fdcClient({ credential: key, fetchImpl })), { status: 'connected', food: 'Apples, raw, with skin' });
  assert.deepEqual(seen, ['apple']);
});

test('reports why the connection does not work', async () => {
  const none = fdcClient({ credential: { ok: false, reason: 'not-connected' } });
  assert.deepEqual(await checkUsda(none), { status: 'not-connected', reason: 'not-connected' });
  const refused = fdcClient({ credential: key, fetchImpl: async () => new Response('{}', { status: 403 }) });
  assert.deepEqual(await checkUsda(refused), { status: 'not-connected', reason: 'rejected' });
});
