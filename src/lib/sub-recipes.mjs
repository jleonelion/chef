// Sub-recipe references: an ingredient line that links another recipe page, such as
// "1/2 cup [[basil-pesto]]" or "1 serving [[basil-pesto]]". The parent counts the linked
// recipe's stored nutrition_per_serving, scaled by the servings it uses, and never copies the
// linked recipe's ingredients. A volume or weight is read against the linked recipe's `yield`.
import { parseIngredientLine } from './ingredient-line.mjs';
import { convertQuantity } from './quantity.mjs';

const LINK = /\[\[([a-z0-9]+(?:-[a-z0-9]+)*)(?:\|[^\]]*)?\]\]/;

export const linkedSlug = (line) => line.match(LINK)?.[1] ?? null;

// Servings of the linked recipe `sub` (its frontmatter, or undefined) that a parsed line uses:
// { servings } or { reason } when it cannot tell.
export function servingsUsed(parsed, slug, sub) {
  if (!sub) return { reason: `sub-recipe ${slug} not found` };
  if (sub.nutrition_status !== 'complete' || !sub.nutrition_per_serving) return { reason: `sub-recipe ${slug} nutrition is ${sub.nutrition_status ?? 'not computed yet'}` };
  if (parsed.amount === null) return { reason: 'no amount' };
  if (parsed.unit === 'serving') return { servings: parsed.amount };
  if (!parsed.unit) return { reason: `say how much of ${slug}: servings, or a volume or weight` };
  const made = sub.yield ? parseIngredientLine(String(sub.yield)) : null;
  if (!made?.amount || !made.unit) return { reason: `sub-recipe ${slug} has no yield; give servings instead` };
  const share = convertQuantity(parsed.amount, parsed.unit, made.unit);
  if (share === null) return { reason: `${parsed.unit} does not convert to the ${slug} yield of ${sub.yield}` };
  return { servings: (share / made.amount) * sub.servings };
}
