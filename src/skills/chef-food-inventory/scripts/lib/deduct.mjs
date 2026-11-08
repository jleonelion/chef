import { ingredientLines, listRecipes } from '../../../../lib/recipes.mjs';
import { parseIngredientLine } from '../../../../lib/ingredient-line.mjs';
import { convertQuantity, normalizeUnit, quantityDimension } from '../../../../lib/quantity.mjs';
import { commitInventory } from './commit.mjs';
import { listItems, loadInventory, readText, STORE } from './store.mjs';

const round = (value) => Math.round(value * 1e6) / 1e6;
const itemName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function deductionApplied(root, deductionId) {
  return (readText(root, STORE.audit) ?? '').trim().split('\n').filter(Boolean).some((line) => {
    try {
      const entry = JSON.parse(line);
      return entry.action === 'deduct' && entry.details?.deduction_id === deductionId;
    } catch {
      return false;
    }
  });
}

function findItem(items, ingredient) {
  const wanted = itemName(ingredient);
  return items.find((item) => itemName(item.name) === wanted || itemName(item.key.replaceAll('_', ' ')) === wanted);
}

function publicDeduction(entry) {
  const { location, category, key, ...deduction } = entry;
  return deduction;
}

export function deductRecipe(root, { recipe: slug, servings, deductionId, now = new Date().toISOString() }) {
  const problems = [];
  if (!slug) problems.push('recipe: required');
  if (!Number.isFinite(servings) || servings <= 0) problems.push('servings: must be a positive number');
  if (!deductionId?.trim()) problems.push('deduction_id: required');
  if (problems.length) return { status: 'invalid-input', problems };
  if (deductionApplied(root, deductionId)) return { status: 'duplicate', deduction_id: deductionId };

  const { recipes, unreadable } = listRecipes(root);
  const recipe = recipes.find((candidate) => candidate.slug === slug);
  if (!recipe) {
    const unreadableRecipe = unreadable.find((candidate) => candidate.path.endsWith(`/${slug}.md`));
    return { status: 'invalid-input', problems: [unreadableRecipe ? `recipe ${slug} is unreadable: ${unreadableRecipe.reason}` : `recipe not found: ${slug}`] };
  }
  const baseServings = Number(recipe.frontmatter.servings);
  if (!Number.isFinite(baseServings) || baseServings <= 0) return { status: 'invalid-input', problems: [`recipe ${slug} has no valid servings`] };

  const inventory = loadInventory(root);
  const items = listItems(inventory);
  const multiplier = servings / baseServings;
  const planned = [];
  const notFound = [];
  const unitMismatches = [];

  for (const line of ingredientLines(recipe.body)) {
    const ingredient = parseIngredientLine(line);
    const match = findItem(items, ingredient.item);
    if (!match) {
      notFound.push(ingredient.item || line);
      continue;
    }
    if (ingredient.amount === null) {
      unitMismatches.push({ ingredient: ingredient.item, recipe_unit: '', inventory_unit: match.unit, reason: 'recipe ingredient has no quantity' });
      continue;
    }
    const recipeUnit = ingredient.unit ?? 'each';
    const amount = convertQuantity(ingredient.amount * multiplier, recipeUnit, match.unit);
    if (amount === null) {
      unitMismatches.push({
        ingredient: ingredient.item,
        recipe_unit: recipeUnit,
        inventory_unit: match.unit,
        recipe_dimension: quantityDimension(recipeUnit),
        inventory_dimension: quantityDimension(match.unit),
        reason: `cannot convert ${normalizeUnit(recipeUnit) || 'unitless'} to ${normalizeUnit(match.unit) || 'unitless'}`,
      });
      continue;
    }
    const deducted = Math.min(amount, match.amount);
    planned.push({
      ingredient: ingredient.item,
      recipe_amount: round(ingredient.amount * multiplier),
      recipe_unit: recipeUnit,
      inventory_unit: match.unit,
      inventory_path: match.path,
      previous_amount: match.amount,
      new_amount: round(Math.max(0, match.amount - amount)),
      deducted: round(deducted),
      shortfall: round(Math.max(0, amount - match.amount)),
      location: match.location,
      category: match.category,
      key: match.key,
    });
  }

  if (unitMismatches.length) return { status: 'invalid-input', problems: ['recipe and inventory units do not match'], unit_mismatches: unitMismatches, not_found: notFound };

  const next = structuredClone(inventory);
  next.lastUpdated = now;
  for (const deduction of planned) {
    Object.assign(next[deduction.location][deduction.category][deduction.key], { amount: deduction.new_amount, updated: now });
  }
  const deductions = planned.map(publicDeduction);
  const written = commitInventory(root, {
    inventory: next,
    action: 'deduct',
    details: { deduction_id: deductionId, recipe: slug, servings, multiplier, deductions, not_found: notFound },
    message: `chef-food-inventory: deduct ${slug}`,
  });
  if (written.status !== 'written') return written;
  return { status: 'deducted', deduction_id: deductionId, recipe: slug, servings, base_servings: baseServings, multiplier, deductions, not_found: notFound };
}
