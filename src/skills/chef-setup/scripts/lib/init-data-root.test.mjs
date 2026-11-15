import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { initDataRoot } from './init-data-root.mjs';
import { buildEvent } from '../../../../lib/diagnostics/capture.mjs';
import { appendEvent, TRACE_FILE } from '../../../../lib/diagnostics/trace.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-setup-'));

test('creates a committed data root with an ignored settings file', () => {
  const root = path.join(tmp(), 'chef');
  const result = initDataRoot(root);

  assert.equal(result.status, 'created');
  assert.equal(result.schema_version, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'schema-version.json'), 'utf8')), { schema_version: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8')), { settings_version: 2 });
  assert.equal(git(root, 'ls-files'), '.gitignore\nschema-version.json');
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.equal(git(root, 'check-ignore', 'settings.json'), 'settings.json');
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '1');
});

test('leaves an existing data root untouched', () => {
  const root = path.join(tmp(), 'chef');
  initDataRoot(root);
  const head = git(root, 'rev-parse', 'HEAD');

  const result = initDataRoot(root);

  assert.equal(result.status, 'exists');
  assert.equal(result.schema_version, 1);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

test('refuses a non-empty directory that is not a data root', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'notes.txt'), 'mine');

  const result = initDataRoot(root);

  assert.equal(result.status, 'refused');
  assert.deepEqual(fs.readdirSync(root), ['notes.txt']);
});

test('a new data root never commits the invocation trace', () => {
  const root = path.join(tmp(), 'chef');
  initDataRoot(root);
  const event = buildEvent({ skill: 'chef-recipe-search', script: 'recipe-search', operation: 'show', outcome: 'ok', startedAt: new Date(), durationMs: 1 });
  appendEvent(root, event);
  git(root, 'add', '-A');
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.deepEqual(git(root, 'log', '--all', '--name-only', '--format=').split('\n').filter((p) => p.startsWith('diagnostics')), []);
  assert.ok(fs.existsSync(path.join(root, TRACE_FILE)));
});
