import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { aggregate, behaviorCheck, checkFiles, checkResponse, checkReplyDenyList, checkTools, exitCodeFor, assertScriptPaths, checkScripts, checkSkills, recordBehaviorFailure } from './report.mjs';
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

test('checkScripts matches required and forbidden call argument prefixes', () => {
  const runs = [
    { script: 'scripts/inventory.mjs', args: ['check-sender', '--from', 'orders@example.com'] },
    { script: 'scripts/other.mjs', args: ['read'] },
  ];
  const checkSender = { script: 'scripts/inventory.mjs', args: ['check-sender'] };
  const addReceipt = { script: 'scripts/inventory.mjs', args: ['add-receipt'] };
  checkScripts(runs, { requiredCalls: [checkSender], forbiddenCalls: [addReceipt] });
  assert.throws(() => checkScripts(runs, { requiredCalls: [addReceipt] }), /scripts\/inventory\.mjs add-receipt did not run/);
  assert.throws(() => checkScripts(runs, { forbiddenCalls: [checkSender] }), /scripts\/inventory\.mjs check-sender ran/);
  assertScriptPaths({ requiredCalls: [checkSender], forbiddenCalls: [addReceipt] });
  assert.throws(() => assertScriptPaths({ forbiddenCalls: [{ script: 'inventory.mjs', args: ['add-receipt'] }] }), /skill-relative path/);
});

test('checkTools forbids named Trajectory tool calls', () => {
  const calls = [{ name: 'Read', path: '/tmp/list.md' }, { name: 'gmail.send' }];
  checkTools(calls, { forbidden: ['Write'] });
  checkTools([], undefined);
  assert.throws(() => checkTools(calls, { forbidden: ['gmail.send'] }), /gmail\.send was called/);
});

test('checkResponse applies content assertions to the final reply', () => {
  checkResponse('Shopping-list recipients are defaults, not a restriction.', [
    { path: '$.content', includes: 'defaults' },
    { path: '$.content', includes: 'not a restriction' },
  ]);
  assert.throws(() => checkResponse('Recipients are required.', [{ path: '$.content', includes: 'defaults' }]), /missing "defaults"/);
});

test('household recipient reply assertions accept equivalent wording and reject wrong semantics', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'));
  const row = rows.find(({ id }) => id === 'chef-setup-household-recipients');
  const assertions = row.responses[0];
  const rewordedTranscript =
    'I’ll use these people as the default shopping-list recipients. A recurring shopping task needs explicit approval, and this does not prevent you from asking Chef to email anyone else.';
  const wrongTranscript =
    'The household addresses are the mandatory default recipients for shopping lists. The recurring task does not need approval, and anyone else is forbidden.';
  const maxInvariantLength = 9;

  checkResponse(rewordedTranscript, assertions);
  assert.throws(() => checkResponse(wrongTranscript, assertions), /missing|unexpected/);
  for (const assertion of assertions) {
    for (const key of ['includes', 'excludes']) {
      if (assertion[key]) assert.ok(assertion[key].length <= maxInvariantLength, `reply invariant is too coupled: "${assertion[key]}"`);
    }
  }
  assert.match(row.description, /Rationale:/);
});

test('checkReplyDenyList rejects internal vocabulary but allows Chef product language', () => {
  checkReplyDenyList('Chef saved the recipe.');
  assert.throws(
    () => checkReplyDenyList('Read CHEF_DATA_ROOT before running scripts/add-recipe.mjs'),
    (error) => error.check === 'response',
  );
});

function dataRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-agentic-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data', 'store.json'), '{"items":[{"id":"a"}]}');
  fs.writeFileSync(path.join(root, 'page.md'), '# Page\n');
  return root;
}

test('checkFiles asserts present, absent and parsed file contents', async (t) => {
  const root = dataRoot(t);
  await checkFiles(root, [
    { path: 'page.md', assertions: [{ path: '$.content', includes: '# Page' }] },
    { path: 'data/store.json', parse: 'json', assertions: [{ path: '$.items[0].id', equals: 'a' }] },
    { path: 'missing.md', absent: true },
  ]);
  await assert.rejects(checkFiles(root, [{ path: 'missing.md' }]), /expected file was not written: missing.md/);
  await assert.rejects(checkFiles(root, [{ path: 'page.md', absent: true }]), /file must not be written: page.md/);
});

test('checkFiles counts the files in a folder', async (t) => {
  const root = dataRoot(t);
  await checkFiles(root, [{ path: 'data', count: 1 }, { path: 'nowhere', count: 0 }]);
  await checkFiles(root, [{ path: 'data', count: { baseline: 0, delta: 1 } }]);
  await assert.rejects(checkFiles(root, [{ path: 'data', count: 2 }]), /data: expected 2 files, found 1/);
});

test('checkFiles parses PDFs and rejects empty PDF content', async (t) => {
  const root = dataRoot(t);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Lemon Garlic Pasta', { font });
  const bytes = await pdf.save();
  fs.writeFileSync(path.join(root, 'plan.pdf'), bytes);
  await checkFiles(root, [{ path: 'plan.pdf', parse: 'pdf', assertions: [
    { path: '$.valid', equals: true },
    { path: '$.pages', equals: 1 },
    { path: '$.text', includes: 'Lemon Garlic Pasta' },
  ] }]);

  const empty = await PDFDocument.create();
  empty.addPage();
  fs.writeFileSync(path.join(root, 'empty.pdf'), await empty.save());
  await assert.rejects(checkFiles(root, [{ path: 'empty.pdf', parse: 'pdf', assertions: [
    { path: '$.text', includes: 'Lemon Garlic Pasta' },
  ] }]), /missing "Lemon Garlic Pasta"/);
});

