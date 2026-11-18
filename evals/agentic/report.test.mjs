import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aggregate, checkFiles, checkResponse, assertScriptPaths, checkScripts, checkSkills } from './report.mjs';
import { resultFilename, sha256File, sha256Tree, verifyProvenance } from './provenance.mjs';
import { validateResult } from './result-schema.mjs';

test('checkSkills requires every expected skill and forbids listed ones', () => {
  checkSkills(['chef-recipe-search', 'chef-add-recipe'], { skills: ['chef-add-recipe'], forbidSkills: ['chef-meal-planning'] });
  assert.throws(() => checkSkills(['chef-recipe-search'], { skills: ['chef-add-recipe'] }), /chef-add-recipe did not fire/);
  assert.throws(() => checkSkills(['chef-meal-planning'], { forbidSkills: ['chef-meal-planning'] }), /chef-meal-planning fired/);
});

test('checkScripts enforces required, forbidden and max script runs', () => {
  const runs = [{ script: 'scripts/a.mjs', args: [] }, { script: 'scripts/a.mjs', args: ['x'] }, { script: 'scripts/b.mjs', args: [] }];
  checkScripts(runs, { required: ['scripts/a.mjs'], forbidden: ['scripts/c.mjs'], max: { 'scripts/a.mjs': 2 } });
  checkScripts([], undefined);
  assert.throws(() => checkScripts(runs, { required: ['scripts/c.mjs'] }), /scripts\/c.mjs did not run \(ran: scripts\/a.mjs, scripts\/b.mjs\)/);
  assert.throws(() => checkScripts(runs, { forbidden: ['scripts/a.mjs'] }), /scripts\/a.mjs ran 2 time/);
  assert.throws(() => checkScripts(runs, { max: { 'scripts/a.mjs': 1 } }), /ran 2 times, max 1/);
  assertScriptPaths({ required: ['scripts/a.mjs'], max: { 'scripts/b.mjs': 1 } });
  assert.throws(() => assertScriptPaths({ forbidden: ['a.mjs'] }), /skill-relative path/);
});

test('checkResponse applies content assertions to the final reply', () => {
  checkResponse('Shopping-list recipients are defaults, not a restriction.', [
    { path: '$.content', includes: 'defaults' },
    { path: '$.content', includes: 'not a restriction' },
  ]);
  assert.throws(() => checkResponse('Recipients are required.', [{ path: '$.content', includes: 'defaults' }]), /missing "defaults"/);
});

function dataRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-agentic-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data', 'store.json'), '{"items":[{"id":"a"}]}');
  fs.writeFileSync(path.join(root, 'page.md'), '# Page\n');
  return root;
}

test('checkFiles asserts present, absent and parsed file contents', (t) => {
  const root = dataRoot(t);
  checkFiles(root, [
    { path: 'page.md', assertions: [{ path: '$.content', includes: '# Page' }] },
    { path: 'data/store.json', parse: 'json', assertions: [{ path: '$.items[0].id', equals: 'a' }] },
    { path: 'missing.md', absent: true },
  ]);
  assert.throws(() => checkFiles(root, [{ path: 'missing.md' }]), /expected file was not written: missing.md/);
  assert.throws(() => checkFiles(root, [{ path: 'page.md', absent: true }]), /file must not be written: page.md/);
});

test('checkFiles counts the files in a folder', (t) => {
  const root = dataRoot(t);
  checkFiles(root, [{ path: 'data', count: 1 }, { path: 'nowhere', count: 0 }]);
  assert.throws(() => checkFiles(root, [{ path: 'data', count: 2 }]), /data: expected 2 files, found 1/);
});

test('aggregate counts passes per row and passes only when every row passed every rep', () => {
  const result = aggregate({
    meta: { commit: 'abc', plugin_version: '0.1.0', date: '2026-01-19' },
    reps: 3,
    rows: [{ id: 'a', flow: 'core' }, { id: 'b', flow: 'should-not-act' }],
    runs: [
      { row: 'a', rep: 1, pass: true, model: 'm1', cost_usd: 1 },
      { row: 'a', rep: 2, pass: true, model: 'm1', cost_usd: 1 },
      { row: 'a', rep: 3, pass: true, model: 'm1', cost_usd: 1 },
      { row: 'b', rep: 1, pass: true, model: 'm1', cost_usd: 0.5 },
      { row: 'b', rep: 2, pass: false, model: 'm1', error: 'boom', cost_usd: 0.5 },
      { row: 'b', rep: 3, pass: true, model: 'm1', cost_usd: 0.5 },
    ],
  });
  assert.equal(result.passed, false);
  assert.deepEqual(result.models, ['m1']);
  assert.equal(result.cost_usd, 4.5);
  assert.deepEqual(
    result.rows.map(({ id, passes, pass }) => ({ id, passes, pass })),
    [
      { id: 'a', passes: '3/3', pass: true },
      { id: 'b', passes: '2/3', pass: false },
    ],
  );
  assert.deepEqual(result.rows[1].failures, [{ rep: 2, error: 'boom' }]);
  assert.equal(result.commit, 'abc');
});

