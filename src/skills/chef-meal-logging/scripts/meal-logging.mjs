#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { deleteMeal, editMeal, logMeal } from './lib/log.mjs';

const { values, positionals } = parseArgs({
  options: {
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
  },
  allowPositionals: true,
});

if (!['log', 'edit', 'delete'].includes(positionals[0])) {
  console.error('Usage: meal-logging.mjs <log|edit|delete> [options]');
  process.exit(64);
}

const root = resolveDataRoot({ flag: values['data-root'] });
let result;
if (positionals[0] === 'log') {
  result = logMeal(root, {
    date: values.date,
    slot: values.slot,
    recipe: values.recipe,
    food: values.food,
    servings: Number(values.servings),
    cooked: values.cooked ?? false,
    loggedAt: values['logged-at'] ?? new Date().toISOString(),
  });
} else if (positionals[0] === 'edit') {
  result = editMeal(root, {
    id: values.id,
    date: values.date,
    slot: values.slot,
    recipe: values.recipe,
    food: values.food,
    servings: values.servings === undefined ? undefined : Number(values.servings),
    cooked: values.cooked ? true : values['not-cooked'] ? false : undefined,
  });
} else {
  result = deleteMeal(root, { id: values.id });
}
console.log(JSON.stringify({ data_root: root, ...result }));
if (['invalid-input', 'not-found', 'refused'].includes(result.status)) process.exitCode = 2;
