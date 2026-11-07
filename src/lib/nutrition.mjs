// Per-serving nutrition from USDA FoodData Central, never estimated: every ingredient must
// resolve to a USDA food, a gram weight (from the line itself or a USDA portion of that food)
// and every tracked nutrient. Anything short of that leaves the recipe "incomplete" with
// reasons, and no numbers. No USDA access at all means "not-computed".
import { NUTRIENTS } from './fdc.mjs';
import { bestMatch, reviewedMatch, singular } from './fdc-match.mjs';
import { GRAMS_PER, ML_PER, parseIngredientLine } from './ingredient-line.mjs';

const MG = new Set(['sodium', 'cholesterol']);
const oneDecimal = (value) => Math.round(value * 10) / 10;
const round = (field, value) => (field === 'calories' || MG.has(field) ? Math.round(value) : oneDecimal(value));

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

async function ingredient(line, lookup) {
  const parsed = parseIngredientLine(line);
  if (parsed.trace) return { grams: 0 };
  if (parsed.amount === null) return { missing: `${line}: no amount` };
  const food = await lookup.match(parsed.item);
  if (!food) return { missing: `${line}: no matching USDA food` };
  let grams = parsed.packageGrams ? parsed.amount * parsed.packageGrams : GRAMS_PER[parsed.unit] && parsed.amount * GRAMS_PER[parsed.unit];
  if (!grams) grams = gramsFromPortions(parsed, await lookup.detail(food.fdcId));
  if (!grams) return { missing: `${line}: USDA has no "${parsed.unit ?? parsed.size ?? 'medium'}" portion for ${food.description}` };
  const absent = Object.keys(NUTRIENTS).filter((field) => food.per100g[field] === undefined);
  if (absent.length) return { missing: `${line}: USDA has no ${absent.join(', ')} value for ${food.description}` };
  return { grams, food, source: `${line}: ${food.description} (FDC ${food.fdcId}), ${oneDecimal(grams)} g` };
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

export async function computeNutrition({ lines, servings, fdc }) {
  if (fdc.unavailable) return { status: 'not-computed', reason: fdc.unavailable };
  if (!Number.isInteger(servings) || servings < 1) return { status: 'incomplete', missing: ['servings: the recipe does not say how many it serves'], sources: [] };
  const lookup = memoLookup(fdc);
  const totals = Object.fromEntries(Object.keys(NUTRIENTS).map((field) => [field, 0]));
  const missing = [];
  const sources = [];
  try {
    for (const line of lines) {
      const result = await ingredient(line, lookup);
      if (result.missing) missing.push(result.missing);
      if (!result.food) continue;
      sources.push(result.source);
      for (const field of Object.keys(totals)) totals[field] += (result.food.per100g[field] * result.grams) / 100;
    }
  } catch (error) {
    if (error instanceof UsdaUnavailable) return { status: 'not-computed', reason: error.message };
    throw error;
  }
  if (missing.length) return { status: 'incomplete', missing, sources };
  const per_serving = Object.fromEntries(Object.entries(totals).map(([field, total]) => [field, round(field, total / servings)]));
  return { status: 'complete', per_serving, sources };
}
