import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeHostRuns } from './evidence-merge.mjs';
import { verifyReleaseEvidence } from './release-check.mjs';

const TREE = `sha256:${'a'.repeat(64)}`;
const passRow = (id) => ({ id, pass: true, valid_reps: 3, invalid_reps: 0, pass_rate: 1, failures: [], invalid: [], runs: [1, 2, 3].map((rep) => ({ rep, outcome: 'pass', skills: [] })) });
const failRow = (id) => ({ ...passRow(id), pass: false, pass_rate: 2 / 3, failures: [{ rep: 3, check: 'files', message: 'nope' }] });
const invalidRow = (id, kind = 'timeout') => ({ ...passRow(id), pass: false, valid_reps: 2, invalid_reps: 1, pass_rate: 1, invalid: [{ rep: 3, kind, message: 'x' }] });
const run = (file, date, rows, overrides = {}) => ({
  file,
  result: {
    date,
    tree_sha: TREE,
    plugin_version: '1.4.0',
    dataset_sha: `sha256:${'b'.repeat(64)}`,
    fixture_sha: `sha256:${'c'.repeat(64)}`,
    harness: { name: 'codex', launcherVersion: 2, cliVersion: '1' },
    models: ['m'],
    reps: 3,
    rows,
    ...overrides,
  },
});
const options = { requiredRows: ['one', 'two'], reps: 3 };

test('a partial run and a later run of the remaining rows merge into full coverage', () => {
  const { merged, problems } = mergeHostRuns('codex', [run('a', '2026-01-01T00:00:00.000Z', [passRow('one')]), run('b', '2026-01-02T00:00:00.000Z', [passRow('two')])], options);
  assert.deepEqual(problems, []);
  assert.deepEqual(merged.selected_rows, ['one', 'two']);
  const checked = verifyReleaseEvidence({ evidence: [merged], requiredHosts: ['codex'], requiredRows: ['one', 'two'], reps: 3 });
  assert.equal(checked.passed, true);
});

test('an infra-invalid attempt is recorded and superseded by a fresh attempt, never turned into a pass', () => {
  const runs = [run('a', '2026-01-01T00:00:00.000Z', [passRow('one'), invalidRow('two')]), run('b', '2026-01-02T00:00:00.000Z', [passRow('two')])];
  const { merged, problems, notes } = mergeHostRuns('codex', runs, options);
  assert.deepEqual(problems, []);
  assert.ok(notes.some((note) => note.includes('two') && note.includes('timeout')));
  assert.equal(merged.invalid, false);

  const alone = mergeHostRuns('codex', runs.slice(0, 1), options);
  assert.equal(alone.merged.invalid, true);
  assert.equal(verifyReleaseEvidence({ evidence: [alone.merged], requiredHosts: ['codex'], requiredRows: ['one', 'two'], reps: 3 }).passed, false);
});

test('an invalid rerun does not supersede an earlier valid attempt', () => {
  const { merged } = mergeHostRuns('codex', [run('a', '2026-01-01T00:00:00.000Z', [passRow('one'), passRow('two')]), run('b', '2026-01-02T00:00:00.000Z', [invalidRow('two')])], options);
  assert.equal(merged.rows[1].pass, true);
});

test('an earlier behavioral failure on the same tree needs an acknowledgement even after a pass', () => {
  const runs = [run('a', '2026-01-01T00:00:00.000Z', [passRow('one'), failRow('two')]), run('b', '2026-01-02T00:00:00.000Z', [passRow('two')])];
  const blocked = mergeHostRuns('codex', runs, options);
  assert.ok(blocked.problems.some((problem) => problem.includes('codex/two') && problem.includes('acknowledgement')));
  const acknowledged = mergeHostRuns('codex', runs, { ...options, acknowledged: [{ host: 'codex', row: 'two', approved_by: 'maintainer', reason: 'row criteria bug' }] });
  assert.deepEqual(acknowledged.problems, []);
});

test('a later behavioral failure wins over an earlier pass', () => {
  const { merged } = mergeHostRuns('codex', [run('a', '2026-01-01T00:00:00.000Z', [passRow('one'), passRow('two')]), run('b', '2026-01-02T00:00:00.000Z', [failRow('two')])], options);
  assert.equal(merged.rows[1].pass, false);
});

test('runs on a different tree, cli version, model or judge cannot be combined', () => {
  const base = run('a', '2026-01-01T00:00:00.000Z', [passRow('one')], { judge: { type: 'subscription-cli', harness: 'copilot', model: 'j1' } });
  const variants = [
    { tree_sha: `sha256:${'d'.repeat(64)}` },
    { harness: { name: 'codex', launcherVersion: 2, cliVersion: '2' } },
    { models: ['other'] },
    { judge: { type: 'subscription-cli', harness: 'copilot', model: 'j2' } },
  ];
  for (const variant of variants) {
    const { problems } = mergeHostRuns('codex', [base, run('b', '2026-01-02T00:00:00.000Z', [passRow('two')], variant)], options);
    assert.ok(problems.length > 0, JSON.stringify(variant));
  }
  const drift = mergeHostRuns('codex', [base, run('b', '2026-01-02T00:00:00.000Z', [passRow('two')], { harness: { name: 'codex', launcherVersion: 2, cliVersion: '2' } })], { ...options, allowCliDrift: true });
  assert.deepEqual(drift.problems, []);
});

test('summaries without tree_sha cannot be combined', () => {
  const legacy = run('a', '2026-01-01T00:00:00.000Z', [passRow('one')], { tree_sha: undefined });
  const { problems } = mergeHostRuns('codex', [legacy, run('b', '2026-01-02T00:00:00.000Z', [passRow('two')], { tree_sha: undefined })], options);
  assert.ok(problems.some((problem) => problem.includes('tree_sha')));
});
