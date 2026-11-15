// chef-setup report modes end to end off Muse: a real recipe search, then draft, remove, send.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { feedbackReportProblems } from '../../../lib/diagnostics/test-schemas.mjs';
import { bytesFromPreview } from '../../../lib/feedback/preview.mjs';

const setup = path.join(import.meta.dirname, 'setup.mjs');
const search = path.join(import.meta.dirname, '..', '..', 'chef-recipe-search', 'scripts', 'recipe-search.mjs');
const fixture = path.join(import.meta.dirname, '..', '..', '..', '..', 'fixtures', 'data-root');

function fixtureRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-report-')), 'data-root');
  fs.cpSync(fixture, root, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  return root;
}
function run(root, script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args, '--data-root', root], { encoding: 'utf8' });
  return { status: result.status, out: JSON.parse(result.stdout) };
}
const numberOf = (preview, id) => Number(preview.match(new RegExp(`^\\[\\s*(\\d+)\\] ${id.replace(/[[\]]/g, '\\$&')} = `, 'm'))[1]);
const DEFECT = ['--class', 'defect', '--summary', 'Search finds nothing for a dairy item', '--expected', 'Recipes with it', '--actual', 'An empty list', '--frequency', 'always', '--skill-ids', 'chef-recipe-search'];

test('a defect report is drafted from the trace, trimmed and saved locally, never sent', () => {
  const root = fixtureRoot();
  run(root, search, 'search', '--query', 'pasta');
  run(root, search, 'search', '--query', 'gnocchi');

  const draft = run(root, setup, 'report-draft', ...DEFECT);
  assert.equal(draft.out.status, 'draft');
  assert.equal(draft.out.can_send, false);
  assert.match(draft.out.send_notice, /isn't supported in this runtime/);
  const raw = run(root, setup, 'report-preview', '--raw').out.raw;
  assert.equal(raw, bytesFromPreview(draft.out.preview));
  const report = JSON.parse(raw);
  assert.deepEqual(feedbackReportProblems(report), []);
  assert.equal(report.diagnostic_bundle.events.length, 2);
  assert.equal(report.diagnostic_bundle.environment.runtime.name, 'unknown');
  assert.doesNotMatch(raw, /pasta|gnocchi|data-root|chef-report-/);

  const removed = run(root, setup, 'report-remove', '--item', String(numberOf(draft.out.preview, 'diagnostic_bundle.events[inv-1]')));
  assert.equal(removed.out.status, 'draft');
  assert.match(removed.out.preview, /^Not sent \(you removed\): diagnostic_bundle\.events\[inv-1\]$/m);

  const stale = run(root, setup, 'report-send', '--nonce', draft.out.submission_nonce);
  assert.equal(stale.status, 2);
  assert.equal(stale.out.status, 'refused');

  const saved = run(root, setup, 'report-send', '--nonce', removed.out.submission_nonce);
  assert.equal(saved.out.status, 'saved');
  assert.equal(fs.readFileSync(path.join(root, saved.out.path), 'utf8'), bytesFromPreview(removed.out.preview));
  assert.equal(run(root, setup, 'report-preview').out.status, 'refused', 'no draft is left');
  assert.doesNotMatch(execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' }), /diagnostics/, 'diagnostics/ stays out of git');
});

test('editing a required field re-renders with a new nonce; removing it is refused', () => {
  const root = fixtureRoot();
  const { out } = run(root, setup, 'report-draft', ...DEFECT);
  const summary = String(numberOf(out.preview, 'summary'));
  const refused = run(root, setup, 'report-remove', '--item', summary);
  assert.equal(refused.out.status, 'invalid-input');
  assert.match(refused.out.problems[0], /cannot be removed; it can be edited/);
  const edited = run(root, setup, 'report-edit', '--item', summary, '--value', 'Search misses a dairy item').out;
  assert.notEqual(edited.submission_nonce, out.submission_nonce);
  assert.equal(numberOf(edited.preview, 'summary'), Number(summary));
  assert.equal(JSON.parse(bytesFromPreview(edited.preview)).summary, 'Search misses a dairy item');
});

test('with the trace off the report says the runs were not observed', () => {
  const root = fixtureRoot();
  run(root, setup, 'set', '--trace', 'off');
  const { out } = run(root, setup, 'report-draft', ...DEFECT);
  assert.match(out.preview, /\(trace_unavailable\)$/m);
});

test('a draft missing a class field is refused with the problem', () => {
  const root = fixtureRoot();
  const { status, out } = run(root, setup, 'report-draft', '--class', 'defect', '--summary', 'Broken');
  assert.equal(status, 2);
  assert.match(out.problems.join(' '), /expected: required/);
});

const rawReport = (root) => JSON.parse(run(root, setup, 'report-preview', '--raw').out.raw);
const plan = path.join(import.meta.dirname, '..', '..', 'chef-meal-planning', 'scripts', 'meal-planning.mjs');

test('a report needs a class; Chef never picks one', () => {
  const root = fixtureRoot();
  const { status, out } = run(root, setup, 'report-draft', '--summary', 'Something is off');
  assert.equal(status, 2);
  assert.match(out.problems.join(' '), /class: must be one of defect, enhancement, behavior_change/);
});

test('enhancement and behavior-change reports carry their class fields and attach no diagnostics by default', () => {
  const root = fixtureRoot();
  run(root, search, 'search', '--query', 'pasta');
  const enhancement = run(root, setup, 'report-draft', '--class', 'enhancement', '--summary', 'Search by cooking time', '--desired-outcome', 'Filter recipes by total time');
  assert.equal(enhancement.out.status, 'draft');
  let report = rawReport(root);
  assert.deepEqual(feedbackReportProblems(report), []);
  assert.equal(report.desired_outcome, 'Filter recipes by total time');
  assert.equal(report.diagnostic_bundle, undefined);

  const unnamed = run(root, setup, 'report-draft', '--class', 'behavior_change', '--summary', 'Ask before planning', '--current-behavior', 'Plans at once', '--desired-behavior', 'Asks first');
  assert.match(unnamed.out.problems.join(' '), /skill_ids: name at least one skill/);
  run(root, setup, 'report-draft', '--class', 'behavior_change', '--summary', 'Ask before planning', '--current-behavior', 'Plans at once', '--desired-behavior', 'Asks first', '--skill-ids', 'chef-meal-planning');
  report = rawReport(root);
  assert.deepEqual(feedbackReportProblems(report), []);
  assert.deepEqual([report.current_behavior, report.desired_behavior, report.skill_ids], ['Plans at once', 'Asks first', ['chef-meal-planning']]);
  assert.equal(report.diagnostic_bundle, undefined);
});

test('with no recent runs of the skill, a defect attaches the last runs of any skill and the preview says so', () => {
  const root = fixtureRoot();
  run(root, plan, 'today', '--date', '2026-01-05');
  const { out } = run(root, setup, 'report-draft', ...DEFECT);
  assert.deepEqual(rawReport(root).diagnostic_bundle.events.map((e) => e.skill_id), ['chef-meal-planning']);
  assert.match(out.preview, /^Diagnostics: no runs of chef-recipe-search in the last hour, so these are the last 10 runs of any skill\./m);
  assert.equal(bytesFromPreview(out.preview), JSON.stringify(rawReport(root)), 'the note is not part of the payload');
});

test('widened diagnostics take every skill in the window', () => {
  const root = fixtureRoot();
  run(root, search, 'search', '--query', 'pasta');
  run(root, plan, 'today', '--date', '2026-01-05');
  const { out } = run(root, setup, 'report-draft', ...DEFECT, '--diagnostics', 'wide');
  assert.deepEqual(rawReport(root).diagnostic_bundle.events.map((e) => e.skill_id), ['chef-recipe-search', 'chef-meal-planning']);
  assert.doesNotMatch(out.preview, /^Diagnostics:/m);
  assert.equal(run(root, setup, 'report-draft', ...DEFECT, '--diagnostics', 'some').out.status, 'invalid-input');
});

test('volunteered contact is dropped before preview with a notice when the runtime cannot take it', () => {
  const root = fixtureRoot();
  const { out } = run(root, setup, 'report-draft', ...DEFECT, '--contact', 'reach me at someone@example.com');
  assert.equal(out.status, 'draft');
  assert.match(out.contact_notice, /dropped/);
  assert.equal(out.can_ask_contact, false);
  assert.doesNotMatch(out.preview + run(root, setup, 'report-preview', '--raw').out.raw, /someone@example\.com/);
});
