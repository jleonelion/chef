#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { today } from '../../../lib/recipes.mjs';
import { NOT_MEDICAL_ADVICE } from '../../../lib/safety-text.mjs';
import { clearGoal, parseTargets, readGoal, setGoal } from './lib/goals.mjs';
import { weeklyReport } from './lib/report.mjs';

const many = { type: 'string', multiple: true };
const { values, positionals } = parseArgs({
  options: {
    'data-root': { type: 'string' },
    goal: { type: 'string' },
    min: many,
    max: many,
    rewrite: { type: 'boolean' },
    'week-start': { type: 'string' },
  },
  allowPositionals: true,
});

const root = resolveDataRoot({ flag: values['data-root'] });
const invalid = (problems) => ({ status: 'invalid-input', data_root: root, problems });
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function status() {
  const goal = readGoal(root);
  return goal.status === 'active' ? { ...goal, data_root: root, footer: NOT_MEDICAL_ADVICE } : { ...goal, data_root: root };
}

function set() {
  const { targets, problems } = parseTargets(values);
  if (problems.length) return invalid(problems);
  return setGoal(root, { goal: values.goal, targets }, { date: today(), rewrite: values.rewrite });
}

const commands = {
  status,
  set,
  clear: () => clearGoal(root, { date: today() }),
  report: () => (isDate(values['week-start']) ? weeklyReport(root, { weekStart: values['week-start'] }) : invalid(['--week-start must be YYYY-MM-DD'])),
};

const command = commands[positionals[0]];
const result = command ? command() : invalid([`supported commands: ${Object.keys(commands).join(', ')}`]);
console.log(JSON.stringify(result));
if (['invalid-input', 'refused', 'unreadable'].includes(result.status)) process.exitCode = 2;
