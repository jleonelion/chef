// Per-serving nutrition from USDA FoodData Central, never estimated: every counted ingredient
// must resolve to a USDA food, a gram weight (from the line itself or a USDA portion of that
// food) and every tracked nutrient, or to a linked sub-recipe with complete nutrition. Anything
// short of that leaves the recipe "incomplete" with reasons, and no numbers. Optional, garnish,
// unmeasured seasoning and trace lines are excluded, and listed as such in the sources. No USDA
// access at all means "not-computed".
import { NUTRIENTS } from './fdc.mjs';
import { bestMatch, reviewedMatch, singular } from './fdc-match.mjs';
import { GRAMS_PER, ML_PER, parseIngredientLine } from './ingredient-line.mjs';
import { exclusion, NO_ZEST_YIELD } from './nutrition-exclusions.mjs';
import { linkedSlug, servingsUsed } from './sub-recipes.mjs';

const MG = new Set(['sodium', 'cholesterol']);
const oneDecimal = (value) => Math.round(value * 10) / 10;
const round = (field, value) => (field === 'calories' || MG.has(field) ? Math.round(value) : oneDecimal(value));

export function rollupNutrition(meals) {
  const fields = Object.keys(NUTRIENTS);
  const totals = Object.fromEntries(fields.map((field) => [field, 0]));
  const missing = [];
  const rolled = meals.map((meal) => {
    const id = { date: meal.date, ...(meal.slot && { slot: meal.slot }), slug: meal.slug };
    if (!meal.nutrition_per_serving || meal.nutrition_status && meal.nutrition_status !== 'complete') {
      missing.push({ ...id, reason: 'recipe nutrition is not complete' });
      return { ...id, servings: meal.servings, status: meal.nutrition_status ?? 'not-computed' };
    }
    const mealTotals = Object.fromEntries(fields.map((field) => [field, round(field, meal.nutrition_per_serving[field] * meal.servings)]));
    for (const field of fields) totals[field] += mealTotals[field];
    return { ...id, servings: meal.servings, totals: mealTotals };
  });
  if (missing.length) return { status: 'incomplete', meals: rolled, missing };
  return {
    status: 'complete',
    meals: rolled,
    totals: Object.fromEntries(fields.map((field) => [field, round(field, totals[field])])),
  };
}

// Thrown when USDA cannot answer at all; the whole recipe is then "not-computed".
class UsdaUnavailable extends Error {}
const usdaAnswer = (result) => {
  if (!result.ok) throw new UsdaUnavailable(result.reason);
  return result;
};

// A USDA portion modifier such as "cup", "cloves" or "medium (2-1/2\" dia)".
const portionWord = (portion) => singular(portion.modifier.toLowerCase().split(/[^a-z]+/)[0]);

function gramsFromPortions(parsed, food) {
  const { amount, unit, size } = parsed;
  const portions = food.portions.filter((p) => p.amount > 0 && p.gramWeight > 0);
  if (unit && ML_PER[unit]) {
    const volume = portions.find((p) => portionWord(p) === unit) ?? portions.find((p) => ML_PER[portionWord(p)]);
    return volume ? (amount * ML_PER[unit] * volume.gramWeight) / (volume.amount * ML_PER[portionWord(volume)]) : null;
  }
  const wanted = unit ? [unit] : [size ?? 'medium'];
  const count = portions.find((p) => wanted.includes(portionWord(p)));
  return count ? (amount * count.gramWeight) / count.amount : null;
}

const FIELDS = Object.keys(NUTRIENTS);
const scaled = (values, factor) => Object.fromEntries(FIELDS.map((field) => [field, values[field] * factor]));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function subRecipeLine(line, parsed, slug, subRecipe) {
  const sub = subRecipe(slug);
  const used = servingsUsed(parsed, slug, sub);
  if (used.reason) return { missing: `${line}: ${used.reason}` };
  const absent = FIELDS.filter((field) => typeof sub.nutrition_per_serving[field] !== 'number');
  if (absent.length) return { missing: `${line}: sub-recipe ${slug} has no ${absent.join(', ')} value` };
  const servings = Math.round(used.servings * 100) / 100;
  return { amounts: scaled(sub.nutrition_per_serving, used.servings), source: `${line}: sub-recipe ${slug}, ${plural(servings, 'serving')}` };
}

