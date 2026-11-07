// USDA FoodData Central client. SR Legacy only: it has full nutrient profiles and household
// portions. The credential comes from the runtime adapter; its value goes only where the
// adapter's placement says, redirects are refused, and results never echo the request URL.
import { muse } from '../runtime/muse.mjs';

const BASE = 'https://api.nal.usda.gov/fdc/v1';
const DATA_TYPE = 'SR Legacy';
const TIMEOUT_MS = 15000;

// Nutrient field -> FDC nutrient id. Values are per 100 g; units kcal, g, or mg.
export const NUTRIENTS = { calories: 1008, protein: 1003, fat: 1004, saturated_fat: 1258, carbs: 1005, fiber: 1079, sugar: 2000, sodium: 1093, cholesterol: 1253 };

function per100g(foodNutrients = []) {
  const byId = new Map(foodNutrients.map((n) => [n.nutrientId ?? n.nutrient?.id, n.value ?? n.amount]));
  const values = {};
  for (const [field, id] of Object.entries(NUTRIENTS)) if (typeof byId.get(id) === 'number') values[field] = byId.get(id);
  return values;
}

const toFood = (raw) => ({
  fdcId: raw.fdcId,
  description: raw.description,
  dataType: raw.dataType,
  per100g: per100g(raw.foodNutrients),
  portions: (raw.foodPortions ?? []).map(({ amount, modifier, gramWeight }) => ({ amount, modifier, gramWeight })),
});

function failure(status) {
  if (status === 401 || status === 403) return 'rejected';
  if (status === 429) return 'rate-limited';
  return 'unreachable';
}

// The USDA client wired to the runtime adapter's credential seam.
export const usdaClient = (adapter = muse) => fdcClient({ credential: adapter.credential('usda-fdc') });

export function fdcClient({ credential, fetchImpl = fetch }) {
  async function get(pathname, params) {
    if (!credential.ok) return { ok: false, reason: credential.reason };
    const url = new URL(`${BASE}${pathname}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    if (credential.placement.in !== 'query') return { ok: false, reason: 'wrong-placement' };
    url.searchParams.set(credential.placement.name, credential.value);
    try {
      const response = await fetchImpl(url.href, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) return { ok: false, reason: failure(response.status) };
      return { ok: true, body: await response.json() };
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
  }
  return {
    unavailable: credential.ok ? null : credential.reason,
    async search(query, { pageSize = 25 } = {}) {
      const result = await get('/foods/search', { query, dataType: DATA_TYPE, requireAllWords: 'true', pageSize: String(pageSize) });
      return result.ok ? { ok: true, foods: (result.body.foods ?? []).map(toFood) } : result;
    },
    async food(fdcId) {
      const result = await get(`/food/${Number(fdcId)}`, {});
      return result.ok ? { ok: true, food: toFood(result.body) } : result;
    },
  };
}

// Matching: a food qualifies only when its leading description segments name the ingredient.
// USDA writes "Category, specific, preparation" (e.g. "Cheese, parmesan, grated"), so one
// extra word is allowed only as the category ahead of the ingredient's own segment.
const STOP = new Set(['and', 'or', 'with', 'without', 'in', 'of', 'from', 'the', 'a']);
const NEUTRAL = new Set(['raw', 'fresh', 'dry', 'whole', 'plain', 'regular', 'grated', 'shredded', 'ground', 'enriched', 'unenriched', 'mature', 'seed']);

const singular = (word) => word.replace(/ies$/, 'y').replace(/(o|sh|ch|x)es$/, '$1').replace(/([^s])s$/, '$1');
const tokens = (text) => text.toLowerCase().split(/[^a-z]+/).filter((w) => w && !STOP.has(w)).map(singular);
const isBrand = (segment) => /\b[A-Z]{3,}\b/.test(segment) || /^restaurant\b/i.test(segment);

function score(itemTokens, description) {
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

export function bestMatch(item, foods) {
  const itemTokens = tokens(item).filter((t) => !NEUTRAL.has(t));
  if (itemTokens.length === 0) return null;
  let best = null;
  for (const food of foods) {
    if (food.dataType !== DATA_TYPE) continue;
    const s = score(itemTokens, food.description);
    if (s !== null && (best === null || s < best.s)) best = { s, food };
  }
  return best?.food ?? null;
}