test('aggregate passes a fully green run', () => {
  const result = aggregate({ meta: {}, reps: 1, rows: [{ id: 'a', flow: 'core' }], runs: [{ row: 'a', rep: 1, pass: true, model: 'm1', cost_usd: 0 }] });
  assert.equal(result.passed, true);
});

test('a known_failure row passes the suite while it still fails a rep, and fails it once every rep passes', () => {
  const run = (row, ...passes) => passes.map((pass, i) => ({ row, rep: i + 1, pass, model: 'm1', cost_usd: 0, ...(!pass && { error: 'still broken' }) }));
  const result = aggregate({
    meta: {},
    reps: 2,
    rows: [{ id: 'broken', flow: 'core', known_failure: 'case-1' }, { id: 'fixed', flow: 'core', known_failure: 'case-2' }],
    runs: [...run('broken', true, false), ...run('fixed', true, true)],
  });
  assert.deepEqual(
    result.rows.map(({ id, passes, pass, known_failure }) => ({ id, passes, pass, known_failure })),
    [
      { id: 'broken', passes: '1/2', pass: true, known_failure: 'case-1' },
      { id: 'fixed', passes: '2/2', pass: false, known_failure: 'case-2' },
    ],
  );
  assert.equal(result.passed, false);
});

function validResult() {
  return aggregate({
    meta: {
      date: '2026-11-18T12:00:00.000Z',
      commit: 'a'.repeat(40),
      commit_dirty: false,
      plugin_version: '1.3.1',
      dataset_sha: `sha256:${'b'.repeat(64)}`,
      fixture_sha: `sha256:${'c'.repeat(64)}`,
      harness: { name: 'claude', launcherVersion: 1, cliVersion: '2.0.0' },
      selected_rows: ['a'],
      rows_selected: 1,
      rows_total: 2,
    },
    reps: 1,
    rows: [{ id: 'a', flow: 'core' }],
    runs: [{ row: 'a', rep: 1, pass: true, model: 'm1', cost_usd: 0, skills: ['chef-a'] }],
  });
}

test('agentic result schema accepts a complete result and rejects missing provenance', () => {
  const result = validResult();
  assert.deepEqual(validateResult(result), []);
  delete result.fixture_sha;
  assert(validateResult(result).some((error) => error.includes('fixture_sha')));
});

test('aggregate retains skills and errors for every rep', () => {
  const result = validResult();
  assert.deepEqual(result.rows[0].runs, [{ rep: 1, pass: true, skills: ['chef-a'], error: null }]);
});

test('content hashes change with dataset and fixture content', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-provenance-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'rows.json');
  fs.writeFileSync(file, '[]\n');
  const beforeFile = sha256File(file);
  const beforeTree = sha256Tree(root);
  fs.writeFileSync(file, '[{}]\n');
  assert.notEqual(sha256File(file), beforeFile);
  assert.notEqual(sha256Tree(root), beforeTree);
});

test('result filenames are unique and identify harness, commit, and timestamp', () => {
  const input = { harness: 'claude', commit: 'a'.repeat(40), date: new Date('2026-11-18T12:34:56.789Z') };
  const first = resultFilename({ ...input, nonce: '11111111-1111-1111-1111-111111111111' });
  const second = resultFilename({ ...input, nonce: '22222222-2222-2222-2222-222222222222' });
  assert.match(first, /^claude-aaaaaaaaaaaa-20261118T123456789Z-11111111\.json$/);
  assert.notEqual(first, second);
});

test('provenance verification reports every stale or partial mismatch', () => {
  const result = validResult();
  const current = {
    commit_dirty: false,
    plugin_version: '1.3.2',
    dataset_sha: result.dataset_sha,
    fixture_sha: result.fixture_sha,
    rows_total: 3,
  };
  const problems = verifyProvenance({ result, current, expectedRows: ['b'], expectedReps: 3, expectedHarness: 'codex', changesSince: ['src/a.mjs'] });
  for (const field of ['evaluated commit', 'plugin_version', 'selected_rows', 'rows_total', 'reps', 'harness.name', 'result row ids']) {
    assert(problems.some((problem) => problem.includes(field)), `missing ${field} mismatch`);
  }
});
