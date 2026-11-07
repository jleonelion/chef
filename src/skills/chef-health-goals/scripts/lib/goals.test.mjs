import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOT_MEDICAL_ADVICE, TRAINING_NOTICE } from '../../../../lib/safety-text.mjs';
import { clearGoal, GOALS_PATH, parseTargets, readGoal, setGoal } from './goals.mjs';
import { commits, dataRoot, exists, readJson, writeFile } from './test-root.mjs';

const sodium = { goal: 'Lower sodium', targets: { sodium: { max: 2300 } } };

test('no goals file means dormant', () => {
  assert.deepEqual(readGoal(dataRoot()), { status: 'dormant' });
});

test('setting a goal writes the one store in one commit and shows the training notice once', () => {
  const root = dataRoot();
  const before = commits(root);
  const first = setGoal(root, sodium, { date: '2026-01-15' });
  assert.equal(first.status, 'saved');
  assert.equal(first.notice, TRAINING_NOTICE);
  assert.equal(first.footer, NOT_MEDICAL_ADVICE);
  assert.equal(commits(root), before + 1);
  assert.deepEqual(readJson(root, GOALS_PATH), { goal: 'Lower sodium', targets: { sodium: { max: 2300 } }, set: '2026-01-15', updated: '2026-01-15' });
  assert.deepEqual(readJson(root, 'data/notices.json'), { 'training-setting': '2026-01-15' });
  assert.deepEqual(readGoal(root), { status: 'active', goal: 'Lower sodium', targets: { sodium: { max: 2300 } }, set: '2026-01-15' });

  const second = setGoal(root, { goal: 'Lower sodium', targets: { protein: { min: 90 } } }, { date: '2026-01-20' });
  assert.equal(second.notice, undefined);
  assert.deepEqual(readJson(root, GOALS_PATH), { goal: 'Lower sodium', targets: { protein: { min: 90 } }, set: '2026-01-15', updated: '2026-01-20' });
});

test('a training notice the dietary flow already showed is not shown again', () => {
  const root = dataRoot();
  writeFile(root, 'data/notices.json', '{"training-setting":"2026-01-01"}\n');
  const result = setGoal(root, sodium, { date: '2026-01-15' });
  assert.equal(result.notice, undefined);
  assert.deepEqual(readJson(root, 'data/notices.json'), { 'training-setting': '2026-01-01' });
});

test('clearing the goal returns health features to dormant, with no health output', () => {
  const root = dataRoot();
  setGoal(root, sodium, { date: '2026-01-15' });
  const cleared = clearGoal(root, { date: '2026-01-16' });
  assert.equal(cleared.status, 'cleared');
  assert.equal(cleared.footer, undefined);
  assert.deepEqual(readGoal(root), { status: 'dormant' });
  assert.deepEqual(readJson(root, GOALS_PATH), { goal: null, targets: {}, updated: '2026-01-16' });
});

test('clearing with no goal writes nothing', () => {
  const root = dataRoot();
  const before = commits(root);
  assert.equal(clearGoal(root, { date: '2026-01-16' }).status, 'dormant');
  assert.equal(commits(root), before);
});

test('a blank goal is invalid and writes nothing', () => {
  const root = dataRoot();
  const result = setGoal(root, { goal: '  ', targets: {} }, { date: '2026-01-15' });
  assert.equal(result.status, 'invalid-input');
  assert.equal(exists(root, GOALS_PATH), false);
});

test('an unreadable store is reported, counts as no goal, and set refuses to replace it', () => {
  const root = dataRoot();
  writeFile(root, GOALS_PATH, '{not json');
  assert.equal(readGoal(root).status, 'unreadable');
  assert.equal(setGoal(root, sodium, { date: '2026-01-15' }).status, 'refused');
});

test('parseTargets reads min and max pairs and rejects unknown nutrients and bad numbers', () => {
  assert.deepEqual(parseTargets({ min: ['protein=90'], max: ['sodium=2300', 'protein=150'] }), { targets: { protein: { min: 90, max: 150 }, sodium: { max: 2300 } }, problems: [] });
  assert.deepEqual(parseTargets({ min: ['vitamin-q=1'], max: ['sodium=-5'] }).problems, [
    'unknown nutrient "vitamin-q"; use one of calories, protein, fat, saturated_fat, carbs, fiber, sugar, sodium, cholesterol',
    'sodium: max must be a positive number',
  ]);
  assert.deepEqual(parseTargets({ min: ['protein=200'], max: ['protein=100'] }).problems, ['protein: min is above max']);
});
