import { mealEntryId, MEAL_LOG_PATH, readMealLog } from '../../../../lib/meal-log.mjs';
import { listRecipes } from '../../../../lib/recipes.mjs';
import { slugify, writeWiki } from '../../../../lib/wiki.mjs';
import { deductionApplied, deductRecipe } from '../../../chef-food-inventory/scripts/lib/deduct.mjs';

export const MEAL_LOG_FILE = MEAL_LOG_PATH;
const SLOTS = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

function entryFor(root, input, id = null) {
  const recipe = listRecipes(root).recipes.find((candidate) => candidate.slug === input.recipe);
  const perServing = recipe?.frontmatter.nutrition_status === 'complete'
    ? recipe.frontmatter.nutrition_per_serving
    : null;
  return {
    id: id ?? mealEntryId(input),
    date: input.date,
    slot: input.slot,
    recipe: input.recipe ?? null,
    food: input.recipe ? null : input.food,
    servings: input.servings,
    cooked: input.cooked,
    nutrition: perServing
      ? Object.fromEntries(Object.entries(perServing).map(([field, value]) => [field, value * input.servings]))
      : null,
    logged_at: input.loggedAt,
  };
}

function validate(root, input) {
  const problems = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '') || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`))) problems.push('date: must be YYYY-MM-DD');
  if (!SLOTS.has(input.slot)) problems.push('slot: must be breakfast, lunch, dinner or snack');
  if (Boolean(input.recipe) === Boolean(input.food?.trim())) problems.push('provide exactly one of recipe or food');
  if (!Number.isFinite(input.servings) || input.servings <= 0) problems.push('servings: must be a positive number');
  if (typeof input.cooked !== 'boolean') problems.push('cooked: must be a boolean');
  if (Number.isNaN(Date.parse(input.loggedAt))) problems.push('logged_at: must be an ISO timestamp');
  if (input.recipe && !listRecipes(root).recipes.some((candidate) => candidate.slug === input.recipe)) problems.push(`recipe not found: ${input.recipe}`);
  if (!input.recipe && !slugify(input.food ?? '')) problems.push('food: must contain letters or numbers');
  return problems;
}

function correctionFor(root, id) {
  return deductionApplied(root, id) ? {
    required: true,
    skill: 'chef-food-inventory',
    message: 'Inventory was not changed. Correct it separately with chef-food-inventory.',
  } : undefined;
}

export function logMeal(root, input) {
  const problems = validate(root, input);
  if (problems.length) return { status: 'invalid-input', problems };
  const entry = entryFor(root, input);
  const store = readMealLog(root);
  if (store.problem) return { status: 'refused', reason: store.problem };
  const existing = store.entries.find((candidate) => candidate.id === entry.id);
  let status = 'unchanged';
  if (!existing) {
    const written = writeWiki(root, {
      data: [{ path: MEAL_LOG_FILE, content: `${JSON.stringify({ entries: [...store.entries, entry] }, null, 2)}\n` }],
      message: `chef-meal-logging: log ${entry.id}`,
    });
    if (written.status !== 'written') return written;
    status = 'logged';
  }
  const inventory = entry.cooked && entry.recipe
    ? deductRecipe(root, { recipe: entry.recipe, servings: entry.servings, deductionId: entry.id, now: entry.logged_at })
    : { status: 'not-requested' };
  return { status, entry: existing ?? entry, inventory };
}

export function editMeal(root, input) {
  if (!input.id?.trim()) return { status: 'invalid-input', problems: ['id: required'] };
  const store = readMealLog(root);
  if (store.problem) return { status: 'refused', reason: store.problem };
  const existing = store.entries.find((entry) => entry.id === input.id);
  if (!existing) return { status: 'not-found', reason: `meal log entry not found: ${input.id}` };
  const nextInput = {
    ...existing,
    ...(input.date === undefined ? {} : { date: input.date }),
    ...(input.slot === undefined ? {} : { slot: input.slot }),
    ...(input.servings === undefined ? {} : { servings: input.servings }),
    ...(input.cooked === undefined ? {} : { cooked: input.cooked }),
    ...(input.recipe === undefined ? {} : { recipe: input.recipe, food: undefined }),
    ...(input.food === undefined ? {} : { recipe: undefined, food: input.food }),
    loggedAt: existing.logged_at,
  };
  const problems = validate(root, nextInput);
  if (problems.length) return { status: 'invalid-input', problems };
  const entry = entryFor(root, nextInput, existing.id);
  const entries = store.entries.map((candidate) => candidate === existing ? entry : candidate);
  const written = writeWiki(root, {
    data: [{ path: MEAL_LOG_FILE, content: `${JSON.stringify({ entries }, null, 2)}\n` }],
    message: `chef-meal-logging: edit ${entry.id}`,
  });
  if (written.status !== 'written') return written;
  const result = { status: 'edited', entry };
  result.inventory_correction = correctionFor(root, entry.id);
  if (!result.inventory_correction) delete result.inventory_correction;
  return result;
}

export function deleteMeal(root, input) {
  if (!input.id?.trim()) return { status: 'invalid-input', problems: ['id: required'] };
  const store = readMealLog(root);
  if (store.problem) return { status: 'refused', reason: store.problem };
  const entry = store.entries.find((candidate) => candidate.id === input.id);
  if (!entry) return { status: 'not-found', reason: `meal log entry not found: ${input.id}` };
  const entries = store.entries.filter((candidate) => candidate !== entry);
  const written = writeWiki(root, {
    data: [{ path: MEAL_LOG_FILE, content: `${JSON.stringify({ entries }, null, 2)}\n` }],
    message: `chef-meal-logging: delete ${entry.id}`,
  });
  if (written.status !== 'written') return written;
  const result = { status: 'deleted', entry, inventory_correction: correctionFor(root, entry.id) };
  if (!result.inventory_correction) delete result.inventory_correction;
  return result;
}
