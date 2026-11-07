import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { git } from '../../../../lib/git.mjs';
import { initDataRoot } from './init-data-root.mjs';
import { scheduleProposal } from './schedule.mjs';

function dataRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-schedule-')), 'root');
  initDataRoot(root);
  return root;
}

function write(root, rel, value) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), `${JSON.stringify(value)}\n`);
}

const names = (list) => list.map((task) => task.name);
const snapshot = (root) => ({ head: git(root, ['rev-parse', 'HEAD']), status: git(root, ['status', '--short', '--ignored']) });

test('with default settings and no goal, only the briefing and update notice are offered', () => {
  const root = dataRoot();
  const result = scheduleProposal(root);
  assert.equal(result.status, 'proposal');
  assert.deepEqual(names(result.tasks), ['Chef morning briefing', 'Chef update notice']);
  assert.deepEqual(names(result.not_offered), ['Chef weekly health report', 'Chef shopping list', 'Chef receipt check']);
  for (const task of result.tasks) {
    for (const key of ['name', 'cadence', 'prompt', 'why']) assert.ok(task[key], `${task.name} has ${key}`);
  }
  assert.ok(result.not_offered.every((task) => task.reason));
  assert.match(result.runtime.instruction, /yes/);
});

test('settings and an active goal unlock the health report, shopping list and receipt check', () => {
  const root = dataRoot();
  write(root, 'settings.json', { settings_version: 1, household_recipients: ['cook@example.com'], trusted_receipt_senders: ['receipts@example.com'] });
  write(root, 'data/health-goals/goals.json', { goal: 'More protein', targets: { protein: { min: 90 } } });
  const result = scheduleProposal(root);
  assert.deepEqual(names(result.tasks), [
    'Chef morning briefing', 'Chef weekly health report', 'Chef shopping list', 'Chef update notice', 'Chef receipt check',
  ]);
  assert.deepEqual(result.not_offered, []);
});

test('a dropped goal (goal: null) keeps the health report dormant', () => {
  const root = dataRoot();
  write(root, 'data/health-goals/goals.json', { goal: null });
  assert.ok(names(scheduleProposal(root).not_offered).includes('Chef weekly health report'));
});

test('the proposal writes nothing to the data root', () => {
  const root = dataRoot();
  write(root, 'settings.json', { settings_version: 1, household_recipients: ['cook@example.com'] });
  const before = snapshot(root);
  scheduleProposal(root);
  assert.deepEqual(snapshot(root), before);
});

test('a folder that is not a data root is refused', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-schedule-empty-'));
  assert.equal(scheduleProposal(root).status, 'refused');
});
