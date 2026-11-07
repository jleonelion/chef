import fs from 'node:fs';
import path from 'node:path';
import { listRecipes } from '../../../../lib/recipes.mjs';
import { slugify, writeWiki } from '../../../../lib/wiki.mjs';
import { deductRecipe } from '../../../chef-food-inventory/scripts/lib/deduct.mjs';

export const MEAL_LOG_FILE = 'data/meal-log/log.json';

function readLog(root) {
  const file = path.join(root, MEAL_LOG_FILE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { entries: [] };
}

function entryFor(root, input) {
  const recipe = listRecipes(root).recipes.find((candidate) => candidate.slug === input.recipe);
  const subject = input.recipe ?? slugify(input.food);
  return {
    id: `${input.date}-${input.slot}-${subject}`,
    date: input.date,
    slot: input.slot,
    recipe: input.recipe ?? null,
    food: input.recipe ? null : input.food,
    servings: input.servings,
    cooked: input.cooked,
    nutrition: recipe?.frontmatter.nutrition_status === 'complete' ? recipe.frontmatter.nutrition_per_serving : null,
    logged_at: input.loggedAt,
  };
}

export function logMeal(root, input) {
  const entry = entryFor(root, input);
  const store = readLog(root);
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