// One line's contribution: { amounts, source }, { source } when excluded, or { missing }.
async function ingredient(line, lookup, subRecipe) {
  const parsed = parseIngredientLine(line);
  const excluded = exclusion(parsed);
  if (excluded) return { source: `${line}: excluded: ${excluded}` };
  const slug = linkedSlug(line);
  if (slug) return subRecipeLine(line, parsed, slug, subRecipe);
  if (!parsed.citrus) return usdaLine(line, parsed, lookup);
  // Juice by the fruit: the fruit is the unit, read against the juice food's "1 lemon yields" portion.
  const juice = { ...parsed, item: `${parsed.item} juice`, unit: parsed.item };
  return usdaLine(line, juice, lookup, parsed.citrus === 'zest-and-juice' ? `zest excluded: ${NO_ZEST_YIELD}` : null);
}

async function usdaLine(line, parsed, lookup, note = null) {
  if (parsed.amount === null) return { missing: `${line}: no amount` };
  const food = await lookup.match(parsed.item);
  if (!food) return { missing: `${line}: no matching USDA food` };
  let grams = parsed.packageGrams ? parsed.amount * parsed.packageGrams : GRAMS_PER[parsed.unit] && parsed.amount * GRAMS_PER[parsed.unit];
  if (!grams) grams = gramsFromPortions(parsed, await lookup.detail(food.fdcId));
  if (!grams) return { missing: `${line}: USDA has no "${parsed.unit ?? parsed.size ?? 'medium'}" portion for ${food.description}` };
  const absent = FIELDS.filter((field) => food.per100g[field] === undefined);
  if (absent.length) return { missing: `${line}: USDA has no ${absent.join(', ')} value for ${food.description}` };
  return { amounts: scaled(food.per100g, grams / 100), source: `${line}: ${food.description} (FDC ${food.fdcId}), ${oneDecimal(grams)} g${note ? `; ${note}` : ''}` };
}

function memoLookup(fdc) {
  const matches = new Map();
  const details = new Map();
  async function detail(fdcId) {
    if (!details.has(fdcId)) details.set(fdcId, usdaAnswer(await fdc.food(fdcId)).food);
    return details.get(fdcId);
  }
  return {
    async match(item) {
      if (!matches.has(item)) {
        const reviewed = reviewedMatch(item);
        matches.set(item, reviewed ? await detail(reviewed.fdcId) : bestMatch(item, usdaAnswer(await fdc.search(item)).foods));
      }
      return matches.get(item);
    },
    detail,
  };
}

// subRecipe(slug): the linked recipe's frontmatter, or undefined when there is no such recipe.
export async function computeNutrition({ lines, servings, fdc, subRecipe = () => undefined }) {
  if (fdc.unavailable) return { status: 'not-computed', reason: fdc.unavailable };
  if (!Number.isInteger(servings) || servings < 1) return { status: 'incomplete', missing: ['servings: the recipe does not say how many it serves'], sources: [] };
  const lookup = memoLookup(fdc);
  const totals = Object.fromEntries(FIELDS.map((field) => [field, 0]));
  const missing = [];
  const sources = [];
  try {
    for (const line of lines) {
      const result = await ingredient(line, lookup, subRecipe);
      if (result.missing) missing.push(result.missing);
      if (result.source) sources.push(result.source);
      for (const field of FIELDS) totals[field] += result.amounts?.[field] ?? 0;
    }
  } catch (error) {
    if (error instanceof UsdaUnavailable) return { status: 'not-computed', reason: error.message };
    throw error;
  }
  if (missing.length) return { status: 'incomplete', missing, sources };
  const per_serving = Object.fromEntries(Object.entries(totals).map(([field, total]) => [field, round(field, total / servings)]));
  return { status: 'complete', per_serving, sources };
}
