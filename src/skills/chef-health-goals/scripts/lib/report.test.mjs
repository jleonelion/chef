import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOT_MEDICAL_ADVICE } from '../../../../lib/safety-text.mjs';
import { setGoal } from './goals.mjs';
import { weeklyReport } from './report.mjs';
import { commits, dataRoot, entry, writeFile, writeMealLog } from './test-root.mjs';

const n = (calories, protein, sodium) => ({ calories, protein, fat: 10, saturated_fat: 2, carbs: 50, fiber: 5, sugar: 5, sodium, cholesterol: 0 });

function activeRoot() {
  const root = dataRoot();
  setGoal(root, { goal: 'Lower sodium', targets: { sodium: { max: 2300 }, protein: { min: 90 } } }, { date: '2026-01-10' });
  return root;
}

test('no goal means no report and no health output, even with a meal log', () => {
  const root = dataRoot();
  writeMealLog(root, [entry('2026-01-19', 'dinner', n(600, 30, 800))]);
  assert.deepEqual(weeklyReport(root, { weekStart: '2026-01-19' }), { status: 'dormant', data_root: root });
});

test('the weekly report averages measured days against each target', () => {
  const root = activeRoot();
  writeMealLog(root, [
    entry('2026-01-19', 'lunch', n(500, 40, 900)),
    entry('2026-01-19', 'dinner', n(700, 60, 1000)),
    entry('2026-01-20', 'dinner', n(800, 50, 2600)),
    entry('2026-01-26', 'dinner', n(800, 50, 2600)),
  ]);
  const before = commits(root);
  const report = weeklyReport(root, { weekStart: '2026-01-19' });
  assert.equal(commits(root), before);
  assert.equal(report.status, 'report');
  assert.equal(report.week_end, '2026-01-25');
  assert.equal(report.goal, 'Lower sodium');
  assert.equal(report.footer, NOT_MEDICAL_ADVICE);
  assert.deepEqual(report.days.map((day) => [day.date, day.status, day.entries]), [
    ['2026-01-19', 'measured', 2], ['2026-01-20', 'measured', 1], ['2026-01-21', 'not-logged', 0], ['2026-01-22', 'not-logged', 0],
    ['2026-01-23', 'not-logged', 0], ['2026-01-24', 'not-logged', 0], ['2026-01-25', 'not-logged', 0],
  ]);
  assert.deepEqual(report.days[0].totals.sodium, 1900);
  assert.deepEqual(report.progress, [
    { nutrient: 'sodium', max: 2300, daily_average: 2250, days_on_target: 1, days_measured: 2 },
    { nutrient: 'protein', min: 90, daily_average: 75, days_on_target: 1, days_measured: 2 },
  ]);
});

test('a day with an entry lacking nutrition is incomplete and never estimated', () => {
  const root = activeRoot();
  writeMealLog(root, [entry('2026-01-19', 'lunch', n(500, 40, 900)), entry('2026-01-19', 'dinner', null)]);
  const report = weeklyReport(root, { weekStart: '2026-01-19' });
  assert.equal(report.days[0].status, 'incomplete');
  assert.equal(report.days[0].totals, undefined);
  assert.deepEqual(report.unmeasured, [{ date: '2026-01-19', id: '2026-01-19-dinner-food' }]);
  assert.deepEqual(report.progress[0], { nutrient: 'sodium', max: 2300, daily_average: null, days_on_target: 0, days_measured: 0 });
});

test('no meal log yet is an empty week, not an error', () => {
  const report = weeklyReport(activeRoot(), { weekStart: '2026-01-19' });
  assert.equal(report.status, 'report');
  assert.ok(report.days.every((day) => day.status === 'not-logged'));
});

test('an unreadable meal log is reported, not guessed around', () => {
  const root = activeRoot();
  writeFile(root, 'data/meal-log/log.json', '{oops');
  assert.equal(weeklyReport(root, { weekStart: '2026-01-19' }).status, 'unreadable');
});
