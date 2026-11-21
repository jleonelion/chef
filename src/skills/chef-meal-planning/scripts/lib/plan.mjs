import fs from 'node:fs';
import path from 'node:path';
import { gateRecipe } from '../../../../lib/dietary-gate.mjs';
import { dietaryNotes, readRuleset } from '../../../../lib/dietary-ruleset.mjs';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { rollupNutrition } from '../../../../lib/nutrition.mjs';
import { byDateAndSlot } from '../../../../lib/meal-slots.mjs';
import { mealKey, mealKind, withAmountToCook } from '../../../../lib/planned-meal.mjs';
import { listRecipes, today } from '../../../../lib/recipes.mjs';
import { readSettings } from '../../../../lib/settings.mjs';
import { wikiPath, writeWiki } from '../../../../lib/wiki.mjs';
import { listItems, loadInventory } from '../../../chef-food-inventory/scripts/lib/store.mjs';
import { activeGoal } from '../../../chef-health-goals/scripts/lib/goals.mjs';
import { healthSuggestions } from '../../../chef-health-goals/scripts/lib/suggest.mjs';
import { plannedMealProblems } from './planned-meals.mjs';

const PROFILE_PATH = wikiPath('household-profile', 'profile');

function household(root) {
  const file = path.join(root, PROFILE_PATH);
  if (!fs.existsSync(file)) return { path: null, servings: 1, servings_source: 'default' };
  const page = parsePage(fs.readFileSync(file, 'utf8'));
  const portions = page.frontmatter.portions_per_meal;
  const fromProfile = Number.isInteger(portions) && portions > 0;
  const members = Array.isArray(page.frontmatter.members)
    ? [...new Set(page.frontmatter.members.flatMap((member) => (member && typeof member.name === 'string' && member.name.trim() ? [member.name.trim()] : [])))]
    : [];
  return {
    path: PROFILE_PATH,
    servings: fromProfile ? portions : 1,
    servings_source: fromProfile ? 'profile' : 'default',
    ...(members.length && { members }),
  };
}

// The saved planned meal. Leftovers copy the cooking meal's slug and title so readers need not
// resolve another date; free-text food has no recipe.
function mealView(planned, recipe, profile) {
  const kind = mealKind(planned);
  const eaters = planned.eaters ?? (profile.members ?? []);
  const servings = planned.servings ?? (profile.members ? eaters.length : profile.servings);
  return {
    date: planned.date,
    slot: planned.slot,
    ...(kind === 'leftovers' && { leftovers_of: { date: planned.leftovers_of.date, slot: planned.leftovers_of.slot } }),
    ...(kind === 'food' ? { food: planned.food.trim() } : { slug: recipe.slug, title: recipe.frontmatter.title ?? recipe.slug }),
    servings,
    ...(planned.eaters && { eaters: planned.eaters }),
    ...(planned.note && { note: planned.note }),
  };
}

// The recipe each planned meal eats: its own, its cooking meal's for leftovers, none for food.
function recipeSlugs(ordered) {
  const byKey = new Map(ordered.map((entry) => [mealKey(entry), entry]));
  return ordered.map((entry) => {
    const kind = mealKind(entry);
    if (kind === 'food') return null;
    return kind === 'leftovers' ? byKey.get(mealKey(entry.leftovers_of)).recipe : entry.recipe;
  });
}

function nutritionInput(meal, recipe) {
  return { ...meal, nutrition_status: recipe.frontmatter.nutrition_status, nutrition_per_serving: recipe.frontmatter.nutrition_per_serving };
}

// Counts what is eaten: recipe and leftovers meals at their servings. Free-text food is not
// estimated; it is listed as unmeasured and does not make the rollup incomplete.
function planNutrition(meals, selected) {
  const eaten = meals.flatMap((meal, index) => (selected[index] ? [nutritionInput(meal, selected[index])] : []));
  const unmeasured = meals.filter((meal) => mealKind(meal) === 'food').map(({ date, slot, food }) => ({ date, slot, food }));
  return { ...rollupNutrition(eaten), ...(unmeasured.length && { unmeasured }) };
}

