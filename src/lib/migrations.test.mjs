import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { migrate } from './migrations.mjs';
import { readSchemaVersion, SCHEMA_VERSION } from './schema.mjs';

const root = (version) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-migrate-'));
  fs.writeFileSync(path.join(dir, 'schema-version.json'), JSON.stringify({ schema_version: version }));
  return dir;
};

test('a current data root needs no migration', () => {
  const dir = root(SCHEMA_VERSION);
  assert.deepEqual(migrate(dir), { from: SCHEMA_VERSION, to: SCHEMA_VERSION, applied: [] });
});

test('applies each step in order and stamps the schema version after each', () => {
  const dir = root(1);
  const seen = [];
  const migrations = {
    1: (r) => seen.push(`1->2 at ${readSchemaVersion(r)}`),
    2: (r) => seen.push(`2->3 at ${readSchemaVersion(r)}`),
  };
  const result = migrate(dir, { migrations, target: 3 });
  assert.deepEqual(result, { from: 1, to: 3, applied: [1, 2] });
  assert.deepEqual(seen, ['1->2 at 1', '2->3 at 2']);
  assert.equal(readSchemaVersion(dir), 3);
});

test('a missing step stops before changing anything', () => {
  const dir = root(1);
  assert.throws(() => migrate(dir, { migrations: { 1: () => {} }, target: 3 }), /no migration from schema 2/);
  assert.equal(readSchemaVersion(dir), 1);
});

test('a data root newer than this Chef is refused', () => {
  assert.throws(() => migrate(root(SCHEMA_VERSION + 1)), /newer/);
});
