// The one health-aware suggestions step, called by chef-meal-planning after a plan is saved.
// Advisory only: it reads the saved, dietary-gated plan and never adds, swaps or removes meals.
// Compares one serving of each planned meal with the goal's daily targets.
import { NOT_MEDICAL_ADVICE } from '../../../../lib/safety-text.mjs';

const oneDecimal = (value) => Math.round(value * 10) / 10;

function targetView(nutrient, bounds, servings) {
  const values = servings.map((s) => s.values[nutrient]);
  const average = oneDecimal(values.reduce((a, b) => a + b, 0) / values.length);
  const over = bounds.max === undefined ? [] : servings.filter((s) => s.values[nutrient] > bounds.max)
    .map((s) => ({ ...s.meal, per_serving: s.values[nutrient] }));
  return {
    nutrient,
    ...bounds,
    per_serving_average: average,
    share_of_target: Math.round((average / (bounds.max ?? bounds.min)) * 100),
    ...(over.length && { over_daily_max: over }),
  };
}

const unavailable = (goal, reason) => ({ status: 'unavailable', goal: goal.goal, reason, footer: NOT_MEDICAL_ADVICE });

export function healthSuggestions(plan, goal) {
  if (plan.nutrition?.status !== 'complete') {
    return unavailable(goal, 'some planned recipes have no complete nutrition, so Chef cannot compare the plan with your targets');
  }
  if (!plan.nutrition.meals.length) {
    return unavailable(goal, 'there are no planned recipe meals, so Chef has nothing to compare with your targets');
  }
  const servings = plan.nutrition.meals.map((m) => ({
    meal: { date: m.date, ...(m.slot && { slot: m.slot }), slug: m.slug },
    values: Object.fromEntries(Object.entries(m.totals).map(([field, total]) => [field, oneDecimal(total / m.servings)])),
  }));
  return {
    status: 'advisory',
    goal: goal.goal,
    basis: `one serving of each planned meal against your daily targets; the rest of each day is not counted${plan.nutrition.unmeasured?.length ? '; free-text meals are not counted' : ''}`,
    targets: Object.entries(goal.targets).map(([nutrient, bounds]) => targetView(nutrient, bounds, servings)),
    footer: NOT_MEDICAL_ADVICE,
  };
}
