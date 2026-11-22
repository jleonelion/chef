import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOT_MEDICAL_ADVICE, TRAINING_NOTICE } from '../../../../lib/safety-text.mjs';
import { clearGoal, GOALS_PATH, parseTargets, readGoal, setGoal } from './goals.mjs';
import { commits, dataRoot, exists, readJson, writeFile } from './test-root.mjs';

const sodium = { goal: 'Lower sodium', targets: { sodium: { max: 2300 } } };

test('no goals file means dormant', () => {
  assert.deepEqual(readGoal(dataRoot()), { status: 'dormant' });
});

test('goals list preserves member goals alongside legacy goals', () => {
  const root = dataRoot();
  writeFile(root, 'knowledge/wiki/household/profile.md', '---\ntype: household-profile\nmembers:\n  - name: Alex Example\n  - name: Sam Example\nupdated: 2026-01-10\n---\n');
  writeFile(root, GOALS_PATH, JSON.stringify({
    goal: 'Household lower sodium',
    targets: { sodium: { max: 2300 } },
    goals: [
      { member: 'Alex Example', goal: 'Higher protein', targets: { protein: { min: 90 } } },
      { member: 'Sam Example', goal: 'Lower sodium', targets: { sodium: { max: 2000 } } },
    ],
    set: '2026-01-10',
  }));
  assert.deepEqual(readGoal(root), {
    status: 'active',
    goal: 'Household lower sodium',
    targets: { sodium: { max: 2300 } },
    goals: [
      { member: 'Alex Example', goal: 'Higher protein', targets: { protein: { min: 90 } } },
      { member: 'Sam Example', goal: 'Lower sodium', targets: { sodium: { max: 2000 } } },
    ],
    set: '2026-01-10',
  });
});

test('a legacy goal edit preserves existing member goals', () => {
  const root = dataRoot();
  writeFile(root, 'knowledge/wiki/household/profile.md', '---\ntype: household-profile\nmembers:\n  - name: Alex Example\nupdated: 2026-01-10\n---\n');
  writeFile(root, GOALS_PATH, JSON.stringify({
    goals: [{ member: 'Alex Example', goal: 'Higher protein', targets: { protein: { min: 90 } } }],
  }));
  assert.equal(setGoal(root, sodium, { date: '2026-01-15' }).status, 'saved');
  assert.deepEqual(readJson(root, GOALS_PATH).goals, [
    { member: 'Alex Example', goal: 'Higher protein', targets: { protein: { min: 90 } } },
  ]);
});

test('unknown member is invalid and writes no goal', () => {
  const root = dataRoot();
  const result = setGoal(root, {
    member: 'Unknown Example',
    goal: 'Higher protein',
    targets: { protein: { min: 90 } },
  }, { date: '2026-01-15' });
  assert.equal(result.status, 'invalid-input');
  assert.equal(exists(root, GOALS_PATH), false);
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

test('setGoal preserves targets not included in a partial edit', () => {
  const root = dataRoot();
  setGoal(root, sodium, { date: '2026-01-15' });
  const result = setGoal(root, {
    goal: 'Lower sodium',
    targets: {},
    addMin: ['protein=90'],
  }, { date: '2026-01-20', mergeTargets: true });
  assert.equal(result.status, 'saved');
  assert.deepEqual(readGoal(root).targets, {
    sodium: { max: 2300 },
    protein: { min: 90 },
  });
});

test('setGoal partially edits one member goal without requiring or replacing the goal text', () => {
  const root = dataRoot();
  writeFile(root, 'knowledge/wiki/household/profile.md', '---\ntype: household-profile\nmembers:\n  - name: Alex Example\nupdated: 2026-01-10\n---\n');
  assert.equal(setGoal(root, {
    member: 'Alex Example',
    goal: 'Higher protein',
    targets: { protein: { min: 90 } },
  }, { date: '2026-01-15' }).status, 'saved');

  const result = setGoal(root, {
    member: 'Alex Example',
    targets: {},
    addMax: ['calories=2200'],
  }, { date: '2026-01-20', mergeTargets: true });

  assert.equal(result.status, 'saved');
  assert.deepEqual(readJson(root, GOALS_PATH).goals, [{
    member: 'Alex Example',
    goal: 'Higher protein',
    targets: { protein: { min: 90 }, calories: { max: 2200 } },
  }]);
});

test('setGoal saves a changed goal description when the targets are unchanged', () => {
  const root = dataRoot();
  writeFile(root, 'knowledge/wiki/household/profile.md', '---\ntype: household-profile\nmembers:\n  - name: Alex Example\nupdated: 2026-01-10\n---\n');
  setGoal(root, {
    member: 'Alex Example',
    goal: 'Higher protein',
    targets: { protein: { min: 90 } },
  }, { date: '2026-01-15' });

  const result = setGoal(root, {
    member: 'Alex Example',
    goal: 'Build strength',
    targets: {},
    setMin: ['protein=90'],
  }, { date: '2026-01-20', mergeTargets: true });

  assert.equal(result.status, 'saved');
  assert.equal(readJson(root, GOALS_PATH).goals[0].goal, 'Build strength');
});

test('setGoal removes only one target bound or target', () => {
  const root = dataRoot();
  setGoal(root, { goal: 'Lower sodium', targets: { sodium: { max: 2300 }, protein: { min: 90 } } }, { date: '2026-01-15' });
  const removeBound = setGoal(root, {
    goal: 'Lower sodium',
    targets: {},
    removeMax: ['sodium'],
  }, { date: '2026-01-20', mergeTargets: true });
  assert.equal(removeBound.status, 'saved');
  assert.deepEqual(readGoal(root).targets, { protein: { min: 90 } });
  const removeTarget = setGoal(root, {
    goal: 'Lower sodium',
    targets: {},
    removeTarget: ['protein'],
  }, { date: '2026-01-21', mergeTargets: true });
  assert.equal(removeTarget.status, 'saved');
  assert.deepEqual(readGoal(root).targets, {});
});

test('add target leaves an existing bound unchanged and set target changes it', () => {
  const root = dataRoot();
  setGoal(root, sodium, { date: '2026-01-15' });
  assert.equal(setGoal(root, {
    goal: 'Lower sodium',
    targets: {},
    addMax: ['sodium=2000'],
  }, { date: '2026-01-20', mergeTargets: true }).status, 'unchanged');
  assert.deepEqual(readGoal(root).targets, sodium.targets);
  assert.equal(setGoal(root, {
    goal: 'Lower sodium',
    targets: {},
    setMax: ['sodium=2000'],
  }, { date: '2026-01-21', mergeTargets: true }).status, 'saved');
  assert.deepEqual(readGoal(root).targets, { sodium: { max: 2000 } });
});
