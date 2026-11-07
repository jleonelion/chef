#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { logMeal } from './lib/log.mjs';

const { values, positionals } = parseArgs({
  options: {
    'data-root': { type: 'string' },
    date: { type: 'string' },
    slot: { type: 'string' },
    recipe: { type: 'string' },
    food: { type: 'string' },
    servings: { type: 'string' },
    cooked: { type: 'boolean' },
    'logged-at': { type: 'string' },
  },
  allowPositionals: true,
});

if (positionals[0] !== 'log') {
  console.error('Usage: meal-logging.mjs log --date YYYY-MM-DD --slot <breakfast|lunch|dinner|snack> (--recipe <slug>|--food <text>) --servings <number> [--cooked]');
  process.exit(64);
}

const root = resolveDataRoot({ flag: values['data-root'] });
const result = logMeal(root, {
  date: values.date,
  slot: values.slot,
  recipe: values.recipe,
  food: values.food,
  servings: Number(values.servings),
  cooked: values.cooked ?? false,
  loggedAt: values['logged-at'] ?? new Date().toISOString(),
});
console.log(JSON.stringify({ data_root: root, ...result }));
if (['invalid-input', 'refused'].includes(result.status)) process.exitCode = 2;
