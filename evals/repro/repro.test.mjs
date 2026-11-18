import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintRepro } from './repro.mjs';

const validCase = () => ({
  schema_version: 1,
  case_id: 'settings-units-ignored',
  class: 'defect',
  skill_ids: ['chef-setup'],
  chef_version_observed: '1.1.0',
  provenance_refs: ['rc_8f3k2m9q1x'],
  created_on: '2026-11-01',
  scenario: { fixture: 'data-root', test: 'tier1:settings-units-ignored' },
  steps: ['Seed settings.json with units set to metric.', 'Run chef-setup settings.'],
  expected: 'Settings report units as metric.',
  target: 'deterministic-test',
  reviewers: { maintainer: 'chef-maintainer', overlap_review: 'pass' },
});

const lint = ({ file, cases = [validCase()], tier1 = [{ id: 'settings-units-ignored', repro: 'settings-units-ignored' }], agentic = [], today = '2026-11-15', exists = () => true, readText } = {}) =>
  lintRepro({
    cases: cases.map((data) => ({ file: file ?? `${data.case_id}.json`, data, text: JSON.stringify(data, null, 2) })),
    suites: { tier1, agentic },
    today,
    exists,
    readText,
  });

test('a valid case linked both ways passes', () => {
  assert.deepEqual(lint(), []);
});

test('a case that breaks the v1 schema fails', () => {
  const broken = { ...validCase(), provenance_ref: 'x', reviewers: { maintainer: 'chef-maintainer', overlap_review: 'fail' } };
  delete broken.provenance_refs;
  const errors = lint({ cases: [broken] });
  assert.ok(errors.some((e) => e.includes('settings-units-ignored.json') && e.includes('provenance_refs')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('overlap_review')), errors.join('\n'));
});

test('target and test pointer must agree', () => {
  const errors = lint({ cases: [{ ...validCase(), target: 'agentic-eval' }] });
  assert.ok(errors.some((e) => e.includes('scenario/test')), errors.join('\n'));
});

test('the file name must be the case_id', () => {
  assert.deepEqual(lint({ file: 'other.json' }), ['evals/repro/other.json: file name must be settings-units-ignored.json']);
});

test('a case pointing at a missing row, or a row without its repro, fails', () => {
  assert.deepEqual(lint({ tier1: [] }), ['evals/repro/settings-units-ignored.json: tier1 row settings-units-ignored not found']);
  assert.deepEqual(lint({ tier1: [{ id: 'settings-units-ignored' }] }), [
    'evals/repro/settings-units-ignored.json: tier1 row settings-units-ignored must carry repro: settings-units-ignored',
  ]);
});

test('a row whose repro names a missing case, or a case pointing elsewhere, fails', () => {
  assert.deepEqual(lint({ cases: [], tier1: [{ id: 'settings-units-ignored', repro: 'settings-units-ignored' }] }), [
    'tier1 row settings-units-ignored: repro case settings-units-ignored not found in evals/repro',
  ]);
  const other = { ...validCase(), scenario: { fixture: 'data-root', test: 'agentic:plan-week' }, target: 'agentic-eval' };
  assert.deepEqual(lint({ cases: [other], tier1: [{ id: 'settings-units-ignored', repro: 'settings-units-ignored' }], agentic: [{ id: 'plan-week', repro: 'settings-units-ignored' }] }), [
    'tier1 row settings-units-ignored: repro case settings-units-ignored points at agentic:plan-week',
  ]);
});

test('the base fixture must exist and match a tier1 row fixture', () => {
  assert.deepEqual(lint({ exists: (p) => p !== 'fixtures/data-root' }), ['evals/repro/settings-units-ignored.json: fixture fixtures/data-root not found']);
  assert.deepEqual(lint({ tier1: [{ id: 'settings-units-ignored', repro: 'settings-units-ignored', fixture: 'none' }] }), [
    'evals/repro/settings-units-ignored.json: fixture data-root does not match tier1 row fixture none',
  ]);
});

test('docs cases need their doc; conformance cases fail until that suite exists', () => {
  const docs = { ...validCase(), target: 'docs', scenario: { fixture: 'data-root', test: 'docs:README.md' } };
  assert.deepEqual(lint({ cases: [docs], tier1: [] }), []);
  assert.deepEqual(lint({ cases: [docs], tier1: [], exists: (p) => p !== 'README.md' }), ['evals/repro/settings-units-ignored.json: doc README.md not found']);
  const conformance = { ...validCase(), scenario: { fixture: 'data-root', test: 'conformance:x' } };
  assert.deepEqual(lint({ cases: [conformance], tier1: [] }), ['evals/repro/settings-units-ignored.json: conformance suite not found']);
});

test('a none case has no test and is not linked', () => {
  const manual = { ...validCase(), target: 'none', scenario: { fixture: 'data-root' } };
  assert.deepEqual(lint({ cases: [manual], tier1: [] }), []);
});

test('a known_failure marker must match the row repro and expires after 60 days', () => {
  const row = (extra) => [{ id: 'settings-units-ignored', repro: 'settings-units-ignored', known_failure: 'settings-units-ignored', ...extra }];
  assert.deepEqual(lint({ tier1: row(), today: '2026-12-31' }), []);
  assert.deepEqual(lint({ tier1: row(), today: '2027-01-01' }), [
    'tier1 row settings-units-ignored: known_failure settings-units-ignored is 61 days old (max 60); fix it or drop the case',
  ]);
  assert.deepEqual(lint({ tier1: row({ known_failure: 'other-case' }) }), ['tier1 row settings-units-ignored: known_failure other-case must equal repro settings-units-ignored']);
});

test('personal details in a case or a seed fail without echoing the match', () => {
  const leaky = { ...validCase(), steps: [`Email sam.k${'@'}gmail.com the list.`] };
  assert.deepEqual(lint({ cases: [leaky] }), ['evals/repro/settings-units-ignored.json: line 18: email']);
  const seeded = [{ id: 'settings-units-ignored', repro: 'settings-units-ignored', seed: [{ path: 'settings.json', content: '{"phone": "415-555-0134"}' }] }];
  assert.deepEqual(lint({ tier1: seeded }), ['tier1 row settings-units-ignored: seed settings.json line 1: phone']);
  const agenticSeed = [{ id: 'plan-week', afterCommitSeed: [{ path: '/home/sam/notes.md', content: 'ok' }] }];
  assert.deepEqual(lint({ agentic: agenticSeed }), ['agentic row plan-week: seed path: file path']);
});

test('personal details in a seedFile fail', () => {
  const seeded = [{ id: 'settings-units-ignored', repro: 'settings-units-ignored', seed: [{ path: 'settings.json', seedFile: 'evals/tier1/inputs/x/settings.json' }] }];
  assert.deepEqual(lint({ tier1: seeded, readText: () => '{"phone": "415-555-0134"}' }), ['tier1 row settings-units-ignored: seed settings.json line 1: phone']);
});
