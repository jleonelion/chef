import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadCases } from './load-cases.mjs';

function cases(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-cases-'));
  for (const [name, rows] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(rows));
  return dir;
}

test('concatenates files in name order, ignoring non-json files', () => {
  const dir = cases({ 'b.json': [{ id: 'b-1' }], 'a.json': [{ id: 'a-1' }, { id: 'a-2' }], 'notes.txt': 'x' });
  assert.deepEqual(loadCases(dir).map((row) => row.id), ['a-1', 'a-2', 'b-1']);
});

test('a duplicate id across files throws naming both files', () => {
  assert.throws(() => loadCases(cases({ 'a.json': [{ id: 'x-1' }], 'b.json': [{ id: 'x-1' }] })), /duplicate id x-1 in .*a\.json and .*b\.json/);
});

test('accepts a single file and rejects a non-array', () => {
  const dir = cases({ 'a.json': [{ id: 'a-1' }], 'bad.json': { id: 'x' } });
  assert.equal(loadCases(path.join(dir, 'a.json')).length, 1);
  assert.throws(() => loadCases(dir), /must be an array/);
});
