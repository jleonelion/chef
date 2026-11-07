// The one health-aware suggestions step, called by chef-meal-planning after a plan is saved.
// Advisory only: it reads the saved, dietary-gated plan and never adds, swaps or removes meals.
// Compares one serving of each planned meal with the goal's daily targets.
import { NOT_MEDICAL_ADVICE } from '../../../../lib/safety-text.mjs';

const oneDecimal = (value) => Math.round(value * 10) / 10;

function targetView(nutrient, bounds, servings) {
  const values = servings.map((s) => s.values[nutrient]);
  const average = oneDecimal(values.reduce((a, b) => a + b, 0) / values.length);
  const over = bounds.max === undefined ? [] : servings.filter((s) => s.values[nutrient] > bounds.max)
    .map((s) => ({ date: s.date, slug: s.slug, per_serving: s.values[nutrient] }));
  return {
    nutrient,
    ...bounds,
    per_serving_average: average,
    share_of_target: Math.round((average / (bounds.max ?? bounds.min)) * 100),
    ...(over.length && { over_daily_max: over }),
  };
}

export function healthSuggestions(plan, goal) {
  if (plan.nutrition?.status !== 'complete') {
    return {
      status: 'unavailable',
      goal: goal.goal,
      reason: 'some planned recipes have no complete nutrition, so Chef cannot compare the plan with your targets',
      footer: NOT_MEDICAL_ADVICE,
    };
  }
  const servings = plan.nutrition.meals.map((m) => ({
    date: m.date,
    slug: m.slug,
    values: Object.fromEntries(Object.entries(m.totals).map(([field, total]) => [field, oneDecimal(total / m.servings)])),
  }));
  return {
    status: 'advisory',
    goal: goal.goal,
    basis: 'one serving of each planned meal against your daily targets; the rest of each day is not counted',
    targets: Object.entries(goal.targets).map(([nutrient, bounds]) => targetView(nutrient, bounds, servings)),
    footer: NOT_MEDICAL_ADVICE,
  };
}
