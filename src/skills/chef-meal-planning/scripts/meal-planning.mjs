#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture } from '../../../lib/diagnostics/capture.mjs';
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

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const invalid = (...problems) => ({ status: 'invalid-input', data_root: root, problems });

function today() {
  const date = values.date ?? localToday();
  return isDate(date) ? todayPlan(root, date) : invalid('--date must be YYYY-MM-DD');
}

function plan() {
  if (!isDate(values['week-start'])) return invalid('--week-start must be YYYY-MM-DD');
  const { overrides, problems } = parseOverrides(values.override, readRuleset(root));
  const { meals, problem } = readPlannedMeals();
  if (problem) problems.push(problem);
  return problems.length ? invalid(...problems) : planWeek(root, { weekStart: values['week-start'], meals, overrides });
}

const MODES = { plan, today };
const run = () => (Object.hasOwn(MODES, mode) ? MODES[mode]() : invalid('supported commands: plan, today'));
const result = await chefCapture({ root, skill: 'chef-meal-planning', script: 'meal-planning', operation: mode }, run);

console.log(JSON.stringify(result));
if (['invalid-input', 'refused'].includes(result.status)) process.exitCode = 2;
