import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aggregate, behaviorCheck, checkFiles, checkResponse, exitCodeFor, assertScriptPaths, checkScripts, checkSkills } from './report.mjs';
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

test('behavioral checks throw stable check identifiers', (t) => {
  const root = dataRoot(t);
  const failures = [
    () => checkSkills([], { skills: ['chef-add-recipe'] }),
    () => checkScripts([], { required: ['scripts/a.mjs'] }),
    () => checkResponse('no', [{ path: '$.content', includes: 'yes' }]),
    () => checkFiles(root, [{ path: 'missing.md' }]),
    () => behaviorCheck('git-state', () => assert.fail('dirty')),
    () => behaviorCheck('post-run', () => assert.fail('wrong output')),
  ];
  assert.deepEqual(
    failures.map((fail) => {
      try {
        fail();
      } catch (error) {
        return error.check;
      }
      return null;
    }),
    ['skills', 'scripts', 'response', 'files', 'git-state', 'post-run'],
  );
});

const passed = (row, rep, extra = {}) => ({ row, rep, outcome: 'pass', model: 'm1', cost_usd: 0, ...extra });
const failed = (row, rep, check, message = 'failed check') => ({ row, rep, outcome: 'failed', model: 'm1', cost_usd: 0, failure: { check, message } });
const invalid = (row, rep, kind, message = 'invalid execution') => ({ row, rep, outcome: 'invalid', model: 'm1', cost_usd: 0, invalid: { kind, message } });

test('aggregate reports passing, broken and flaky rows from valid reps', () => {
  const result = aggregate({
    meta: { commit: 'abc', plugin_version: '0.1.0', date: '2026-01-19' },
    reps: 3,
    rows: [{ id: 'passing', flow: 'core' }, { id: 'broken', flow: 'core' }, { id: 'flaky', flow: 'should-not-act' }],
    runs: [
      passed('passing', 1, { cost_usd: 1 }),
      passed('passing', 2, { cost_usd: 1 }),
      passed('passing', 3, { cost_usd: 1 }),
      failed('broken', 1, 'response'),
      failed('broken', 2, 'response'),
      failed('broken', 3, 'response'),
      passed('flaky', 1, { cost_usd: 0.5 }),
      failed('flaky', 2, 'skills'),
      passed('flaky', 3, { cost_usd: 0.5 }),
    ],
  });
  assert.equal(result.passed, false);
  assert.deepEqual(result.models, ['m1']);
  assert.equal(result.cost_usd, 4);
  assert.deepEqual(
    result.rows.map(({ id, classification, behavior, passes, pass_rate, valid_reps, invalid_reps, flaky, pass }) => ({
      id,
      classification,
      behavior,
      passes,
      pass_rate,
      valid_reps,
      invalid_reps,
      flaky,
      pass,
    })),
    [
      { id: 'passing', classification: 'passing', behavior: 'passing', passes: '3/3', pass_rate: 1, valid_reps: 3, invalid_reps: 0, flaky: false, pass: true },
      { id: 'broken', classification: 'broken', behavior: 'broken', passes: '0/3', pass_rate: 0, valid_reps: 3, invalid_reps: 0, flaky: false, pass: false },
      { id: 'flaky', classification: 'flaky', behavior: 'flaky', passes: '2/3', pass_rate: 2 / 3, valid_reps: 3, invalid_reps: 0, flaky: true, pass: false },
    ],
  );
  assert.deepEqual(result.rows[2].failures, [{ rep: 2, check: 'skills', message: 'failed check' }]);
  assert.deepEqual(result.rows[2].runs[0], { rep: 1, outcome: 'pass', skills: [] });
  assert.deepEqual(result.rows[2].runs[1], { rep: 2, outcome: 'failed', skills: [], failure: { check: 'skills', message: 'failed check' } });
  assert.equal(result.commit, 'abc');
});

