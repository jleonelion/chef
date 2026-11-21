#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { invalidMode, isDirectExecution } from '../../../lib/cli-entry.mjs';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture } from '../../../lib/diagnostics/capture.mjs';
import { deleteMeal, editMeal, logMeal } from './lib/log.mjs';

const OPTIONS = {
    'data-root': { type: 'string' },
    id: { type: 'string' },
    date: { type: 'string' },
    slot: { type: 'string' },
    recipe: { type: 'string' },
    food: { type: 'string' },
    servings: { type: 'string' },
    cooked: { type: 'boolean' },
    'not-cooked': { type: 'boolean' },
    'logged-at': { type: 'string' },
};
const { values, positionals } = parseArgs({
  args: isDirectExecution(import.meta.url) ? process.argv.slice(2) : [],
  options: OPTIONS,
  allowPositionals: true,
});

const root = resolveDataRoot({ flag: values['data-root'] });
const operation = positionals[0];
const MODES = {
  log: () => logMeal(root, {
    date: values.date,
    slot: values.slot,
    recipe: values.recipe,
    food: values.food,
    servings: Number(values.servings),
    cooked: values.cooked ?? false,
    loggedAt: values['logged-at'] ?? new Date().toISOString(),
  }),
  edit: () => editMeal(root, {
    id: values.id,
    date: values.date,
    slot: values.slot,
    recipe: values.recipe,
    food: values.food,
    servings: values.servings === undefined ? undefined : Number(values.servings),
    cooked: values.cooked ? true : values['not-cooked'] ? false : undefined,
  }),
  delete: () => deleteMeal(root, { id: values.id }),
};
export const SCRIPT_CONTRACT = Object.freeze({
  modes: Object.keys(MODES),
  flags: Object.keys(OPTIONS),
  statuses: {
    ok: ['logged', 'unchanged', 'edited', 'deleted'],
    errors: ['invalid-input', 'not-found', 'refused'],
    nested: ['deducted', 'duplicate', 'inventory_correction.required'],
  },
});
const failures = { 'not-found': 'record-not-found' };
if (isDirectExecution(import.meta.url)) {
  const result = Object.hasOwn(MODES, operation)
    ? await chefCapture({ root, skill: 'chef-meal-logging', script: 'meal-logging', operation, failures }, MODES[operation])
    : invalidMode(operation, SCRIPT_CONTRACT.modes, root);
  console.log(JSON.stringify({ data_root: root, ...result }));
  if (SCRIPT_CONTRACT.statuses.errors.includes(result.status)) process.exitCode = 2;
}
