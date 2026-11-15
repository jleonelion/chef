// End to end over the example case in testdata/: the real lint and tier1 runner, seed overlay included.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const repo = path.resolve(import.meta.dirname, '..', '..');
const testdata = path.join(import.meta.dirname, 'testdata');
const row = JSON.parse(fs.readFileSync(path.join(testdata, 'tier1.json'), 'utf8'))[0];
const node = (...args) => spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8' });

function tier1(rowOverride) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-repro-'));
  const cases = path.join(dir, 'tier1.json');
  fs.writeFileSync(cases, JSON.stringify([{ ...row, ...rowOverride }]));
  try {
    return node('evals/tier1/run.mjs', '--cases', cases);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const lint = (...extra) =>
  node('evals/repro/lint.mjs', '--repro-dir', path.join(testdata, 'repro'), '--tier1', path.join(testdata, 'tier1.json'), '--agentic', path.join(testdata, 'none.json'), ...extra);

test('the example case validates and links both ways with its tier1 row', () => {
  const result = lint('--today', '2026-11-15');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 case/);
});

test('the example row passes with its seed overlay on the shared fixture', () => {
  const result = tier1();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /ok - example-seeded-units/);
});

test('a known_failure row that still fails is reported without failing the run', () => {
  const result = tier1({ known_failure: row.repro, assertions: [{ path: '$.settings.units', equals: 'us' }] });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /known failure - example-seeded-units \(repro example-seeded-units\)/);
});

test('a known_failure row that passes fails the run', () => {
  const result = tier1({ known_failure: row.repro });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /example-seeded-units passed but is marked known_failure: example-seeded-units; remove the marker/);
});

test('a known_failure row that is broken, not failing a check, still fails the run', () => {
  const result = tier1({ known_failure: row.repro, parse: 'yaml' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown parse mode: yaml/);
});
