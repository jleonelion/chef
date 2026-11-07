import fs from 'node:fs';
import path from 'node:path';
import { gateRecipe } from '../../../../lib/dietary-gate.mjs';
import { dietaryNotes, readRuleset } from '../../../../lib/dietary-ruleset.mjs';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { rollupNutrition } from '../../../../lib/nutrition.mjs';
import { ingredientLines, listRecipes, today } from '../../../../lib/recipes.mjs';
import { readSettings } from '../../../../lib/settings.mjs';
import { wikiPath, writeWiki } from '../../../../lib/wiki.mjs';
import { listItems, loadInventory } from '../../../chef-food-inventory/scripts/lib/store.mjs';

const PROFILE_PATH = wikiPath('household-profile', 'profile');

function household(root) {
  const file = path.join(root, PROFILE_PATH);
  if (!fs.existsSync(file)) return { path: null, servings: 1 };
  const page = parsePage(fs.readFileSync(file, 'utf8'));
  const portions = [...page.body.matchAll(/\b(\d+)\s+portions?\s+per\s+meal\b/gi)].map((match) => Number(match[1]));
  return { path: PROFILE_PATH, servings: portions.reduce((sum, value) => sum + value, 0) || 1 };
}

function dateAt(weekStart, offset) {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function inventoryScore(recipe, items) {
  const lines = ingredientLines(recipe.body).map((line) => line.toLowerCase());
  return items.filter((item) => lines.some((line) => line.includes(item.name.toLowerCase()))).length;
}

function mealView(recipe, date, servings) {
  return { date, slug: recipe.slug, title: recipe.frontmatter.title ?? recipe.slug, servings };
}

function nutritionInput(meal, recipe) {
  return { ...meal, nutrition_status: recipe.frontmatter.nutrition_status, nutrition_per_serving: recipe.frontmatter.nutrition_per_serving };
}

function calendarPayload(calendar, meals) {
  if (!calendar) return {};
  return {
    calendar: {
      action: 'create-events',
      calendar,
      events: meals.map((meal) => ({ date: meal.date, title: meal.title, recipe_slug: meal.slug })),
      instruction: 'Use the runtime calendar connector to create these events; this script does not call a calendar API.',
    },
  };
}

function planBody(weekStart, meals) {
  const rows = meals.map((meal) => `| ${meal.date} | ${meal.title} | ${meal.servings} |`).join('\n');
  return `# Meal plan: week of ${weekStart}\n\n| Date | Recipe | Servings |\n|---|---|---:|\n${rows}\n`;
}

// Health-aware suggestions are added by chef-health-goals later. No declared goal is a no-op.
export function applyHealthSuggestions(plan, goal) {
  return goal ? { ...plan, suggestions: { status: 'deferred' } } : plan;
}

export function planWeek(root, { weekStart }) {
  const ruleset = readRuleset(root);
  const { recipes, unreadable } = listRecipes(root);
  const active = recipes.filter((recipe) => recipe.frontmatter.type === 'recipe' && recipe.frontmatter.lifecycle !== 'retired');
  const judged = active.map((recipe) => ({ recipe, verdict: gateRecipe(recipe, ruleset) }));
  const excluded = judged.filter(({ verdict }) => verdict.excluded)
    .map(({ recipe, verdict }) => ({ slug: recipe.slug, title: recipe.frontmatter.title ?? recipe.slug, reasons: verdict.reasons }));
  const inventoryItems = listItems(loadInventory(root));
  const allowed = judged.filter(({ verdict }) => !verdict.excluded)
    .sort((a, b) => inventoryScore(b.recipe, inventoryItems) - inventoryScore(a.recipe, inventoryItems) || a.recipe.slug.localeCompare(b.recipe.slug));
  if (!allowed.length) {
    return { status: 'no-plan', data_root: root, week_start: weekStart, meals: [], excluded, unreadable, dietary: dietaryNotes(ruleset) };
  }

  const profile = household(root);
  const selected = Array.from({ length: 7 }, (_, index) => allowed[index % allowed.length].recipe);
  const meals = selected.map((recipe, index) => mealView(recipe, dateAt(weekStart, index), profile.servings));
  const nutrition = rollupNutrition(meals.map((meal, index) => nutritionInput(meal, selected[index])));
  const dietary = dietaryNotes(ruleset);
  const inventory = { items_considered: inventoryItems.length };
  const frontmatter = {
    type: 'meal-plan',
    title: `Meal plan: week of ${weekStart}`,
    week_start: weekStart,
    created: today(),
    household_profile: profile.path,
    meals,
    nutrition,
    dietary,
    inventory,
  };
  const write = writeWiki(root, {
    pages: [{ slug: weekStart, frontmatter, body: planBody(weekStart, meals) }],
    message: `Plan meals for week of ${weekStart}`,
  });
  if (write.status !== 'written') return write;
  const settings = readSettings(root);
  return applyHealthSuggestions({
    status: 'saved',
    data_root: root,
    path: write.pages[0],
    week_start: weekStart,
    meals,
    excluded,
    unreadable,
    household: profile,
    inventory,
    nutrition,
    dietary,
    ...(settings.warning && { settings_warning: settings.warning }),
    ...calendarPayload(settings.settings.calendar, meals),
  });
}
