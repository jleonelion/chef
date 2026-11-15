#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { parseOverrides } from '../../../lib/dietary-gate.mjs';
import { readRuleset } from '../../../lib/dietary-ruleset.mjs';
import { today as localToday } from '../../../lib/recipes.mjs';
import { planWeek } from './lib/plan.mjs';
import { todayPlan } from './lib/today.mjs';

const many = { type: 'string', multiple: true };
const { values, positionals } = parseArgs({
  options: {
    'data-root': { type: 'string' },
    'week-start': { type: 'string' },
    date: { type: 'string' },
    override: many,
  },
  allowPositionals: true,
});

const root = resolveDataRoot({ flag: values['data-root'] });
const mode = positionals[0];

function readPlannedMeals() {
  try {
    return { meals: JSON.parse(fs.readFileSync(0, 'utf8')) };
  } catch {
    return { problem: 'stdin: must be a JSON list of planned meals' };
  }
}

let result;
if (mode === 'today') {
  const date = values.date ?? localToday();
  result = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    ? todayPlan(root, date)
    : { status: 'invalid-input', data_root: root, problems: ['--date must be YYYY-MM-DD'] };
} else if (mode !== 'plan') result = { status: 'invalid-input', data_root: root, problems: ['supported commands: plan, today'] };
else if (!/^\d{4}-\d{2}-\d{2}$/.test(values['week-start'] ?? '') || Number.isNaN(Date.parse(`${values['week-start']}T00:00:00Z`))) {
  result = { status: 'invalid-input', data_root: root, problems: ['--week-start must be YYYY-MM-DD'] };
} else {
  const { overrides, problems } = parseOverrides(values.override, readRuleset(root));
  const { meals, problem } = readPlannedMeals();
  if (problem) problems.push(problem);
  if (problems.length) result = { status: 'invalid-input', data_root: root, problems };
  else result = planWeek(root, { weekStart: values['week-start'], meals, overrides });
}

console.log(JSON.stringify(result));
if (['invalid-input', 'refused'].includes(result.status)) process.exitCode = 2;
