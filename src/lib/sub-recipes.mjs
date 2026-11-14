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

export const MAX_DEPTH = 3;

// How recipes link each other, from [{ slug, lines }]. `order` lists every slug with linked
// recipes before the recipes that use them; `blocked` maps a slug in a link cycle, or nested
// more than MAX_DEPTH deep, to the reason; `usedBy` maps a slug to the recipes linking it.
export function subRecipeGraph(recipes) {
  const links = new Map(recipes.map(({ slug, lines }) => [slug, [...new Set(lines.map(linkedSlug).filter(Boolean))]]));
  const order = [];
  const blocked = new Map();
  const depth = new Map();
  const visiting = new Set();
  const usedBy = new Map();
  for (const [slug, linked] of links) for (const sub of linked) usedBy.set(sub, [...(usedBy.get(sub) ?? []), slug]);

  function visit(slug, trail) {
    if (depth.has(slug)) return depth.get(slug);
    if (visiting.has(slug)) {
      const cycle = [...trail.slice(trail.indexOf(slug)), slug];
      for (const member of cycle) blocked.set(member, `sub-recipe cycle: ${cycle.join(' -> ')}`);
      return 0;
    }
    visiting.add(slug);
    let deepest = 0;
    for (const sub of links.get(slug)) if (links.has(sub)) deepest = Math.max(deepest, 1 + visit(sub, [...trail, slug]));
    visiting.delete(slug);
    depth.set(slug, deepest);
    order.push(slug);
    if (deepest > MAX_DEPTH && !blocked.has(slug)) blocked.set(slug, `sub-recipes nest more than ${MAX_DEPTH} levels deep`);
    return deepest;
  }
  for (const slug of links.keys()) visit(slug, []);
  return { order, blocked, usedBy };
}
