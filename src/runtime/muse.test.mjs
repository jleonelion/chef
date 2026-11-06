import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { muse } from './muse.mjs';

test('Muse data root default is ~/workspace/chef', () => {
  assert.equal(muse.defaultDataRoot(), path.join(os.homedir(), 'workspace', 'chef'));
});

test('locale prefers LC_ALL, then LC_MEASUREMENT, then LANG, skipping C/POSIX and empty', () => {
  assert.equal(muse.locale({ LC_ALL: 'en_GB.UTF-8', LANG: 'en_US.UTF-8' }), 'en_GB.UTF-8');
  assert.equal(muse.locale({ LC_ALL: '', LC_MEASUREMENT: 'de_DE', LANG: 'en_US.UTF-8' }), 'de_DE');
  assert.equal(muse.locale({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }), 'en_US.UTF-8');
});

test('locale falls back to the runtime Intl locale', () => {
  assert.equal(muse.locale({ LANG: 'POSIX' }), Intl.DateTimeFormat().resolvedOptions().locale);
});
