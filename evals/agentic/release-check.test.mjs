import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyReleaseEvidence } from './release-check.mjs';

function result(harness, ids, overrides = {}) {
  return {
    harness: { name: harness, launcherVersion: 2, cliVersion: '1' },
    selected_rows: ids,
    rows_selected: ids.length,
    reps: 3,
    passed: true,
    invalid: false,
    rows: ids.map((id) => ({
      id,
      pass: true,
      valid_reps: 3,
      invalid_reps: 0,
      pass_rate: 1,
      judge: overrides.judgeMissing ? undefined : undefined,
    })),
  };
}

test('release evidence requires full-suite 3/3 for every host', () => {
  const ids = ['one', 'two'];
  const evidence = [
    result('codex', ids),
    result('claude', ids),
    result('copilot', ids),
  ];
  assert.deepEqual(verifyReleaseEvidence({ evidence, requiredHosts: ['codex', 'claude', 'copilot'], requiredRows: ids, reps: 3 }), {
    passed: true,
    status: 'pass',
    missing: [],
    failures: [],
    exceptions: [],
  });

  const partial = verifyReleaseEvidence({
    evidence: [evidence[0], evidence[1]],
    requiredHosts: ['codex', 'claude', 'copilot'],
    requiredRows: ids,
    reps: 3,
  });
  assert.equal(partial.passed, false);
  assert.equal(partial.status, 'fail');
  assert.ok(partial.failures.some((failure) => failure.includes('copilot')));
});

test('failing, invalid, partial and zero-row evidence never passes', () => {
  const ids = ['one'];
  const failing = result('claude', ids);
  failing.rows[0].pass = false;
  failing.passed = false;
  for (const evidence of [
    [],
    [result('claude', [])],
    [{ ...result('claude', ids), invalid: true }],
    [failing],
  ]) {
    const checked = verifyReleaseEvidence({ evidence, requiredHosts: ['claude'], requiredRows: ids, reps: 3 });
    assert.equal(checked.passed, false);
  }
});

test('approved subscription-limit exception is recorded as an exception, not a pass', () => {
  const checked = verifyReleaseEvidence({
    evidence: [],
    requiredHosts: ['codex'],
    requiredRows: ['one'],
    reps: 3,
    exceptions: [{
      host: 'codex',
      approved_by: 'maintainer',
      reason: 'subscription limit',
      missing_rows: ['one'],
    }],
  });
  assert.equal(checked.passed, false);
  assert.equal(checked.status, 'exception');
  assert.equal(checked.exceptions.length, 1);
  assert.deepEqual(checked.exceptions[0].missing_rows, ['one']);
});

test('release evidence rejects non-3 repetition counts and incomplete judge coverage', () => {
  const ids = ['judged'];
  const evidence = ['codex', 'claude', 'copilot'].map((host) => ({
    ...result(host, ids),
    rows: [{
      id: 'judged',
      pass: true,
      valid_reps: 3,
      invalid_reps: 0,
      pass_rate: 1,
      judge: { status: 'passing', passes: '1/1' },
    }],
  }));
  const checked = verifyReleaseEvidence({
    evidence,
    requiredHosts: ['codex', 'claude', 'copilot'],
    requiredRows: ids,
    requiredJudgeRows: ids,
    reps: 3,
  });
  assert.equal(checked.passed, false);
  assert.ok(checked.failures.some((failure) => failure.includes('judge did not pass 3/3')));

  const wrongReps = verifyReleaseEvidence({
    evidence: [],
    requiredHosts: [],
    requiredRows: [],
    reps: 1,
  });
  assert.equal(wrongReps.passed, false);
  assert.ok(wrongReps.failures.some((failure) => failure.includes('exactly 3')));
});
