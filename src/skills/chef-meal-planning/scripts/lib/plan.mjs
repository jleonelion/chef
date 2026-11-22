import { gateRecipe } from '../../../../lib/dietary-gate.mjs';
import { dietaryNotes, readRuleset } from '../../../../lib/dietary-ruleset.mjs';
import { readHouseholdProfile } from '../../../../lib/household-profile.mjs';
import { rollupNutrition } from '../../../../lib/nutrition.mjs';
import { byDateAndSlot } from '../../../../lib/meal-slots.mjs';
import { mealKey, mealKind, withAmountToCook } from '../../../../lib/planned-meal.mjs';
import { listRecipes, today } from '../../../../lib/recipes.mjs';
import { readSettings } from '../../../../lib/settings.mjs';
import { NOT_MEDICAL_ADVICE } from '../../../../lib/safety-text.mjs';
import { writeWiki } from '../../../../lib/wiki.mjs';
import { listItems, loadInventory } from '../../../chef-food-inventory/scripts/lib/store.mjs';
import { activeGoal, readGoal } from '../../../chef-health-goals/scripts/lib/goals.mjs';
import { healthSuggestions } from '../../../chef-health-goals/scripts/lib/suggest.mjs';
import { plannedMealProblems } from './planned-meals.mjs';

// The saved planned meal. Leftovers copy the cooking meal's slug and title so readers need not
// resolve another date; free-text food has no recipe.
function mealView(planned, recipe, household) {
  const kind = mealKind(planned);
  const eaters = household.members.length ? planned.eaters ?? household.members.map(({ name }) => name) : null;
  return {
    date: planned.date,
    slot: planned.slot,
    ...(kind === 'leftovers' && { leftovers_of: { date: planned.leftovers_of.date, slot: planned.leftovers_of.slot } }),
    ...(kind === 'food' ? { food: planned.food.trim() } : { slug: recipe.slug, title: recipe.frontmatter.title ?? recipe.slug }),
    servings: planned.servings ?? eaters?.length ?? household.servings,
    ...(eaters && { eaters }),
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
function nutritionRollup(mealRecipes, { servings = (meal) => meal.servings } = {}) {
  const eaten = mealRecipes.flatMap(({ meal, recipe }) => recipe
    ? [nutritionInput({ ...meal, servings: servings(meal) }, recipe)]
    : []);
  const unmeasured = mealRecipes
    .filter(({ meal, recipe }) => !recipe && mealKind(meal) === 'food')
    .map(({ meal: { date, slot, food } }) => ({ date, slot, food }));
  return { ...rollupNutrition(eaten), ...(unmeasured.length && { unmeasured }) };
}

function memberRollup(name, mealRecipes) {
  const memberMeals = mealRecipes.filter(({ meal }) => meal.eaters.includes(name));
  const measuredMeals = memberMeals.filter(({ recipe }) => recipe);
  const weekly = measuredMeals.length ? nutritionRollup(measuredMeals, { servings: () => 1 }) : { status: 'complete' };
  const unmeasured = memberMeals
    .filter(({ meal, recipe }) => !recipe && mealKind(meal) === 'food')
    .map(({ meal: { date, slot, food } }) => ({ date, slot, food }));
  const days = [...new Set(measuredMeals.map(({ meal }) => meal.date))].map((date) => {
    const rollup = nutritionRollup(measuredMeals.filter(({ meal }) => meal.date === date), { servings: () => 1 });
    return { date, status: rollup.status, ...(rollup.totals && { totals: rollup.totals }), ...(rollup.missing && { missing: rollup.missing }) };
  });
  return {
    name,
    status: weekly.status,
    days,
    ...(weekly.totals && { totals: weekly.totals }),
    ...(weekly.missing && { missing: weekly.missing }),
    ...(unmeasured.length && { unmeasured }),
  };
}

function targetStatus(value, { min, max }) {
  if (min !== undefined && value < min) return 'under';
  if (max !== undefined && value > max) return 'over';
  return 'met';
}

function targetStatuses(totals, targets) {
  if (!totals) return undefined;
  return Object.fromEntries(Object.entries(targets).map(([nutrient, bounds]) => [
    nutrient,
    targetStatus(totals[nutrient] ?? 0, bounds),
  ]));
}

function memberGoal(goal, name, members) {
  if (Array.isArray(goal.goals)) {
    const memberGoalEntry = goal.goals.find((entry) => entry.member === name);
    if (memberGoalEntry) return memberGoalEntry;
  }
  if (goal.goal && members.length === 1 && members[0].name === name) return { member: name, goal: goal.goal, targets: goal.targets ?? {} };
  return null;
}

function memberComparison(member, goal) {
  if (!goal) return {};
  const comparison = {
    goal: goal.goal,
    footer: NOT_MEDICAL_ADVICE,
  };
  if (member.status === 'incomplete') {
    return { comparison: { ...comparison, status: 'incomplete', ...(member.missing && { missing: member.missing }) } };
  }
  if (!member.totals) return { comparison: { ...comparison, status: 'no-meals', days: [], weekly: {} } };
  const weekly = targetStatuses(member.totals, goal.targets);
  const days = member.days.filter((day) => day.status === 'complete').map((day) => {
    const targets = targetStatuses(day.totals, goal.targets);
    return { date: day.date, totals: day.totals, targets };
  });
  return {
    comparison: {
      ...comparison,
      status: 'measured',
      days,
      weekly,
      weekly_totals: member.totals,
      targets: weekly,
    },
  };
}

function planNutritionByMember(mealRecipes, members, goal) {
  if (!members.length) return null;
  return {
    members: members.map(({ name }) => {
      const member = memberRollup(name, mealRecipes);
      const goalForMember = goal ? memberGoal(goal, name, members) : null;
      return { ...member, ...memberComparison(member, goalForMember) };
    }),
    unattributed_servings: mealRecipes.reduce((sum, { meal }) => sum + Math.max(0, meal.servings - meal.eaters.length), 0),
  };
}

function rosterProblems(planned, profile, ruleset) {
  if (!profile.members.length) return planned.flatMap((meal, index) => meal.eaters
    ? [`meals[${index}].eaters: household roster is not configured`]
    : []);
  const names = new Set(profile.members.map(({ name }) => name));
  const eaterProblems = planned.flatMap((meal, index) => (meal.eaters ?? [])
    .filter((name) => !names.has(name))
    .map((name) => `meals[${index}].eaters: unknown household member ${JSON.stringify(name)}`));
  const dietaryProblems = ruleset.members
    .filter(({ name }) => !names.has(name))
    .map(({ name }) => `dietary ruleset: unknown household member ${JSON.stringify(name)}`);
  return [...eaterProblems, ...dietaryProblems];
}

function householdView(profile) {
  const view = { path: profile.path, servings: profile.servings, servings_source: profile.servings_source };
  return profile.members.length ? { ...view, members: profile.members } : view;
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
  if (!goal) return plan;
  if (!goal.goal) return plan;
  if (plan.nutrition_by_member?.members.length > 1) return plan;
  return { ...plan, health_suggestions: healthSuggestions(plan, goal) };
}

export function planWeek(root, { weekStart, meals: planned, overrides = [] }) {
  const problems = plannedMealProblems(planned, weekStart);
  if (problems.length) return { status: 'invalid-input', data_root: root, week_start: weekStart, problems };
  const ruleset = readRuleset(root);
  const profile = readHouseholdProfile(root);
  const memberProblems = rosterProblems(planned, profile, ruleset);
  if (memberProblems.length) return { status: 'invalid-input', data_root: root, week_start: weekStart, problems: memberProblems };
  const goalStore = readGoal(root);
  if (goalStore.status === 'invalid-input') {
    return { status: 'invalid-input', data_root: root, week_start: weekStart, problems: [goalStore.reason] };
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
  const mealRecipes = meals.map((meal, index) => ({ meal, recipe: selected[index] }));
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
  const nutrition = nutritionRollup(mealRecipes);
  const goal = activeGoal(root);
  const nutritionByMember = planNutritionByMember(mealRecipes, profile.members, goal);
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
    household: householdView(profile),
    servings_source: profile.servings_source,
    inventory,
    nutrition,
    ...(nutritionByMember && { nutrition_by_member: nutritionByMember }),
    dietary,
    ...(overridden.length && { overridden }),
    ...(avoidanceNotes.length && { avoidance_notes: avoidanceNotes }),
    ...(settings.warning && { settings_warning: settings.warning }),
    ...calendarPayload(settings.settings.calendar, meals),
  }, goal);
}
