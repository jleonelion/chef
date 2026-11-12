// USDA FoodData Central client. SR Legacy only: it has full nutrient profiles and household
// portions. The credential comes from the runtime adapter; its value goes only where the
// adapter's placement says, redirects are refused, and results never echo the request URL.
import { muse } from '../runtime/muse.mjs';
import { cacheFor } from './fdc-cache.mjs';

const BASE = 'https://api.nal.usda.gov/fdc/v1';
export const DATA_TYPE = 'SR Legacy';
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

// The USDA client wired to the runtime adapter's credential seam. With a data root and
// CHEF_FDC_CACHE=1, food details come from the data root's reply cache when it has them.
export const usdaClient = ({ root } = {}) => fdcClient({ credential: muse.credential('usda-fdc'), cache: cacheFor(root) });

// cache: optional { read(fdcId), write(fdcId, body) } for raw food-detail replies.
export function fdcClient({ credential, fetchImpl = fetch, cache = null }) {
  async function get(pathname, params) {
    if (!credential.ok) return { ok: false, reason: credential.reason };
    if (credential.placement.in !== 'query') return { ok: false, reason: 'wrong-placement' };
    const url = new URL(`${BASE}${pathname}`);
    for (const [name, value] of Object.entries({ ...params, [credential.placement.name]: credential.value })) url.searchParams.set(name, value);
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
      if (!Number.isInteger(fdcId)) return { ok: false, reason: 'unreachable' };
      if (!credential.ok) return { ok: false, reason: credential.reason };
      const cached = cache?.read(fdcId);
      if (cached) return { ok: true, food: toFood(cached) };
      const result = await get(`/food/${fdcId}`, {});
      if (!result.ok) return result;
      cache?.write(fdcId, result.body);
      return { ok: true, food: toFood(result.body) };
    },
  };
}
