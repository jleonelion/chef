#!/usr/bin/env node
// Tier1 deterministic evals: run each case's built script against a throwaway data root,
// then assert on its output and on what it wrote. `seed` writes files into the data root
// first; `env` overrides environment variables (e.g. a fixed LANG for locale defaults). Ported from chef-core evals/tier1.
// Each assertion is {path, <check>}: `equals` (exact deep-equal), `includes` (string/array member),
// `min` (number >=), `absent` (true: key missing; false: key present). See assertions.mjs.
//   node evals/tier1/run.mjs [--skills-dir <dir>] [--fixture <data root>]
//   (defaults: plugins/chef/skills, fixtures/data-root)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertCase } from './assertions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
function prepare(testCase, fixture) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `chef-tier1-${testCase.id}-`));
  const dataRoot = path.join(tmp, 'data-root');
  if ((testCase.fixture ?? 'data-root') === 'data-root') fs.cpSync(fixture, dataRoot, { recursive: true });
  for (const file of testCase.seed ?? []) fs.writeFileSync(path.join(dataRoot, file.path), file.content);
  return { tmp, dataRoot };
}

function parseOutput(mode, result) {
  if (mode === 'json') return JSON.parse(result.stdout);
  if (mode === 'stdout') return { stdout: result.stdout, stderr: result.stderr, status: result.status };
  throw new Error(`Unknown parse mode: ${mode}`);
}

function readTarget(dataRoot, target) {
  const abs = path.join(dataRoot, target.path);
  assert(fs.existsSync(abs), `expected file was not written: ${target.path}`);
  const content = fs.readFileSync(abs, 'utf8');
  return (target.parse ?? 'text') === 'json' ? JSON.parse(content) : { content };
}

function runCase(testCase, skillsDir, fixture) {
  const { tmp, dataRoot } = prepare(testCase, fixture);
  try {
    const expand = (arg) => arg.replaceAll('{skills}', skillsDir).replaceAll('{data_root}', dataRoot);
    const [cmd, ...args] = testCase.command.map(expand);
    const result = spawnSync(cmd, args, {
      cwd: tmp,
      env: { ...process.env, CHEF_DATA_ROOT: dataRoot, ...testCase.env },
      encoding: 'utf8',
      timeout: 30000,
    });
    const expected = testCase.expectedStatus ?? 0;
    assert.equal(result.status, expected, `${testCase.id} exited ${result.status}, expected ${expected}\n${result.stdout}\n${result.stderr}`);
    const evaluation = parseOutput(testCase.parse, result);
    for (const assertion of testCase.assertions ?? []) assertCase(evaluation, assertion);
    for (const target of testCase.files ?? []) {
      const written = readTarget(dataRoot, target);
      for (const assertion of target.assertions ?? []) assertCase(written, assertion);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const { values } = parseArgs({ options: { 'skills-dir': { type: 'string' }, fixture: { type: 'string' } } });
const skillsDir = path.resolve(values['skills-dir'] ?? path.join(repo, 'plugins', 'chef', 'skills'));
const fixture = path.resolve(values.fixture ?? path.join(repo, 'fixtures', 'data-root'));
const cases = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));
for (const testCase of cases) {
  runCase(testCase, skillsDir, fixture);
  console.log(`ok - ${testCase.id}`);
}
console.log(`Tier 1 deterministic evals passed: ${cases.length}/${cases.length}`);