function planNutritionByMember(meals, selected, members) {
  const rollups = Object.create(null);
  let unattributed = 0;
  for (const meal of meals) {
    const eaters = meal.eaters ?? members;
    unattributed += Math.max(0, meal.servings - eaters.length);
  }
  for (const member of members) {
    const eaten = meals.flatMap((meal, index) => {
      if (!selected[index]) return [];
      const eaters = meal.eaters ?? members;
      return eaters.includes(member) ? [{ ...nutritionInput(meal, selected[index]), servings: 1 }] : [];
    });
    const rollup = rollupNutrition(eaten);
    const dates = [...new Set(eaten.map((meal) => meal.date))].sort();
    const dailyTotals = dates.map((date) => {
      const day = rollupNutrition(eaten.filter((meal) => meal.date === date));
      return day.status === 'complete'
        ? { date, totals: day.totals }
        : { date, status: 'incomplete', missing: day.missing };
    });
    const unmeasured = meals.filter((meal) => mealKind(meal) === 'food'
      && (meal.eaters ?? members).includes(member))
      .map(({ date, slot, food }) => ({ date, slot, food }));
    rollups[member] = {
      ...rollup,
      daily_totals: dailyTotals,
      ...(unmeasured.length && { unmeasured }),
    };
  }
  return { ...rollups, ...(unattributed > 0 && { unattributed_servings: unattributed }) };
}

function calendarPayload(calendar, meals) {
  if (!calendar) return {};
  return {
    calendar: {
      action: 'create-events',
      calendar,
      events: meals.map((meal) => (mealKind(meal) === 'food'
        ? { date: meal.date, slot: meal.slot, title: meal.food }
        : { date: meal.date, slot: meal.slot, title: mealTitle(meal), recipe_slug: meal.slug })),
      instruction: 'Use the runtime calendar connector to create these events; this script does not call a calendar API.',
    },
  };
}

const mealTitle = (meal) => (mealKind(meal) === 'leftovers' ? `Leftovers: ${meal.title}` : meal.title);

function recipeCell(meal) {
  const kind = mealKind(meal);
  if (kind === 'food') return meal.food;
  return kind === 'leftovers' ? `${mealTitle(meal)} (from ${meal.leftovers_of.date} ${meal.leftovers_of.slot})` : meal.title;
}

const servingsCell = (meal) => (meal.cook_servings > meal.servings ? `${meal.servings} (cook ${meal.cook_servings})` : `${meal.servings}`);

function planBody(weekStart, meals) {
  const rows = meals.map((meal) => `| ${meal.date} | ${meal.slot} | ${recipeCell(meal)} | ${servingsCell(meal)} | ${meal.note ?? ''} |`).join('\n');
  return `# Meal plan: week of ${weekStart}\n\n| Date | Meal | Recipe | Servings | Note |\n|---|---|---|---:|---|\n${rows}\n`;
}

// chef-health-goals' advisory step, on the saved plan only. No declared goal is a no-op.
export function applyHealthSuggestions(plan, goal) {
  return goal ? { ...plan, health_suggestions: healthSuggestions(plan, goal) } : plan;
}

