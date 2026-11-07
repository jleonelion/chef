// Recipe enrichment: dietary flags from the ingredient text, nutrition from USDA. Runs after
// every add and on request (re-enrich). Frontmatter only; the body is never changed. Flags are
// never removed, and earlier nutrition survives a run that cannot reach USDA.
import { dietaryFlags } from '../../../../lib/dietary-flags.mjs';
import { ingredientLines, listRecipes } from '../../../../lib/recipes.mjs';
import { writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';
import { computeNutrition } from './nutrition.mjs';

const NUTRITION_FIELDS = ['nutrition_status', 'nutrition_per_serving', 'nutrition_missing', 'nutrition_sources'];
const HINTS = {
  'not-connected': 'Nutrition not computed: Chef has no USDA FoodData Central connection. Run chef-setup to connect one.',
  'wrong-placement': 'Nutrition not computed: the USDA connector is set up differently than Chef expects. Run chef-setup to reconnect it.',
  rejected: 'Nutrition not computed: USDA rejected the key. Run chef-setup to reconnect the USDA connector.',
  'rate-limited': 'Nutrition not computed: USDA is limiting requests right now. Re-enrich later.',
  unreachable: 'Nutrition not computed: USDA FoodData Central could not be reached. Re-enrich later.',
};

const needsEnrichment = (fm) => !Array.isArray(fm.dietary_flags) || fm.nutrition_status !== 'complete';

function nutritionFields(nutrition, previous) {
  const kept = previous.nutrition_status === 'complete' || previous.nutrition_status === 'incomplete';
  if (nutrition.status === 'not-computed' && kept) return Object.fromEntries(NUTRITION_FIELDS.filter((f) => f in previous).map((f) => [f, previous[f]]));
  const fields = { nutrition_status: nutrition.status };
  if (nutrition.per_serving) fields.nutrition_per_serving = nutrition.per_serving;
  if (nutrition.missing) fields.nutrition_missing = nutrition.missing;
  if (nutrition.sources?.length) fields.nutrition_sources = nutrition.sources;
  return fields;
}

async function enrichOne(recipe, fdc) {
  const fm = recipe.frontmatter;
  const lines = ingredientLines(recipe.body);
  const previousFlags = Array.isArray(fm.dietary_flags) ? fm.dietary_flags : [];
  const flags = [...new Set([...previousFlags, ...dietaryFlags(lines)])].sort();
  const nutrition = await computeNutrition({ lines, servings: fm.servings, fdc });
  const rest = Object.fromEntries(Object.entries(fm).filter(([key]) => key !== 'dietary_flags' && !NUTRITION_FIELDS.includes(key)));
  const frontmatter = { ...rest, dietary_flags: flags, ...nutritionFields(nutrition, fm) };
  const report = { slug: recipe.slug, dietary_flags: flags, nutrition: nutrition.status };
  if (nutrition.missing) report.missing = nutrition.missing;
  if (nutrition.reason) report.reason = nutrition.reason;
  const changed = JSON.stringify(frontmatter) !== JSON.stringify(fm);
  return { report, reason: nutrition.reason, page: changed && { slug: recipe.slug, frontmatter, body: recipe.body } };
}

// slugs: recipes to enrich; unenriched: every recipe without flags or complete nutrition.
export async function enrichRecipes(root, { slugs = [], unenriched = false, fdc, date }) {
  const { recipes } = listRecipes(root);
  const unknown = slugs.filter((slug) => !recipes.some((r) => r.slug === slug));
  if (unknown.length) return { status: 'not-found', data_root: root, slugs: unknown };
  const refusal = writeRefusal(root);
  if (refusal) return refusal;
  const chosen = recipes.filter((r) => slugs.includes(r.slug) || (unenriched && needsEnrichment(r.frontmatter)));

  const results = [];
  for (const recipe of chosen) results.push(await enrichOne(recipe, fdc));
  const pages = results.filter((r) => r.page).map((r) => ({ ...r.page, frontmatter: { ...r.page.frontmatter, updated: date } }));
  const reason = results.find((r) => r.reason)?.reason;
  const summary = { data_root: root, recipes: results.map((r) => r.report), ...(reason && { hint: HINTS[reason] }) };
  if (!pages.length) return { status: 'unchanged', ...summary };

  const message = pages.length === 1 ? `chef-add-recipe: enrich ${pages[0].slug}` : `chef-add-recipe: enrich ${pages.length} recipes`;
  const written = writeWiki(root, { pages, message });
  return written.status === 'written' ? { status: 'enriched', ...summary } : written;
}
