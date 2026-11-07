import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { initDataRoot } from './init-data-root.mjs';
import { writeSettings } from './write-settings.mjs';

const US = { locale: 'en_US.UTF-8' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const newRoot = () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-write-')), 'chef');
  initDataRoot(root);
  return root;
};
const stored = (root) => JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'));
const seed = (root, content) => fs.writeFileSync(path.join(root, 'settings.json'), content);

test('saves only user-set values and never commits them', () => {
  const root = newRoot();
  const result = writeSettings(root, { units: 'metric', household_recipients: ['a@example.com'] }, US);

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.changed, ['household_recipients', 'units']);
  assert.deepEqual(stored(root), { settings_version: 1, household_recipients: ['a@example.com'], units: 'metric' });
  assert.equal(git(root, 'ls-files'), '.gitignore\nschema-version.json');
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('null resets a key to its default', () => {
  const root = newRoot();
  writeSettings(root, { calendar: 'Family' }, US);
  const result = writeSettings(root, { calendar: null }, US);
  assert.deepEqual(stored(root), { settings_version: 1 });
  assert.equal(result.settings.calendar, null);
});

test('preserves unknown keys', () => {
  const root = newRoot();
  seed(root, '{"settings_version":1,"future_key":{"a":1}}');
  writeSettings(root, { units: 'us' }, US);
  assert.deepEqual(stored(root), { settings_version: 1, future_key: { a: 1 }, units: 'us' });
});

test('flags recipient changes so delivery tasks get re-created', () => {
  const root = newRoot();
  assert.deepEqual(writeSettings(root, { household_recipients: ['a@example.com'] }, US).side_effects, ['recreate-delivery-tasks']);
  assert.deepEqual(writeSettings(root, { household_recipients: ['a@example.com'] }, US).side_effects, []);
  assert.deepEqual(writeSettings(root, { units: 'metric' }, US).side_effects, []);
});

test('rejects invalid input without touching the file', () => {
  const root = newRoot();
  const result = writeSettings(root, { trusted_receipt_senders: ['not-an-email'] }, US);
  assert.equal(result.status, 'invalid-input');
  assert.match(result.problems[0], /not-an-email/);
  assert.deepEqual(stored(root), { settings_version: 1 });
});

test('refuses a broken or newer file unless rewrite is confirmed', () => {
  const root = newRoot();
  seed(root, '{"settings_version":9}');
  const refused = writeSettings(root, { units: 'metric' }, US);
  assert.equal(refused.status, 'refused');
  assert.equal(refused.content, '{"settings_version":9}');
  assert.equal(stored(root).settings_version, 9);

  const rewritten = writeSettings(root, { units: 'metric' }, { ...US, rewrite: true });
  assert.equal(rewritten.status, 'saved');
  assert.deepEqual(stored(root), { settings_version: 1, units: 'metric' });
});

test('refuses a folder that is not a data root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-write-'));
  assert.equal(writeSettings(root, { units: 'us' }, US).status, 'refused');
  assert.equal(fs.existsSync(path.join(root, 'settings.json')), false);
});

test('restores the ignore rule if .gitignore lost it', () => {
  const root = newRoot();
  fs.writeFileSync(path.join(root, '.gitignore'), 'notes/\n');
  writeSettings(root, { units: 'us' }, US);
  assert.equal(git(root, 'check-ignore', 'settings.json'), 'settings.json');
});

test('refuses when settings.json is tracked by data-root git', () => {
  const root = newRoot();
  fs.writeFileSync(path.join(root, '.gitignore'), '');
  git(root, 'add', 'settings.json');
  const result = writeSettings(root, { household_recipients: ['a@example.com'] }, US);
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /tracked/);
  assert.deepEqual(stored(root), { settings_version: 1 });
});

test('refuses on a schema mismatch and points at update Chef', () => {
  const root = newRoot();
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":2}\n');
  const result = writeSettings(root, { units: 'metric' }, US);
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /update Chef/);
  assert.equal(result.schema_version, 2);
  assert.deepEqual(stored(root), { settings_version: 1 });
});
