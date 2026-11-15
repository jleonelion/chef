// Post-error report offers end to end: a Chef script fails with internal-error, Chef offers once,
// and accepting drafts a defect focused on the failing run.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { feedbackReportProblems } from '../../../lib/diagnostics/test-schemas.mjs';
import { readTrace } from '../../../lib/diagnostics/trace.mjs';
import { bytesFromPreview } from '../../../lib/feedback/preview.mjs';

const skills = path.join(import.meta.dirname, '..', '..');
const setup = path.join(skills, 'chef-setup', 'scripts', 'setup.mjs');
const inventory = path.join(skills, 'chef-food-inventory', 'scripts', 'inventory.mjs');
const logging = path.join(skills, 'chef-meal-logging', 'scripts', 'meal-logging.mjs');
const fixture = path.join(skills, '..', '..', 'fixtures', 'data-root');

function fixtureRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-offer-')), 'data-root');
  fs.cpSync(fixture, root, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  fs.writeFileSync(path.join(root, 'data', 'food-inventory', 'current.json'), '{broken');
  return root;
}
function run(root, script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args, '--data-root', root], { encoding: 'utf8' });
  return { status: result.status, out: JSON.parse(result.stdout) };
}
const crash = (root) => run(root, inventory, 'view');
const numberOf = (preview, id) => Number(preview.match(new RegExp(`^\\[\\s*(\\d+)\\] ${id.replace(/[[\]]/g, '\\$&')} = `, 'm'))[1]);

test('an internal error offers a report once; other failures never do', () => {
  const root = fixtureRoot();
  const first = crash(root);
  assert.equal(first.status, 1);
  assert.equal(first.out.status, 'internal-error');
  const [event] = readTrace(root).events;
  assert.deepEqual(first.out.report_offer, { error_code: 'unclassified', focus: event.invocation_id, message: first.out.report_offer.message });
  assert.match(first.out.report_offer.message, /report-draft --focus/);
  assert.equal(crash(root).out.report_offer, undefined, 'at most once per error code per hour');
  assert.ok(fs.existsSync(path.join(root, 'diagnostics', 'offers.json')));
  assert.equal(run(root, logging, 'delete', '--id', 'no-such-entry').out.report_offer, undefined);
});

test('accepting drafts a post-error defect focused on the failing run', () => {
  const root = fixtureRoot();
  const { focus } = crash(root).out.report_offer;
  const { out } = run(root, setup, 'report-draft', '--focus', focus);
  assert.equal(out.status, 'draft');
  const report = JSON.parse(bytesFromPreview(out.preview));
  assert.deepEqual(feedbackReportProblems(report), []);
  assert.deepEqual([report.class, report.trigger, report.skill_ids], ['defect', 'post-error', ['chef-food-inventory']]);
  const focused = report.diagnostic_bundle.events.find((e) => e.invocation_id === report.focus_invocation);
  assert.deepEqual([focused.operation, focused.outcome], ['view', 'internal-error']);
  assert.match(report.expected, /view/);
  assert.match(report.actual, /internal error/);
  assert.equal(run(root, setup, 'report-draft', '--focus', '00000000-0000-4000-8000-000000000000').out.status, 'invalid-input');
});

test('removing the focus run warns first, then makes the report user-initiated', () => {
  const root = fixtureRoot();
  const { out } = run(root, setup, 'report-draft', '--focus', crash(root).out.report_offer.focus);
  const item = String(numberOf(out.preview, 'focus_invocation'));
  const warned = run(root, setup, 'report-remove', '--item', item).out;
  assert.equal(warned.status, 'confirmation-required');
  assert.match(warned.warning, /user-initiated/);
  assert.equal(JSON.parse(run(root, setup, 'report-preview', '--raw').out.raw).trigger, 'post-error', 'nothing changed yet');
  const removed = run(root, setup, 'report-remove', '--item', item, '--confirm').out;
  const report = JSON.parse(bytesFromPreview(removed.preview));
  assert.deepEqual(feedbackReportProblems(report), []);
  assert.equal(report.trigger, 'user-initiated');
  assert.equal(report.focus_invocation, undefined);
  assert.ok(report.removed_fields.includes('focus_invocation'));
});

test('"no thanks" suppresses that error code; turning offers off and on again resets it', () => {
  const root = fixtureRoot();
  assert.equal(run(root, setup, 'report-offer-decline', '--code', 'unclassified').out.status, 'declined');
  assert.equal(crash(root).out.report_offer, undefined);

  assert.equal(run(root, setup, 'set', '--post-error-offers', 'off').out.status, 'saved');
  assert.equal(run(root, setup, 'set', '--post-error-offers', 'on').out.status, 'saved');
  assert.ok(crash(root).out.report_offer, 'turning offers on again clears "no thanks"');
  assert.equal(run(root, setup, 'set', '--post-error-offers', 'off').out.status, 'saved');
  fs.rmSync(path.join(root, 'diagnostics', 'offers.json'));
  assert.equal(crash(root).out.report_offer, undefined, 'off means no offers');
  assert.ok(readTrace(root).events.length >= 2, 'the trace is unaffected');
});

test('removing an item that does not exist is invalid input, not an internal error', () => {
  const root = fixtureRoot();
  run(root, setup, 'report-draft', '--focus', crash(root).out.report_offer.focus);
  const { status, out } = run(root, setup, 'report-remove', '--item', '999');
  assert.equal(status, 2);
  assert.equal(out.status, 'invalid-input');
  assert.equal(out.report_offer, undefined);
});
