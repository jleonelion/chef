// Checks the planned meals `plan` reads on stdin: [{date, slot, servings?, note?}] plus exactly
// one of `recipe`, free-text `food` or `leftovers_of: {date, slot}` (ADR-0001).
import { MEAL_SLOTS, byDateAndSlot } from '../../../../lib/meal-slots.mjs';
import { mealKey, mealKind } from '../../../../lib/planned-meal.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KIND_FIELDS = ['recipe', 'food', 'leftovers_of'];

const isRealDate = (value) => typeof value === 'string' && DATE.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isMealRef = (ref) => isObject(ref) && isRealDate(ref.date) && MEAL_SLOTS.includes(ref.slot);

function weekDates(weekStart) {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  return new Set(Array.from({ length: 7 }, (_, day) => new Date(start + day * 86400000).toISOString().slice(0, 10)));
}

function kindProblems(meal, at) {
  if (KIND_FIELDS.filter((field) => meal[field] !== undefined).length !== 1) {
    return [`${at}: must name exactly one of recipe, food or leftovers_of`];
  }
  if (meal.recipe !== undefined && !isText(meal.recipe)) return [`${at}.recipe: must be a recipe slug`];
  if (meal.food !== undefined && !isText(meal.food)) return [`${at}.food: must be non-empty text`];
  if (meal.leftovers_of !== undefined && !isMealRef(meal.leftovers_of)) {
    return [`${at}.leftovers_of: must be {date, slot} with a real YYYY-MM-DD date and a known slot`];
  }
  return [];
}

function mealProblems(meal, at, week, weekStart) {
  if (!isObject(meal)) return [`${at}: must be an object`];
  const problems = [];
  if (!isRealDate(meal.date)) problems.push(`${at}.date: must be a real YYYY-MM-DD date`);
  else if (!week.has(meal.date)) problems.push(`${at}.date: must fall in the week starting ${weekStart}`);
  if (!MEAL_SLOTS.includes(meal.slot)) problems.push(`${at}.slot: must be breakfast, lunch, dinner or snack`);
  problems.push(...kindProblems(meal, at));
  if (meal.servings !== undefined && !(typeof meal.servings === 'number' && meal.servings > 0)) {
    problems.push(`${at}.servings: must be a number greater than zero`);
  }
  if (meal.note !== undefined && typeof meal.note !== 'string') problems.push(`${at}.note: must be text`);
  return problems;
}

// A leftovers meal points to an earlier recipe meal in the same list; no leftovers of leftovers.
function leftoversProblem(meal, at, byKey) {
  const key = mealKey(meal.leftovers_of);
  const target = byKey.get(key);
  if (!target) return `${at}.leftovers_of: no planned meal at ${key} in this plan`;
  if (byDateAndSlot(target, meal) >= 0) return `${at}.leftovers_of: ${key} must be an earlier planned meal`;
  if (mealKind(target) === 'food') return `${at}.leftovers_of: ${key} is free-text food, not a saved recipe`;
  if (mealKind(target) === 'leftovers') return `${at}.leftovers_of: ${key} is itself leftovers; point to the meal that cooked the dish`;
  return null;
}

export function plannedMealProblems(meals, weekStart) {
  if (!Array.isArray(meals)) return ['meals: must be a list of planned meals'];
  if (!meals.length) return ['meals: must list at least one planned meal'];
  const week = weekDates(weekStart);
  const byKey = new Map();
  const shapeProblems = meals.flatMap((meal, index) => {
    const at = `meals[${index}]`;
    const problems = mealProblems(meal, at, week, weekStart);
    if (problems.length) return problems;
    const key = mealKey(meal);
    if (byKey.has(key)) return [`${at}: ${key} is already planned`];
    byKey.set(key, meal);
    return [];
  });
  if (shapeProblems.length) return shapeProblems;
  return meals.flatMap((meal, index) => (mealKind(meal) === 'leftovers' ? [leftoversProblem(meal, `meals[${index}]`, byKey)] : []))
    .filter(Boolean);
}
