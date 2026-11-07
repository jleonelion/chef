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
import { activeGoal } from '../../../chef-health-goals/scripts/lib/goals.mjs';
import { healthSuggestions } from '../../../chef-health-goals/scripts/lib/suggest.mjs';

const PROFILE_PATH = wikiPath('household-profile', 'profile');

function household(root) {
  const file = path.join(root, PROFILE_PATH);
  if (!fs.existsSync(file)) return { path: null, servings: 1, servings_source: 'default' };
  const page = parsePage(fs.readFileSync(file, 'utf8'));
  const portions = page.frontmatter.portions_per_meal;
  const fromProfile = Number.isInteger(portions) && portions > 0;
  return { path: PROFILE_PATH, servings: fromProfile ? portions : 1, servings_source: fromProfile ? 'profile' : 'default' };
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

// chef-health-goals' advisory step, on the saved plan only. No declared goal is a no-op.
export function applyHealthSuggestions(plan, goal) {
  return goal ? { ...plan, health_suggestions: healthSuggestions(plan, goal) } : plan;
}

function selectRecipes(allowed, bySlug, slots, days) {
  const used = new Set(slots.filter(Boolean));
  return Array.from({ length: days }, (_, index) => {
    const chosen = slots[index];
    if (chosen) return bySlug.get(chosen);
    let candidate = allowed.find(({ recipe }) => !used.has(recipe.slug));
    if (!candidate) {
      used.clear();
      candidate = allowed[0];
    }
    used.add(candidate.recipe.slug);
    return candidate.recipe;
  });
}

export function planWeek(root, { weekStart, days = 7, slots = [], overrides = [] }) {
  const ruleset = readRuleset(root);
  const { recipes, unreadable } = listRecipes(root);
  const candidates = recipes.filter((recipe) => recipe.frontmatter.type === 'recipe');
  const judged = candidates.map((recipe) => ({ recipe, verdict: gateRecipe(recipe, ruleset, { overrides }) }));
  const active = judged.filter(({ recipe }) => recipe.frontmatter.lifecycle !== 'retired');
  const excluded = active.filter(({ verdict }) => verdict.excluded)
    .map(({ recipe, verdict }) => ({ slug: recipe.slug, title: recipe.frontmatter.title ?? recipe.slug, reasons: verdict.reasons }));
  const bySlug = new Map(judged.map((entry) => [entry.recipe.slug, entry]));
  const refusedChoices = slots.flatMap((slug, index) => {
    if (!slug) return [];
    const entry = bySlug.get(slug);
    if (!entry) return [{ slot: index + 1, slug, reasons: [{ why: 'not-found' }] }];
    const reasons = [
      ...(entry.recipe.frontmatter.lifecycle === 'retired' ? [{ why: 'retired' }] : []),
      ...entry.verdict.reasons,
    ];
    return reasons.length ? [{ slot: index + 1, slug, reasons }] : [];
  });
  if (refusedChoices.length) {
    return {
      status: 'refused',
      data_root: root,
      week_start: weekStart,
      reason: 'chosen recipes cannot be planned',
      refused_choices: refusedChoices,
      dietary: dietaryNotes(ruleset),
    };
  }
  const inventoryItems = listItems(loadInventory(root));
  const allowed = active.filter(({ verdict }) => !verdict.excluded)
    .sort((a, b) => Number(Boolean(a.verdict.avoidances.length)) - Number(Boolean(b.verdict.avoidances.length))
      || inventoryScore(b.recipe, inventoryItems) - inventoryScore(a.recipe, inventoryItems)
      || a.recipe.slug.localeCompare(b.recipe.slug));
  if (!allowed.length) {
    return { status: 'no-plan', data_root: root, week_start: weekStart, meals: [], excluded, unreadable, dietary: dietaryNotes(ruleset) };
  }

  const profile = household(root);
  const activeBySlug = new Map(active.map(({ recipe }) => [recipe.slug, recipe]));
  const selected = selectRecipes(allowed, activeBySlug, slots, days);
  const meals = selected.map((recipe, index) => mealView(recipe, dateAt(weekStart, index), profile.servings));
  const overridden = [...new Set(selected.map((recipe) => recipe.slug))].flatMap((slug) => {
    const reasons = bySlug.get(slug).verdict.overridden;
    return reasons.length ? [{ slug, reasons }] : [];
  });
  const avoidanceNotes = meals.flatMap((meal) => {
    const avoidances = bySlug.get(meal.slug).verdict.avoidances;
    return avoidances.length ? [{ date: meal.date, slug: meal.slug, avoidances }] : [];
  });
  const nutrition = rollupNutrition(meals.map((meal, index) => nutritionInput(meal, selected[index])));
  const dietary = dietaryNotes(ruleset);
  const inventory = { items_considered: inventoryItems.length };
  const frontmatter = {
    type: 'meal-plan',
    title: `Meal plan: week of ${weekStart}`,
    week_start: weekStart,
    created: today(),
    household_profile: profile.path,
    servings_source: profile.servings_source,
    meals,
    nutrition,
    dietary,
    inventory,
    ...(avoidanceNotes.length && { avoidance_notes: avoidanceNotes }),
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
    servings_source: profile.servings_source,
    inventory,
    nutrition,
    dietary,
    ...(overridden.length && { overridden }),
    ...(avoidanceNotes.length && { avoidance_notes: avoidanceNotes }),
    ...(settings.warning && { settings_warning: settings.warning }),
    ...calendarPayload(settings.settings.calendar, meals),
  }, activeGoal(root));
}
