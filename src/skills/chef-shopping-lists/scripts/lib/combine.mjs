// Combines scaled ingredient lines into shopping items and subtracts inventory. Never guesses a
// conversion: amounts merge only within one measurable dimension (mass, volume) or the same
// count unit; anything else becomes its own row. Mass and volume merge exactly in a base unit
// (g, tsp) so order never matters; the household's units apply only in displayItems.
import { parseIngredientLine } from '../../../../lib/ingredient-line.mjs';
import { convertQuantity, displayQuantity, normalizeUnit, quantityDimension } from '../../../../lib/quantity.mjs';

const BASE = { mass: 'g', volume: 'tsp' };
const SPOONS = new Set(['tsp', 'tbsp']);
const round = (value) => Math.round(value * 100) / 100;
export const itemName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const exact = (amount, unit) => {
  const base = BASE[quantityDimension(unit)];
  return base ? { amount: convertQuantity(amount, unit, base), unit: base } : { amount, unit };
};

// uses: [{ line, multiplier, recipe }] -> { items: [{ item, amount, unit, spoon, recipes, sources }], unquantified }
// Item amounts are exact, mass and volume in base units; sources keep each recipe's own unit.
export function combineLines(uses) {
  const items = [];
  const unquantified = [];
  for (const { line, multiplier, recipe } of uses) {
    const parsed = parseIngredientLine(line);
    const item = itemName(parsed.item || line);
    if (parsed.amount === null || parsed.trace) {
      unquantified.push({ item, line, recipe });
      continue;
    }
    const unit = normalizeUnit(parsed.unit ?? 'each');
    const source = { recipe, amount: round(parsed.amount * multiplier), unit };
    const { amount, unit: base } = exact(parsed.amount * multiplier, unit);
    const row = items.find((r) => r.item === item && convertQuantity(amount, base, r.unit) !== null);
    if (!row) {
      items.push({ item, amount, unit: base, spoon: SPOONS.has(unit), recipes: [recipe], sources: [source] });
      continue;
    }
    row.amount += convertQuantity(amount, base, row.unit);
    row.spoon ||= SPOONS.has(unit);
    row.sources.push(source);
    if (!row.recipes.includes(recipe)) row.recipes.push(recipe);
  }
  return { items, unquantified };
}

// stock: inventory items from listItems(). Exact amounts. -> { items still to buy, covered }
export function subtractInventory(items, stock) {
  const remaining = [];
  const covered = [];
  for (const row of items) {
    const match = stock.find((s) => itemName(s.name) === row.item);
    if (!match) {
      remaining.push(row);
      continue;
    }
    const have = convertQuantity(match.amount, match.unit, row.unit);
    const onHand = { on_hand: { amount: match.amount, unit: match.unit } };
    if (have === null) remaining.push({ ...row, ...onHand });
    else if (have >= row.amount) covered.push({ ...row, ...onHand });
    else remaining.push({ ...row, amount: row.amount - have });
  }
  return { items: remaining, covered };
}

// Rows as the household sees them: amount, unit and text in `system` ('us' | 'metric').
export function displayItems(items, system) {
  return items.map(({ item, amount, unit, spoon, recipes, sources, on_hand }) => ({
    item,
    ...displayQuantity(amount, unit, system, { spoon }),
    recipes,
    sources,
    ...(on_hand && { on_hand: displayQuantity(on_hand.amount, on_hand.unit, system) }),
  }));
}
