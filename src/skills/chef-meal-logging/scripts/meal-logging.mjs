#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture, classifyStatus } from '../../../lib/diagnostics/capture.mjs';
import { MEAL_SLOTS } from '../../../lib/meal-slots.mjs';
import { mealKind } from '../../../lib/planned-meal.mjs';
import { todayPlan } from '../../chef-meal-planning/scripts/lib/today.mjs';
import { deleteMeal, editMeal, logMeal } from './lib/log.mjs';

const fromPlan = process.argv.includes('--from-plan');
const args = process.argv.slice(2);
if (fromPlan) {
  const cookedIndex = args.indexOf('--cooked');
  if (cookedIndex !== -1 && args[cookedIndex + 1] && !args[cookedIndex + 1].startsWith('--')) {
    args.splice(cookedIndex, 2, `--cooked-slots=${args[cookedIndex + 1]}`);
  }
}
const { values, positionals } = parseArgs({
  args,
  options: {
    'data-root': { type: 'string' },
    id: { type: 'string' },
    date: { type: 'string' },
    slot: { type: 'string' },
    recipe: { type: 'string' },
    food: { type: 'string' },
    servings: { type: 'string' },
    cooked: { type: 'boolean' },
    'cooked-slots': { type: 'string' },
    'cooked-servings': { type: 'string', multiple: true },
    'from-plan': { type: 'boolean' },
    preview: { type: 'boolean' },
    'plan-hash': { type: 'string' },
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
const operation = positionals[0];
function logFromPlan() {
  const cookedSlots = (values['cooked-slots'] ?? '').split(',').filter(Boolean);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date ?? '') || Number.isNaN(Date.parse(`${values.date}T00:00:00Z`))) {
    return { status: 'invalid-input', problems: ['date: must be YYYY-MM-DD'] };
  }
  if ((values.slot && !MEAL_SLOTS.includes(values.slot)) || cookedSlots.some((slot) => !MEAL_SLOTS.includes(slot))) {
    return { status: 'invalid-input', problems: ['slot: must be breakfast, lunch, dinner or snack'] };
  }
  if (values.recipe !== undefined || values.food !== undefined || values.servings !== undefined || values['not-cooked'] || values.id) {
    return { status: 'invalid-input', problems: ['--from-plan cannot be combined with manual entry fields'] };
  }
  const plan = todayPlan(root, values.date);
  const meals = plan.meals?.filter((meal) => !values.slot || meal.slot === values.slot) ?? [];
  if (!meals.length) return { status: 'not-found', reason: `no planned meal for ${values.date}${values.slot ? ` ${values.slot}` : ''}` };
  const planHash = createHash('sha256').update(JSON.stringify(meals)).digest('hex');
  if (values.preview) return { status: 'planned', meals, plan_hash: planHash };
  if (values['plan-hash'] !== planHash) {
    return { status: 'invalid-input', problems: ['plan changed or confirmation is missing; preview and confirm again'] };
  }
  if (cookedSlots.some((slot) => !meals.some((meal) => meal.slot === slot))) {
    return { status: 'invalid-input', problems: ['cooked slots must match selected planned meals'] };
  }
  if (values.cooked || meals.some((meal) => mealKind(meal) === 'leftovers' && cookedSlots.includes(meal.slot))) {
    return { status: 'invalid-input', problems: ['--cooked requires selected non-leftovers slots'] };
  }
  const amounts = new Map();
  for (const pair of values['cooked-servings'] ?? []) {
    const [slot, amount, extra] = pair.split('=');
    const servings = Number(amount);
    const meal = meals.find((item) => item.slot === slot);
    if (extra !== undefined || !amount || !Number.isFinite(servings) || servings <= 0 ||
        !meal || mealKind(meal) !== 'recipe' || !cookedSlots.includes(slot) || amounts.has(slot)) {
      return { status: 'invalid-input', problems: ['--cooked-servings must name a cooked recipe slot and positive amount'] };
    }
    amounts.set(slot, servings);
  }
  if (meals.some((meal) => mealKind(meal) === 'recipe' && cookedSlots.includes(meal.slot) &&
      meal.cook_servings > meal.servings && !amounts.has(meal.slot))) {
    return { status: 'invalid-input', problems: ['confirm the amount cooked with --cooked-servings SLOT=AMOUNT'] };
  }
  const results = meals.map((meal) => logMeal(root, {
    date: meal.date,
    slot: meal.slot,
    recipe: meal.food === undefined ? meal.slug : undefined,
    food: meal.food,
    servings: meal.servings,
    inventoryServings: amounts.get(meal.slot),
    cooked: cookedSlots.includes(meal.slot),
    loggedAt: values['logged-at'] ?? new Date().toISOString(),
  }));
  const failure = results.find((result) => ['invalid-input', 'not-found', 'refused'].includes(result.status));
  return { status: failure?.status ?? 'logged', results };
}
const MODES = {
  log: () => values['from-plan'] ? logFromPlan() : logMeal(root, {
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
const failures = { 'not-found': 'record-not-found' };
const classify = classifyStatus({ skill: 'chef-meal-logging', script: 'meal-logging', failures });
const planOptions = values.preview || values['plan-hash'] !== undefined ||
  values['cooked-slots'] !== undefined || values['cooked-servings'] !== undefined;
const invalidOptions = (values['from-plan'] && operation !== 'log') || (planOptions && !values['from-plan']);
const result = await chefCapture({
  root, skill: 'chef-meal-logging', script: 'meal-logging', operation,
  classify: (result) => result.status === 'planned' ? { outcome: 'ok', facts: {} } : classify(result),
}, () => invalidOptions
  ? { status: 'invalid-input', problems: ['plan options require log --from-plan'] }
  : MODES[operation]());
console.log(JSON.stringify({ data_root: root, ...result }));
if (['invalid-input', 'not-found', 'refused'].includes(result.status)) process.exitCode = 2;