test('aggregate excludes invalid reps from pass rates and reports each invalid cause', () => {
  const kinds = ['timeout', 'rate_limit', 'process', 'transcript', 'harness'];
  const result = aggregate({
    meta: {},
    reps: 7,
    rows: [{ id: 'mixed', flow: 'core' }],
    runs: [passed('mixed', 1), failed('mixed', 2, 'files'), ...kinds.map((kind, index) => invalid('mixed', index + 3, kind, `${kind} detail`))],
  });
  const { runs, ...summary } = result.rows[0];
  assert.deepEqual(summary, {
    id: 'mixed',
    flow: 'core',
    passes: '1/2',
    pass_rate: 0.5,
    valid_reps: 2,
    invalid_reps: 5,
    behavior: 'flaky',
    classification: 'invalid',
    flaky: true,
    pass: false,
    failures: [{ rep: 2, check: 'files', message: 'failed check' }],
    invalid: kinds.map((kind, index) => ({ rep: index + 3, kind, message: `${kind} detail` })),
  });
  assert.equal(runs.length, 7);
  assert.equal(result.invalid, true);
});

test('missing rep records make the row invalid instead of silently reducing the gate', () => {
  const result = aggregate({ meta: {}, reps: 3, rows: [{ id: 'incomplete', flow: 'core' }], runs: [passed('incomplete', 1)] });
  assert.equal(result.passed, false);
  assert.equal(result.invalid, true);
  assert.equal(result.rows[0].classification, 'invalid');
  assert.equal(result.rows[0].valid_reps, 1);
  assert.deepEqual(result.rows[0].invalid, [
    { rep: 2, kind: 'harness', message: 'rep produced no result' },
    { rep: 3, kind: 'harness', message: 'rep produced no result' },
  ]);
});

test('a known failure is reproduced only by its expected behavioral check', () => {
  const result = aggregate({
    meta: {},
    reps: 2,
    rows: [
      { id: 'expected', flow: 'core', known_failure: 'case-1', expect_failure: 'response' },
      { id: 'unexpected', flow: 'core', known_failure: 'case-2', expect_failure: 'response' },
      { id: 'fixed', flow: 'core', known_failure: 'case-3', expect_failure: 'response' },
      { id: 'invalid', flow: 'core', known_failure: 'case-4', expect_failure: 'response' },
    ],
    runs: [
      passed('expected', 1),
      failed('expected', 2, 'response'),
      failed('unexpected', 1, 'response'),
      failed('unexpected', 2, 'files'),
      passed('fixed', 1),
      passed('fixed', 2),
      failed('invalid', 1, 'response'),
      invalid('invalid', 2, 'timeout'),
    ],
  });
  assert.deepEqual(
    result.rows.map(({ id, pass, known_failure_reproduced }) => ({ id, pass, known_failure_reproduced })),
    [
      { id: 'expected', pass: true, known_failure_reproduced: true },
      { id: 'unexpected', pass: false, known_failure_reproduced: true },
      { id: 'fixed', pass: false, known_failure_reproduced: false },
      { id: 'invalid', pass: false, known_failure_reproduced: true },
    ],
  );
  assert.equal(result.passed, false);
});

test('exitCodeFor distinguishes behavioral failures from invalid executions', () => {
  assert.equal(exitCodeFor({ passed: true, invalid: false }), 0);
  assert.equal(exitCodeFor({ passed: false, invalid: false }), 1);
  assert.equal(exitCodeFor({ passed: false, invalid: true }), 2);
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
      harness: { name: 'claude', launcherVersion: 2, cliVersion: '2.0.0' },
      selected_rows: ['a'],
      rows_selected: 1,
      rows_total: 2,
    },
    reps: 1,
    rows: [{ id: 'a', flow: 'core' }],
    runs: [{ row: 'a', rep: 1, outcome: 'pass', model: 'm1', cost_usd: 0, skills: ['chef-a'] }],
  });
}

test('agentic result schema accepts a complete result and rejects missing provenance', () => {
  const result = validResult();
  assert.deepEqual(validateResult(result), []);
  delete result.fixture_sha;
  assert(validateResult(result).some((error) => error.includes('fixture_sha')));
});

test('aggregate retains skills and outcomes for every rep', () => {
  assert.deepEqual(validResult().rows[0].runs, [{ rep: 1, outcome: 'pass', skills: ['chef-a'] }]);
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