export function planWeek(root, { weekStart, meals: planned, overrides = [] }) {
  const problems = plannedMealProblems(planned, weekStart);
  if (problems.length) return { status: 'invalid-input', data_root: root, week_start: weekStart, problems };
  const profile = household(root);
  if (profile.members) {
    const known = new Set(profile.members);
    const reserved = [...new Set(profile.members.filter((name) => ['unattributed_servings', '__proto__', 'constructor', 'prototype'].includes(name)))];
    if (reserved.length) {
      return {
        status: 'invalid-input',
        data_root: root,
        week_start: weekStart,
        problems: reserved.map((name) => `household profile: member name "${name}" is reserved`),
      };
    }
    const unknown = [...new Set(planned.flatMap((meal) => meal.eaters ?? []))].filter((name) => !known.has(name));
    if (unknown.length) {
      return {
        status: 'invalid-input',
        data_root: root,
        week_start: weekStart,
        problems: unknown.map((name) => `meals: unknown household member "${name}"`),
      };
    }
    const belowEaters = planned.flatMap((meal, index) => {
      if (meal.servings === undefined) return [];
      const eaterCount = meal.eaters?.length ?? profile.members.length;
      return meal.servings < eaterCount ? [`meals[${index}].servings: must be at least the ${eaterCount} named eaters`] : [];
    });
    if (belowEaters.length) {
      return {
        status: 'invalid-input',
        data_root: root,
        week_start: weekStart,
        problems: belowEaters,
      };
    }
  } else if (planned.some((meal) => meal.eaters !== undefined)) {
    return {
      status: 'invalid-input',
      data_root: root,
      week_start: weekStart,
      problems: ['meals: eaters requires a household profile roster'],
    };
  }
  const ruleset = readRuleset(root);
  if (profile.members) {
    const known = new Set(profile.members);
    const unknown = ruleset.members.filter((member) => !known.has(member.name)).map((member) => member.name);
    if (unknown.length) {
      return {
        status: 'invalid-input',
        data_root: root,
        week_start: weekStart,
        problems: [...new Set(unknown)].map((name) => `dietary-ruleset: unknown household member "${name}"`),
      };
    }
  }
  const { recipes, unreadable } = listRecipes(root);
  const candidates = recipes.filter((recipe) => recipe.frontmatter.type === 'recipe');
  const judged = candidates.map((recipe) => ({ recipe, verdict: gateRecipe(recipe, ruleset, { overrides }) }));
  const active = judged.filter(({ recipe }) => recipe.frontmatter.lifecycle !== 'retired');
  const excluded = active.filter(({ verdict }) => verdict.excluded)
    .map(({ recipe, verdict }) => ({ slug: recipe.slug, title: recipe.frontmatter.title ?? recipe.slug, reasons: verdict.reasons }));
  const bySlug = new Map(judged.map((entry) => [entry.recipe.slug, entry]));
  const ordered = [...planned].sort(byDateAndSlot);
  const refusedChoices = ordered.filter((entry) => mealKind(entry) === 'recipe').flatMap(({ date, slot, recipe: slug }) => {
    const entry = bySlug.get(slug);
    if (!entry) return [{ date, slot, slug, reasons: [{ why: 'not-found' }] }];
    const reasons = [
      ...(entry.recipe.frontmatter.lifecycle === 'retired' ? [{ why: 'retired' }] : []),
      ...entry.verdict.reasons,
    ];
    return reasons.length ? [{ date, slot, slug, reasons }] : [];
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
  const selected = recipeSlugs(ordered).map((slug) => slug && bySlug.get(slug).recipe);
  const meals = ordered.map((entry, index) => mealView(entry, selected[index], profile));
  const cooked = withAmountToCook(meals);
  const recipeMeals = meals.filter((meal) => mealKind(meal) === 'recipe');
  const overridden = [...new Set(recipeMeals.map((meal) => meal.slug))].flatMap((slug) => {
    const reasons = bySlug.get(slug).verdict.overridden;
    return reasons.length ? [{ slug, reasons }] : [];
  });
  const avoidanceNotes = recipeMeals.flatMap((meal) => {
    const avoidances = bySlug.get(meal.slug).verdict.avoidances;
    return avoidances.length ? [{ date: meal.date, slot: meal.slot, slug: meal.slug, avoidances }] : [];
  });
  const nutrition = planNutrition(meals, selected);
  const nutritionByMember = profile.members ? planNutritionByMember(meals, selected, profile.members) : undefined;
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
    ...(nutritionByMember && { nutrition_by_member: nutritionByMember }),
    dietary,
    inventory,
    ...(avoidanceNotes.length && { avoidance_notes: avoidanceNotes }),
  };
  const write = writeWiki(root, {
    pages: [{ slug: weekStart, frontmatter, body: planBody(weekStart, cooked) }],
    message: `Plan meals for week of ${weekStart}`,
  });
  if (write.status !== 'written') return write;
  const settings = readSettings(root);
  return applyHealthSuggestions({
    status: 'saved',
    data_root: root,
    path: write.pages[0],
    week_start: weekStart,
    meals: cooked,
    excluded,
    unreadable,
    household: profile,
    servings_source: profile.servings_source,
    inventory,
    nutrition,
    ...(nutritionByMember && { nutrition_by_member: nutritionByMember }),
    dietary,
    ...(overridden.length && { overridden }),
    ...(avoidanceNotes.length && { avoidance_notes: avoidanceNotes }),
    ...(settings.warning && { settings_warning: settings.warning }),
    ...calendarPayload(settings.settings.calendar, meals),
  }, activeGoal(root));
}
