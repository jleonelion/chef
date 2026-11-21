// The kind of a planned meal and its amount to cook (ADR-0001), shared by every reader of a
// meal plan. A leftovers meal eats servings cooked at an earlier recipe meal in the same plan,
// so that meal cooks its own servings plus every leftovers meal's. Free-text food cooks nothing.
import { slotOf } from './meal-slots.mjs';

export function mealKind(meal) {
  if (meal.leftovers_of) return 'leftovers';
  if (meal.food !== undefined) return 'food';
  return 'recipe';
}

// What a planned meal is, as the `recipe` or `food` field of a meal-log entry. Leftovers keep the copied recipe.
export const mealSubject = (meal) => (meal.food === undefined ? { recipe: meal.slug } : { food: meal.food });

export const mealKey = (meal) => `${meal.date} ${slotOf(meal)}`;

export const leftoversFeeding = (meals, cooking) =>
  meals.filter((meal) => mealKind(meal) === 'leftovers' && mealKey(meal.leftovers_of) === mealKey(cooking));

// Adds the derived `cook_servings` to each recipe meal. Computed on read, never stored.
export function withAmountToCook(meals) {
  return meals.map((meal) => {
    if (mealKind(meal) !== 'recipe') return meal;
    const leftovers = leftoversFeeding(meals, meal).reduce((sum, { servings }) => sum + servings, 0);
    return { ...meal, cook_servings: meal.servings + leftovers };
  });
}
