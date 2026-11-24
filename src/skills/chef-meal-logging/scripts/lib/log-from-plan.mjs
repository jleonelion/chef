import { MEAL_SLOTS } from '../../../../lib/meal-slots.mjs';
import { mealKind, mealSubject } from '../../../../lib/planned-meal.mjs';
import { todayPlan } from '../../../chef-meal-planning/scripts/lib/today.mjs';
import { logMeal, validate } from './log.mjs';

const invalid = (...problems) => ({ status: 'invalid-input', problems });

// Logs a date's planned meals (or one slot) as eaten. Everything is checked before anything is written.
export function logFromPlan(root, { date, slot, cookedSlots, loggedAt, matches = [] }) {
  if (slot !== undefined && !MEAL_SLOTS.includes(slot)) return invalid('slot: must be breakfast, lunch, dinner or snack');
  const plan = todayPlan(root, date ?? '');
  const meals = (plan.meals ?? []).filter((meal) => !slot || meal.slot === slot);
  if (!meals.length) return { status: 'not-found', reason: `no planned meal for ${date}${slot ? ` ${slot}` : ''}` };

  const cooked = (meal) => cookedSlots.includes(meal.slot);
  if (cookedSlots.some((name) => !meals.some((meal) => meal.slot === name))) {
    return invalid('--cooked-slots must name selected planned meals');
  }
  if (meals.some((meal) => cooked(meal) && mealKind(meal) === 'leftovers')) {
    return invalid('leftovers were cooked by their source meal and cannot be logged as cooked');
  }

  const inputs = meals.map((meal) => ({
    date: meal.date,
    slot: meal.slot,
    ...mealSubject(meal),
    servings: meal.servings,
    servingsCooked: meal.cook_servings,
    cooked: cooked(meal),
    loggedAt,
    matches,
  }));
  const problems = inputs.flatMap((input) => validate(root, input));
  if (problems.length) return invalid(...problems);

  const results = inputs.map((input) => logMeal(root, input));
  const failure = results.find((result) => ['invalid-input', 'refused'].includes(result.status));
  return { status: failure?.status ?? 'logged', results };
}
