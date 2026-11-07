// Facet search over recipe pages (from lib/recipes.mjs). Every facet must match. A recipe
// missing the data a facet needs (time, dietary flags) never matches it and is counted.
import { ingredientLines } from '../../../../lib/recipes.mjs';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordStart = (needle) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(needle.trim())}`, 'iu');
const lower = (value) => String(value ?? '').toLowerCase();
const list = (value) => (Array.isArray(value) ? value.map(lower) : []);

function view(recipe) {
  const fm = recipe.frontmatter;
  const ingredients = ingredientLines(recipe.body);
  const haystack = [fm.title, fm.cuisine, ...list(fm.tags), ...ingredients].map(lower).join('\n');
  return { recipe, fm, ingredients, haystack, tags: list(fm.tags), flags: Array.isArray(fm.dietary_flags) ? list(fm.dietary_flags) : null };
}

const anyLine = (lines, needle) => lines.some((line) => wordStart(needle).test(line));

// Each check returns true (match), false (no match) or 'missing' (data a facet needs is absent).
const CHECKS = {
  query: (v, q) => lower(q).split(/\s+/).filter(Boolean).every((word) => wordStart(word).test(v.haystack)),
  ingredient: (v, items) => items.every((item) => anyLine(v.ingredients, item)),
  exclude_ingredient: (v, items) => !items.some((item) => anyLine(v.ingredients, item)),
  cuisine: (v, cuisine) => lower(v.fm.cuisine) === lower(cuisine).trim(),
  tag: (v, tags) => tags.every((tag) => v.tags.includes(lower(tag).trim())),
  flag: (v, flags) => (v.flags === null ? 'missing:dietary_flags' : flags.every((flag) => v.flags.includes(lower(flag).trim()))),
  max_minutes: (v, max) => (Number.isInteger(v.fm.total_minutes) ? v.fm.total_minutes <= max : 'missing:total_minutes'),
};

function summary({ recipe, fm, tags, flags }) {
  return {
    slug: recipe.slug,
    title: fm.title ?? recipe.slug,
    path: recipe.path,
    cuisine: fm.cuisine ?? null,
    tags,
    total_minutes: fm.total_minutes ?? null,
    servings: fm.servings ?? null,
    dietary_flags: flags,
  };
}

export function searchRecipes(recipes, { limit = 20, ...facets }) {
  const active = Object.entries(facets).filter(([key, value]) => Object.hasOwn(CHECKS, key) && value !== undefined && !(Array.isArray(value) && !value.length));
  const matches = [];
  const missing = {};
  for (const v of recipes.filter((r) => r.frontmatter.type === 'recipe').map(view)) {
    const results = active.map(([key, value]) => CHECKS[key](v, value));
    if (results.every((r) => r === true)) matches.push(v);
    const gap = results.find((r) => typeof r === 'string');
    if (gap && results.every((r) => r !== false)) {
      const field = gap.slice('missing:'.length);
      missing[field] = (missing[field] ?? 0) + 1;
    }
  }
  const result = { count: matches.length, recipes: matches.slice(0, limit).map(summary) };
  if (Object.keys(missing).length) result.missing_data = missing;
  return result;
}
