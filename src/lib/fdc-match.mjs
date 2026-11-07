// Picks the USDA food an ingredient names, or none. A food qualifies only when its leading
// description segments name the ingredient. USDA writes "Category, specific, preparation"
// (e.g. "Cheese, parmesan, grated"), so one extra word is allowed only as the category
// ahead of the ingredient's own segment. Brands and restaurant dishes never qualify.
import { DATA_TYPE } from './fdc.mjs';
import { REVIEWED_FDC_FOODS } from './fdc-synonyms-data.mjs';

const STOP = new Set(['and', 'or', 'with', 'without', 'in', 'of', 'from', 'the', 'a']);
const NEUTRAL = new Set(['raw', 'fresh', 'dry', 'whole', 'plain', 'regular', 'grated', 'shredded', 'ground', 'enriched', 'unenriched', 'mature', 'seed']);

export const singular = (word) => word.replace(/ies$/, 'y').replace(/eaves$/, 'eaf').replace(/(o|sh|ch|x)es$/, '$1').replace(/([^s])s$/, '$1');
const tokens = (text) => text.toLowerCase().split(/[^a-z]+/).filter((w) => w && !STOP.has(w)).map(singular);
const isBrand = (segment) => /\b[A-Z]{3,}\b/.test(segment) || /^restaurant\b/i.test(segment);
const normalizedAlias = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const REVIEWED_BY_ALIAS = new Map(
  REVIEWED_FDC_FOODS.flatMap(({ aliases, ...food }) => aliases.map((alias) => [normalizedAlias(alias), food])),
);

export function reviewedMatch(item) {
  return REVIEWED_BY_ALIAS.get(normalizedAlias(item)) ?? null;
}

// 0 = names exactly the ingredient, 1 = ingredient under a category word, null = no match.
function matchRank(itemTokens, description) {
  const segments = description.replace(/\([^)]*\)/g, '').split(',').map((s) => s.trim());
  if (isBrand(segments[0])) return null;
  const [first, second = []] = segments.slice(0, 2).map(tokens);
  const head = new Set([...first, ...second]);
  if (!itemTokens.every((t) => head.has(t))) return null;
  const extras = [...head].filter((t) => !itemTokens.includes(t) && !NEUTRAL.has(t));
  if (extras.length === 0) return 0;
  const categoryOnly = extras.length === 1 && first.includes(extras[0]) && itemTokens.some((t) => second.includes(t));
  return categoryOnly ? 1 : null;
}

// The best-ranked qualifying food; ties go to USDA's own search order.
export function bestMatch(item, foods) {
  const itemTokens = tokens(item).filter((t) => !NEUTRAL.has(t));
  if (itemTokens.length === 0) return null;
  let best = null;
  for (const food of foods) {
    if (food.dataType !== DATA_TYPE) continue;
    const rank = matchRank(itemTokens, food.description);
    if (rank !== null && (best === null || rank < best.rank)) best = { rank, food };
  }
  return best?.food ?? null;
}
