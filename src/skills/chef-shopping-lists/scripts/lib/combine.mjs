// Combines scaled ingredient lines into shopping items and subtracts inventory. Never guesses a
// conversion: amounts merge only within one measurable dimension (mass, volume) or the same
// count unit; anything else becomes its own row.
import { parseIngredientLine } from '../../../../lib/ingredient-line.mjs';
import { convertQuantity, normalizeUnit } from '../../../../lib/quantity.mjs';

const round = (value) => Math.round(value * 100) / 100;
export const itemName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// uses: [{ line, multiplier, recipe }] -> { items: [{ item, amount, unit, recipes }], unquantified: [{ item, line, recipe }] }
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
    const amount = parsed.amount * multiplier;
    const row = items.find((r) => r.item === item && convertQuantity(amount, unit, r.unit) !== null);
    if (!row) {
      items.push({ item, amount: round(amount), unit, recipes: [recipe] });
      continue;
    }
    row.amount = round(row.amount + convertQuantity(amount, unit, row.unit));
    if (!row.recipes.includes(recipe)) row.recipes.push(recipe);
  }
  return { items, unquantified };
}

// stock: inventory items from listItems(). -> { items still to buy, covered }
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
    if (have === null) remaining.push({ ...row, on_hand: { amount: match.amount, unit: match.unit } });
    else if (have >= row.amount) covered.push({ ...row, on_hand: { amount: match.amount, unit: match.unit } });
    else remaining.push({ ...row, amount: round(row.amount - have) });
  }
  return { items: remaining, covered };
}
