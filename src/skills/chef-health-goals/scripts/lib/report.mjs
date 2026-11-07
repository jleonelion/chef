// The one weekly progress report: seven days of the meal log against the goal's daily targets.
// Read-only. A day counts toward targets only when every entry that day has nutrition; Chef
// never estimates the rest. Dormant (no output at all) until a goal is declared.
import { NUTRIENTS } from '../../../../lib/fdc.mjs';
import { NOT_MEDICAL_ADVICE } from '../../../../lib/safety-text.mjs';
import { activeGoal } from './goals.mjs';
import { readMealLog } from '../../../../lib/meal-log.mjs';

const FIELDS = Object.keys(NUTRIENTS);
const oneDecimal = (value) => Math.round(value * 10) / 10;

export function dateAt(start, offset) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function dayView(date, entries) {
  if (!entries.length) return { date, status: 'not-logged', entries: 0 };
  if (entries.some((e) => !e.nutrition)) return { date, status: 'incomplete', entries: entries.length };
  const totals = Object.fromEntries(FIELDS.map((f) => [f, oneDecimal(entries.reduce((sum, e) => sum + (e.nutrition[f] ?? 0), 0))]));
  return { date, status: 'measured', entries: entries.length, totals };
}

const onTarget = (value, { min, max }) => (min === undefined || value >= min) && (max === undefined || value <= max);

function progress(targets, measured) {
  return Object.entries(targets).map(([nutrient, bounds]) => {
    const values = measured.map((day) => day.totals[nutrient]);
    return {
      nutrient,
      ...bounds,
      daily_average: values.length ? oneDecimal(values.reduce((a, b) => a + b, 0) / values.length) : null,
      days_on_target: values.filter((value) => onTarget(value, bounds)).length,
      days_measured: values.length,
    };
  });
}

export function weeklyReport(root, { weekStart }) {
  const goal = activeGoal(root);
  if (!goal) return { status: 'dormant', data_root: root };
  const log = readMealLog(root);
  if (log.problem) return { status: 'unreadable', data_root: root, reason: log.problem };
  const dates = Array.from({ length: 7 }, (_, i) => dateAt(weekStart, i));
  const inWeek = log.entries.filter((e) => dates.includes(e.date));
  const days = dates.map((date) => dayView(date, inWeek.filter((e) => e.date === date)));
  const unmeasured = inWeek.filter((e) => !e.nutrition).map((e) => ({ date: e.date, id: e.id }));
  return {
    status: 'report',
    data_root: root,
    week_start: weekStart,
    week_end: dates.at(-1),
    goal: goal.goal,
    days,
    progress: progress(goal.targets, days.filter((day) => day.status === 'measured')),
    ...(unmeasured.length && { unmeasured }),
    footer: NOT_MEDICAL_ADVICE,
  };
}
