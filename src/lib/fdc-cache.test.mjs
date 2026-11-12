import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { initDataRoot } from '../skills/chef-setup/scripts/lib/init-data-root.mjs';
import { git } from './git.mjs';
import { cacheFor, fdcReplyCache } from './fdc-cache.mjs';
import { fdcClient } from './fdc.mjs';

const samples = JSON.parse(fs.readFileSync(new URL('../../fixtures/usda/fdc-samples.json', import.meta.url), 'utf8'));
const key = { ok: true, value: 'hsurr:secret', placement: { in: 'query', name: 'api_key' } };
const garlic = samples.food['169230'];
const entry = (root, id = 169230) => path.join(root, 'cache', 'fdc', 'food', `${id}.json`);
const offline = async () => assert.fail('must not fetch');

function dataRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-fdc-cache-')), 'root');
  initDataRoot(root);
  return root;
}

function counting(reply = () => Response.json(garlic)) {
  const calls = [];
  return { calls, fetchImpl: async (url) => (calls.push(url), reply()) };
}

test('the cache is off unless CHEF_FDC_CACHE=1', () => {
  const root = dataRoot();
  assert.equal(cacheFor(root, {}), null);
  assert.equal(cacheFor(root, { CHEF_FDC_CACHE: '0' }), null);
  assert.equal(cacheFor(undefined, { CHEF_FDC_CACHE: '1' }), null);
  assert.ok(cacheFor(root, { CHEF_FDC_CACHE: '1' }));
});

test('a miss asks USDA once and keeps the reply; a hit skips the network', async () => {
  const root = dataRoot();
  const { calls, fetchImpl } = counting();
  const first = await fdcClient({ credential: key, fetchImpl, cache: fdcReplyCache(root) }).food(169230);
  assert.equal(calls.length, 1);
  assert.equal(first.food.description, 'Garlic, raw');
  assert.ok(fs.existsSync(entry(root)));
  assert.doesNotMatch(fs.readFileSync(entry(root), 'utf8'), /secret/);

  const second = await fdcClient({ credential: key, fetchImpl: offline, cache: fdcReplyCache(root) }).food(169230);
  assert.deepEqual(second, first);
});

test('a corrupt or mismatched entry falls back to USDA and is replaced', async () => {
  const root = dataRoot();
  fs.mkdirSync(path.dirname(entry(root)), { recursive: true });
  for (const bad of ['{not json', JSON.stringify({ ...garlic, fdcId: 1 }), 'null']) {
    fs.writeFileSync(entry(root), bad);
    const { calls, fetchImpl } = counting();
    const result = await fdcClient({ credential: key, fetchImpl, cache: fdcReplyCache(root) }).food(169230);
    assert.equal(calls.length, 1);
    assert.equal(result.food.fdcId, 169230);
    assert.equal(JSON.parse(fs.readFileSync(entry(root), 'utf8')).fdcId, 169230);
  }
});

test('failed replies are not cached', async () => {
  const root = dataRoot();
  const { fetchImpl } = counting(() => new Response('{}', { status: 429 }));
  assert.deepEqual(await fdcClient({ credential: key, fetchImpl, cache: fdcReplyCache(root) }).food(169230), { ok: false, reason: 'rate-limited' });
  assert.equal(fs.existsSync(entry(root)), false);
});

test('without a credential nothing is read from the cache or the network', async () => {
  const root = dataRoot();
  await fdcClient({ credential: key, fetchImpl: counting().fetchImpl, cache: fdcReplyCache(root) }).food(169230);
  const client = fdcClient({ credential: { ok: false, reason: 'not-connected' }, fetchImpl: offline, cache: fdcReplyCache(root) });
  assert.deepEqual(await client.food(169230), { ok: false, reason: 'not-connected' });
});

test('cache files stay out of the data root git history', async () => {
  const root = dataRoot();
  await fdcClient({ credential: key, fetchImpl: counting().fetchImpl, cache: fdcReplyCache(root) }).food(169230);
  assert.equal(git(root, ['status', '--porcelain']), '');
});

test('an unwritable cache never breaks the lookup', async () => {
  const root = dataRoot();
  fs.writeFileSync(path.join(root, 'cache'), 'a file where the cache folder would go');
  const result = await fdcClient({ credential: key, fetchImpl: counting().fetchImpl, cache: fdcReplyCache(root) }).food(169230);
  assert.equal(result.food.description, 'Garlic, raw');
});
