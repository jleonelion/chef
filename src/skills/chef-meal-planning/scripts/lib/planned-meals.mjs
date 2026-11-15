// Checks the planned meals `plan` reads on stdin: [{date, slot, recipe, servings?, note?}].
import { MEAL_SLOTS } from '../../../../lib/meal-slots.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRealDate = (value) => typeof value === 'string' && DATE.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function weekDates(weekStart) {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  return new Set(Array.from({ length: 7 }, (_, day) => new Date(start + day * 86400000).toISOString().slice(0, 10)));
}

function mealProblems(meal, at, week, weekStart) {
  if (meal === null || typeof meal !== 'object' || Array.isArray(meal)) return [`${at}: must be an object`];
  const problems = [];
  if (!isRealDate(meal.date)) problems.push(`${at}.date: must be a real YYYY-MM-DD date`);
  else if (!week.has(meal.date)) problems.push(`${at}.date: must fall in the week starting ${weekStart}`);
  if (!MEAL_SLOTS.includes(meal.slot)) problems.push(`${at}.slot: must be breakfast, lunch, dinner or snack`);
  if (typeof meal.recipe !== 'string' || !meal.recipe.trim()) problems.push(`${at}.recipe: must be a recipe slug`);
  if (meal.servings !== undefined && !(typeof meal.servings === 'number' && meal.servings > 0)) {
    problems.push(`${at}.servings: must be a number greater than zero`);
  }
  if (meal.note !== undefined && typeof meal.note !== 'string') problems.push(`${at}.note: must be text`);
  return problems;
}

export function plannedMealProblems(meals, weekStart) {
  if (!Array.isArray(meals)) return ['meals: must be a list of planned meals'];
  if (!meals.length) return ['meals: must list at least one planned meal'];
  const week = weekDates(weekStart);
  const taken = new Set();
  return meals.flatMap((meal, index) => {
    const at = `meals[${index}]`;
    const problems = mealProblems(meal, at, week, weekStart);
    if (problems.length) return problems;
    const key = `${meal.date} ${meal.slot}`;
    if (taken.has(key)) return [`${at}: ${key} is already planned`];
    taken.add(key);
    return [];
  });
}
