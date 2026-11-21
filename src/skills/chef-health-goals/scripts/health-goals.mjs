#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { invalidMode, isDirectExecution } from '../../../lib/cli-entry.mjs';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture } from '../../../lib/diagnostics/capture.mjs';
import { today } from '../../../lib/recipes.mjs';
import { NOT_MEDICAL_ADVICE } from '../../../lib/safety-text.mjs';
import { clearGoal, parseTargets, readGoal, setGoal } from './lib/goals.mjs';
import { weeklyReport } from './lib/report.mjs';

const many = { type: 'string', multiple: true };
const OPTIONS = {
  'data-root': { type: 'string' },
  goal: { type: 'string' },
  min: many,
  max: many,
  'add-min': many,
  'remove-min': many,
  'add-max': many,
  'remove-max': many,
  'set-min': many,
  'set-max': many,
  'remove-target': many,
  rewrite: { type: 'boolean' },
  'week-start': { type: 'string' },
};
const { values, positionals } = parseArgs({
  args: isDirectExecution(import.meta.url) ? process.argv.slice(2) : [],
  options: OPTIONS,
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
  const replace = (values.min?.length || values.max?.length) ?? false;
  const edits = [
    ...(values['add-min'] ?? []),
    ...(values['remove-min'] ?? []),
    ...(values['add-max'] ?? []),
    ...(values['remove-max'] ?? []),
    ...(values['set-min'] ?? []),
    ...(values['set-max'] ?? []),
    ...(values['remove-target'] ?? []),
  ];
  if (replace && edits.length) return invalid([`replace and add/remove/set flags cannot be combined for health targets`]);
  const { targets, problems } = parseTargets(values);
  if (problems.length) return invalid(problems);
  return setGoal(root, {
    goal: values.goal,
    targets,
    addMin: values['add-min'],
    removeMin: values['remove-min'],
    addMax: values['add-max'],
    removeMax: values['remove-max'],
    setMin: values['set-min'],
    setMax: values['set-max'],
    removeTarget: values['remove-target'],
  }, { date: today(), rewrite: values.rewrite, mergeTargets: edits.length > 0 });
}

const commands = {
  status,
  set,
  clear: () => clearGoal(root, { date: today() }),
  report: () => (isDate(values['week-start']) ? weeklyReport(root, { weekStart: values['week-start'] }) : invalid(['--week-start must be YYYY-MM-DD'])),
};
export const SCRIPT_CONTRACT = Object.freeze({
  modes: Object.keys(commands),
  flags: Object.keys(OPTIONS),
  statuses: { ok: ['active', 'dormant', 'saved', 'cleared', 'report'], errors: ['invalid-input', 'refused', 'unreadable'] },
});

const operation = positionals[0];
const run = () => commands[operation]();
const failures = { unreadable: 'store-unreadable' };
if (isDirectExecution(import.meta.url)) {
  const result = Object.hasOwn(commands, operation)
    ? await chefCapture({ root, skill: 'chef-health-goals', script: 'health-goals', operation, failures }, run)
    : invalidMode(operation, SCRIPT_CONTRACT.modes, root);
  console.log(JSON.stringify(result));
  if (SCRIPT_CONTRACT.statuses.errors.includes(result.status)) process.exitCode = 2;
}
