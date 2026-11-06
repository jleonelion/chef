import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_DATA_ROOT, resolveDataRoot } from './data-root.mjs';

test('flag wins over env and default', () => {
  const root = resolveDataRoot({ flag: '/tmp/a', env: { CHEF_DATA_ROOT: '/tmp/b' } });
  assert.equal(root, '/tmp/a');
});

test('env wins over default', () => {
  assert.equal(resolveDataRoot({ env: { CHEF_DATA_ROOT: '/tmp/b' } }), '/tmp/b');
});

test('default is ~/workspace/chef', () => {
  assert.equal(resolveDataRoot({ env: {} }), DEFAULT_DATA_ROOT);
  assert.equal(DEFAULT_DATA_ROOT, path.join(os.homedir(), 'workspace', 'chef'));
});

test('expands a leading ~ and resolves relative paths', () => {
  assert.equal(resolveDataRoot({ flag: '~/x', env: {} }), path.join(os.homedir(), 'x'));
  assert.equal(resolveDataRoot({ flag: 'rel', env: {} }), path.resolve('rel'));
});
