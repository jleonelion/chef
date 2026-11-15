// Meal slots, shared by meal plans and the meal log. A planned meal saved without a slot
// (every v1 one-per-day plan) reads as dinner.
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

export const slotOf = (meal) => meal.slot ?? 'dinner';

export const withSlot = (meal) => ({ ...meal, slot: slotOf(meal) });

export const byDateAndSlot = (a, b) =>
  a.date.localeCompare(b.date) || MEAL_SLOTS.indexOf(slotOf(a)) - MEAL_SLOTS.indexOf(slotOf(b));