test('checkFiles rejects inventory containing a reusable bag', async (t) => {
  const root = dataRoot(t);
  fs.writeFileSync(path.join(root, 'data', 'inventory.json'), JSON.stringify({
    pantry: { canned: { reusable_bag: { name: 'reusable bag', amount: 1, unit: 'each' } } },
  }));
  await assert.rejects(checkFiles(root, [{
    path: 'data/inventory.json',
    parse: 'json',
    assertions: [{ path: '$.pantry.canned.reusable_bag', absent: true }],
  }]), /pantry\.canned\.reusable_bag: expected absent/);
});

test('behavioral checks throw stable check identifiers', async (t) => {
  const root = dataRoot(t);
  const failures = [
    () => checkSkills([], { skills: ['chef-add-recipe'] }),
    () => checkScripts([], { required: ['scripts/a.mjs'] }),
    () => checkTools([{ name: 'Write' }], { forbidden: ['Write'] }),
    () => checkResponse('no', [{ path: '$.content', includes: 'yes' }]),
    async () => checkFiles(root, [{ path: 'missing.md' }]),
    () => behaviorCheck('git-state', () => assert.fail('dirty')),
    () => behaviorCheck('post-run', () => assert.fail('wrong output')),
  ];
  assert.deepEqual(
    await Promise.all(failures.map(async (fail) => {
      try {
        await fail();
      } catch (error) {
        return error.check;
      }
      return null;
    })),
    ['skills', 'scripts', 'tools', 'response', 'files', 'git-state', 'post-run'],
  );
});

test('recordBehaviorFailure collects behavioral failures and rethrows harness errors', async () => {
  const failures = [];
  await recordBehaviorFailure(failures, () => behaviorCheck('response', () => assert.fail('wrong response')));
  await recordBehaviorFailure(failures, () => behaviorCheck('files', () => assert.fail('missing file')));
  assert.deepEqual(failures, [
    { check: 'response', message: 'wrong response' },
    { check: 'files', message: 'missing file' },
  ]);
  await assert.rejects(recordBehaviorFailure(failures, () => assert.fail('harness failed')), /harness failed/);
});

const passed = (row, rep, extra = {}) => ({ row, rep, outcome: 'pass', model: 'm1', cost_usd: 0, ...extra });
const failed = (row, rep, check, message = 'failed check') => ({ row, rep, outcome: 'failed', model: 'm1', cost_usd: 0, failure: { check, message } });
const failedMany = (row, rep, failures) => ({ row, rep, outcome: 'failed', model: 'm1', cost_usd: 0, failure: failures[0], failures });
const invalid = (row, rep, kind, message = 'invalid execution') => ({ row, rep, outcome: 'invalid', model: 'm1', cost_usd: 0, invalid: { kind, message } });

test('judge failures are separate from behavioral passes', () => {
  const result = aggregate({
    meta: {},
    reps: 1,
    rows: [{ id: 'judged', flow: 'core', judge: { expected: 'complete', threshold: 0.7 } }],
    runs: [{
      row: 'judged',
      rep: 1,
      outcome: 'pass',
      judge: { pass: false, score: 0.4, verdict: null, reason: 'missing critical detail' },
      judge_failure: { message: 'missing critical detail' },
    }],
  });
  assert.equal(result.rows[0].behavior, 'passing');
  assert.equal(result.rows[0].pass, false);
  assert.deepEqual(result.rows[0].judge_failures, [
    { rep: 1, check: 'judge', message: 'missing critical detail' },
  ]);
  assert.deepEqual(result.rows[0].runs[0].judge, { pass: false, score: 0.4, verdict: null, reason: 'missing critical detail' });
});

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

test('an expected and unrelated failure in the same rep does not reproduce a known failure', () => {
  const result = aggregate({
    meta: {},
    reps: 1,
    rows: [{ id: 'multiple', flow: 'core', known_failure: 'case-1', expect_failure: 'response' }],
    runs: [
      failedMany('multiple', 1, [
        { check: 'response', message: 'expected failure' },
        { check: 'files', message: 'unexpected failure' },
      ]),
    ],
  });
  assert.equal(result.rows[0].known_failure_reproduced, true);
  assert.equal(result.rows[0].pass, false);
  assert.deepEqual(result.rows[0].failures, [
    { rep: 1, check: 'response', message: 'expected failure' },
    { rep: 1, check: 'files', message: 'unexpected failure' },
  ]);
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

test('agentic result schema rejects behavioral failures on a passing rep', () => {
  const result = validResult();
  result.rows[0].runs[0].failures = [{ check: 'files', message: 'unexpected file' }];
  assert(validateResult(result).some((error) => error.includes('must NOT be valid')));
});

test('agentic result schema accepts tools as a behavioral failure check', () => {
  const result = validResult();
  result.passed = false;
  result.rows[0].pass = false;
  result.rows[0].failures = [{ rep: 1, check: 'tools', message: 'gmail.send was called' }];
  result.rows[0].runs[0] = { rep: 1, outcome: 'failed', skills: ['chef-a'], failure: { check: 'tools', message: 'gmail.send was called' } };
  assert.deepEqual(validateResult(result), []);
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
