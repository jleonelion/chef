import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { SCHEMA_VERSION, schemaWriteBlocker } from './schema.mjs';

const root = (content) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-schema-'));
  if (content !== undefined) fs.writeFileSync(path.join(dir, 'schema-version.json'), content);
  return dir;
};

test('current schema allows writes', () => {
  assert.equal(schemaWriteBlocker(root(JSON.stringify({ schema_version: SCHEMA_VERSION }))), null);
});

test('missing schema file means not a data root', () => {
  assert.match(schemaWriteBlocker(root()).reason, /not a Chef data root/);
});

test('a newer schema refuses with an update pointer', () => {
  const blocked = schemaWriteBlocker(root(JSON.stringify({ schema_version: SCHEMA_VERSION + 1 })));
  assert.equal(blocked.schema_version, SCHEMA_VERSION + 1);
  assert.equal(blocked.expected_schema_version, SCHEMA_VERSION);
  assert.match(blocked.reason, /update Chef/);
});

test('an older schema refuses with an update pointer', () => {
  const blocked = schemaWriteBlocker(root(JSON.stringify({ schema_version: 0 })));
  assert.match(blocked.reason, /update Chef/);
});

test('an unreadable schema file refuses instead of throwing', () => {
  assert.match(schemaWriteBlocker(root('{oops')).reason, /schema-version.json/);
  assert.match(schemaWriteBlocker(root('{"schema_version":"1"}')).reason, /schema-version.json/);
});
