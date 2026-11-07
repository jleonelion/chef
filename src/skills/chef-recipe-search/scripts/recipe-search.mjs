#!/usr/bin/env node
// chef-recipe-search entry point, read-only. Modes: search (facets), show (one recipe).
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { listRecipes } from '../../../lib/recipes.mjs';
import { readSchemaVersion } from '../../../lib/schema.mjs';
import { searchRecipes } from './lib/search.mjs';

const many = { type: 'string', multiple: true };
const { values, positionals } = parseArgs({
  options: {
    'data-root': { type: 'string' },
    query: { type: 'string' },
    ingredient: many,
    'exclude-ingredient': many,
    cuisine: { type: 'string' },
    tag: many,
    flag: many,
    'max-minutes': { type: 'string' },
    limit: { type: 'string' },
    slug: { type: 'string' },
    'include-retired': { type: 'boolean' },
  },
  allowPositionals: true,
});
const root = resolveDataRoot({ flag: values['data-root'] });
const split = (items) => items?.flatMap((item) => item.split(',')).map((item) => item.trim()).filter(Boolean);
const wholeNumber = (value) => (value === undefined ? undefined : /^\d+$/.test(value) ? Number(value) : NaN);

function search(recipes) {
  const facets = {
    query: values.query,
    ingredient: split(values.ingredient),
    exclude_ingredient: split(values['exclude-ingredient']),
    cuisine: values.cuisine,
    tag: split(values.tag),
    flag: split(values.flag),
    max_minutes: wholeNumber(values['max-minutes']),
    limit: wholeNumber(values.limit) ?? 20,
    include_retired: values['include-retired'],
  };
  const bad = ['max_minutes', 'limit'].filter((key) => Number.isNaN(facets[key]));
  if (bad.length) return { status: 'invalid-input', data_root: root, problems: bad.map((key) => `--${key.replace('_', '-')} must be a whole number`) };
  const facetsUsed = Object.fromEntries(Object.entries(facets).filter(([key, v]) => !['limit', 'include_retired'].includes(key) && v !== undefined && !(Array.isArray(v) && !v.length)));
  return { status: 'ok', data_root: root, facets: facetsUsed, total_recipes: recipes.length, ...searchRecipes(recipes, facets) };
}

function show(recipes) {
  const recipe = recipes.find((r) => r.slug === values.slug);
  if (!recipe) return { status: 'not-found', data_root: root, slug: values.slug ?? null };
  return { status: 'ok', data_root: root, slug: recipe.slug, path: recipe.path, frontmatter: recipe.frontmatter, body: recipe.body };
}

const MODES = { search, show };
const mode = positionals[0];
if (!Object.hasOwn(MODES, mode)) {
  console.error(`Unknown mode "${mode}". Supported: ${Object.keys(MODES).join(', ')}`);
  process.exit(64);
}

let result;
if (readSchemaVersion(root) === null) result = { status: 'refused', data_root: root, reason: 'not a Chef data root; run chef-setup first' };
else {
  const { recipes, unreadable } = listRecipes(root);
  result = MODES[mode](recipes);
  if (unreadable.length) result.unreadable = unreadable;
}
console.log(JSON.stringify(result));
if (['refused', 'invalid-input'].includes(result.status)) process.exitCode = 2;
