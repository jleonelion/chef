import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { invocationTraceProblems } from '../../../lib/diagnostics/test-schemas.mjs';
import { readTrace } from '../../../lib/diagnostics/trace.mjs';

const script = path.join(import.meta.dirname, 'recipe-search.mjs');
const fixture = path.join(import.meta.dirname, '..', '..', '..', '..', 'fixtures', 'data-root');

function fixtureRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-recipe-search-')), 'data-root');
  fs.cpSync(fixture, root, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  return root;
}
const runScript = (root, ...args) => spawnSync(process.execPath, [script, ...args, '--data-root', root], { encoding: 'utf8' });

test('running recipe-search appends one schema-valid event per run', () => {
  const root = fixtureRoot();
  assert.equal(runScript(root, 'search', '--query', 'pasta').status, 0);
  assert.equal(runScript(root, 'show', '--slug', 'no-such-recipe').status, 0);
  const trace = readTrace(root);
  assert.deepEqual(invocationTraceProblems(trace), []);
  assert.deepEqual(trace.events.map((e) => [e.operation, e.outcome, e.error_code]), [
    ['search', 'ok', null],
    ['show', 'validation-error', 'recipe-not-found'],
  ]);
  assert.doesNotMatch(JSON.stringify(trace), /pasta|no-such-recipe/);
});
