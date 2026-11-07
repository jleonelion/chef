import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { muse } from './muse.mjs';

test('Muse data root default is ~/workspace/chef', () => {
  assert.equal(muse.defaultDataRoot(), path.join(os.homedir(), 'workspace', 'chef'));
});

test('update locations come from the adapter for Muse custom skills', () => {
  const workspace = path.join(os.tmpdir(), 'chef-runtime-workspace');
  const skillDir = path.join(workspace, 'custom-skills', 'chef_setup');
  const repository = path.join(workspace, 'chef-source');
  assert.deepEqual(muse.updateInstall({ skillDir, repository }), {
    repository,
    skillsDir: path.join(workspace, 'custom-skills'),
    installedName: 'chef_setup',
    nameForSkill: 'underscores',
  });
});

test('update locations come from the adapter for Claude Code and Muse Code plugins', () => {
  const repository = path.join(os.tmpdir(), 'chef-plugin-cache');
  const skillDir = path.join(repository, 'plugins', 'chef', 'skills', 'chef-setup');
  assert.deepEqual(muse.updateInstall({ skillDir, repository }), {
    repository,
    skillsDir: path.join(repository, 'plugins', 'chef', 'skills'),
    installedName: 'chef-setup',
    nameForSkill: 'hyphens',
  });
});

test('locale prefers LC_ALL, then LC_MEASUREMENT, then LANG, skipping C/POSIX and empty', () => {
  assert.equal(muse.locale({ LC_ALL: 'en_GB.UTF-8', LANG: 'en_US.UTF-8' }), 'en_GB.UTF-8');
  assert.equal(muse.locale({ LC_ALL: '', LC_MEASUREMENT: 'de_DE', LANG: 'en_US.UTF-8' }), 'de_DE');
  assert.equal(muse.locale({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }), 'en_US.UTF-8');
});

const USDA_QUERY = { in: 'query', name: 'api_key' };
const authdcReply = (placement = 'query_param:api_key') => JSON.stringify({ credentials: [{ surrogate: 'hsurr:abc', placement }] });

test('on Muse, the USDA credential is the connector surrogate placed as the api_key query param', () => {
  const calls = [];
  const run = (file, args) => {
    calls.push([file, ...args]);
    return authdcReply();
  };
  const result = muse.credential('usda-fdc', { env: { CHEF_USDA_FDC_KEY: 'ignored-on-muse' }, exists: () => true, run });
  assert.deepEqual(result, { ok: true, value: 'hsurr:abc', placement: USDA_QUERY, source: 'connector' });
  assert.deepEqual(calls, [['/opt/hatch/bin/authdc', 'cred', 'surrogate', 'custom.usda-fdc']]);
});

test('on Muse, an unregistered connector or unreadable reply means no key', () => {
  const failing = () => {
    throw new Error('exit 1: 403');
  };
  assert.deepEqual(muse.credential('usda-fdc', { exists: () => true, run: failing }), { ok: false, reason: 'not-connected' });
  assert.deepEqual(muse.credential('usda-fdc', { exists: () => true, run: () => 'not json' }), { ok: false, reason: 'not-connected' });
  assert.deepEqual(muse.credential('usda-fdc', { exists: () => true, run: () => authdcReply('header:X-Api-Key') }), { ok: false, reason: 'wrong-placement' });
});

test('off Muse, the USDA credential comes from CHEF_USDA_FDC_KEY', () => {
  const offMuse = { exists: () => false, run: () => assert.fail('authdc must not run off Muse') };
  assert.deepEqual(muse.credential('usda-fdc', { ...offMuse, env: { CHEF_USDA_FDC_KEY: ' k123 ' } }), { ok: true, value: 'k123', placement: USDA_QUERY, source: 'env' });
  assert.deepEqual(muse.credential('usda-fdc', { ...offMuse, env: { CHEF_USDA_FDC_KEY: '' } }), { ok: false, reason: 'not-connected' });
  assert.deepEqual(muse.credential('usda-fdc', { ...offMuse, env: {} }), { ok: false, reason: 'not-connected' });
});

test('unknown providers are a programming error', () => {
  assert.throws(() => muse.credential('nope', { exists: () => false, env: {} }), /unknown credential provider/);
});

test('locale falls back to the runtime Intl locale', () => {
  assert.equal(muse.locale({ LANG: 'POSIX' }), Intl.DateTimeFormat().resolvedOptions().locale);
});
