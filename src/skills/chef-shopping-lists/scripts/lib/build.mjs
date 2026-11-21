// Builds a shopping list from a saved meal plan minus inventory. Reads only; delivery is
// deliver.mjs. The dietary gate re-runs because the ruleset may have changed since planning.
import fs from 'node:fs';
import path from 'node:path';
import { gateRecipe } from '../../../../lib/dietary-gate.mjs';
import { dietaryNotes, readRuleset } from '../../../../lib/dietary-ruleset.mjs';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { byDateAndSlot, withSlot } from '../../../../lib/meal-slots.mjs';
import { mealKind, withAmountToCook } from '../../../../lib/planned-meal.mjs';
import { ingredientLines, listRecipes, today as localToday } from '../../../../lib/recipes.mjs';
import { WIKI_DIR, WIKI_FOLDERS } from '../../../../lib/wiki.mjs';
import { listItems, loadInventory } from '../../../chef-food-inventory/scripts/lib/store.mjs';
import { combineLines, displayItems, subtractInventory } from './combine.mjs';

const PLANS_DIR = `${WIKI_DIR}/${WIKI_FOLDERS['meal-plan']}`;
const WEEK = /^\d{4}-\d{2}-\d{2}$/;

function savedWeeks(root) {
  const dir = path.join(root, PLANS_DIR);
  return fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => f.replace(/\.md$/, '')).filter((w) => WEEK.test(w)).sort() : [];
}

const latestWeek = (root) => savedWeeks(root).at(-1) ?? null;

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function upcomingWeek(root, today) {
  const through = addDays(today, 7);
  return savedWeeks(root).find((week) => week >= today && week <= through) ?? null;
}

function readPlan(root, weekStart) {
  const rel = `${PLANS_DIR}/${weekStart}.md`;
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return null;
  const meals = parsePage(fs.readFileSync(file, 'utf8')).frontmatter.meals ?? [];
  // Only recipe meals are shopped for, at their amount to cook; leftovers and free-text food buy nothing.
  const cooking = withAmountToCook(meals.map(withSlot)).filter((meal) => mealKind(meal) === 'recipe');
  return { path: rel, meals: cooking.sort(byDateAndSlot) };
}

const multiplier = (meal, recipe) => {
  const base = Number(recipe.frontmatter.servings);
  return Number.isFinite(base) && base > 0 && Number(meal.cook_servings) > 0 ? meal.cook_servings / base : 1;
};

function listText(weekStart, { items, unquantified }, dietary) {
  const rows = items.map((row) => `- ${row.text} ${row.item}${row.on_hand ? ` (on hand: ${row.on_hand.text})` : ''}`);
  const check = [...new Set(unquantified.map((u) => u.item))].map((item) => `- ${item}`);
  const notes = [dietary.problem, dietary.nudge, ...(dietary.caveats ?? []), dietary.footer].filter(Boolean);
  return [
    `# Shopping list: week of ${weekStart}`,
    rows.length ? rows.join('\n') : 'Nothing to buy: inventory covers the plan.',
    ...(check.length ? [`Check you have:\n${check.join('\n')}`] : []),
    ...notes,
  ].join('\n\n') + '\n';
}

// units: the household's 'us' | 'metric'; shapes displayed quantities only.
export function buildList(root, { weekStart, upcoming = false, today = localToday(), overrides = [], units }) {
  const week = weekStart ?? (upcoming ? upcomingWeek(root, today) : latestWeek(root));
  const plan = week && readPlan(root, week);
  if (!plan && upcoming) {
    return {
      status: 'no-plan',
      data_root: root,
      looked_for: addDays(today, 1),
      reason: 'no saved meal plan starts in the next 7 days; plan meals with chef-meal-planning first',
    };
  }
  if (!plan) return { status: 'no-plan', data_root: root, week_start: week, reason: 'no saved meal plan; plan meals with chef-meal-planning first' };

  const ruleset = readRuleset(root);
  const dietary = dietaryNotes(ruleset);
  const bySlug = new Map(listRecipes(root).recipes.map((recipe) => [recipe.slug, recipe]));
  const slugs = [...new Set(plan.meals.map((meal) => meal.slug))];
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  const verdicts = new Map(slugs.filter((slug) => bySlug.has(slug)).map((slug) => [slug, gateRecipe(bySlug.get(slug), ruleset, { overrides })]));
  const excluded = [...verdicts].filter(([, v]) => v.excluded).map(([slug, v]) => ({ slug, title: bySlug.get(slug).frontmatter.title ?? slug, reasons: v.reasons }));

  const uses = plan.meals.filter((meal) => verdicts.get(meal.slug)?.excluded === false).flatMap((meal) => {
    const recipe = bySlug.get(meal.slug);
    return ingredientLines(recipe.body).map((line) => ({ line, multiplier: multiplier(meal, recipe), recipe: meal.slug }));
  });
  const combined = combineLines(uses);
  const { items, covered } = subtractInventory(combined.items, listItems(loadInventory(root)));
  const list = { items: displayItems(items, units), unquantified: combined.unquantified };
  return {
    status: 'built',
    data_root: root,
    week_start: week,
    plan: plan.path,
    meals: plan.meals.map(({ date, slot, slug, servings, cook_servings }) => ({ date, slot, slug, servings, cook_servings })),
    ...list,
    covered: displayItems(covered, units),
    excluded,
    missing_recipes: missing,
    dietary,
    text: listText(week, list, dietary),
  };
}
