#!/usr/bin/env node
// chef-recipe-search entry point, read-only. Modes: search (facets), show (one recipe).
// Search runs every match through the dietary gate; --override lifts one constraint for this call only.
import { parseArgs } from 'node:util';
import { invalidMode, isDirectExecution } from '../../../lib/cli-entry.mjs';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture } from '../../../lib/diagnostics/capture.mjs';
import { gateRecipe, parseOverrides } from '../../../lib/dietary-gate.mjs';
import { dietaryNotes, readRuleset } from '../../../lib/dietary-ruleset.mjs';
import { convertRecipeBody } from '../../../lib/recipe-units.mjs';
import { listRecipes } from '../../../lib/recipes.mjs';
import { readSchemaVersion } from '../../../lib/schema.mjs';
import { readSettings } from '../../../lib/settings.mjs';
import { searchRecipes } from './lib/search.mjs';

const many = { type: 'string', multiple: true };
const OPTIONS = {
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
  override: many,
  'include-retired': { type: 'boolean' },
};
const { values, positionals } = parseArgs({
  args: isDirectExecution(import.meta.url) ? process.argv.slice(2) : [],
  options: OPTIONS,
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
  const ruleset = readRuleset(root);
  const { overrides, problems } = parseOverrides(values.override, ruleset);
  const bad = ['max_minutes', 'limit'].filter((key) => Number.isNaN(facets[key]));
  problems.push(...bad.map((key) => `--${key.replace('_', '-')} must be a whole number`));
  if (problems.length) return { status: 'invalid-input', data_root: root, problems };
  const facetsUsed = Object.fromEntries(Object.entries(facets).filter(([key, v]) => !['limit', 'include_retired'].includes(key) && v !== undefined && !(Array.isArray(v) && !v.length)));
  const dietary = { ...dietaryNotes(ruleset), ...(overrides.length && { overrides }) };
  const gate = (recipe) => gateRecipe(recipe, ruleset, { overrides });
  return { status: 'ok', data_root: root, facets: facetsUsed, total_recipes: recipes.length, ...searchRecipes(recipes, facets, gate), dietary };
}

function show(recipes) {
  const recipe = recipes.find((r) => r.slug === values.slug);
  if (!recipe) return { status: 'not-found', data_root: root, slug: values.slug ?? null };
  const verdict = gateRecipe(recipe, readRuleset(root));
  const conflicts = verdict.excluded ? { dietary_conflicts: verdict.reasons } : {};
  const { units, convert_recipe_units: convert } = readSettings(root).settings;
  const body = convert ? convertRecipeBody(recipe.body, units) : recipe.body;
  return { status: 'ok', data_root: root, slug: recipe.slug, path: recipe.path, frontmatter: recipe.frontmatter, body, ...conflicts };
}

const MODES = { search, show };
export const SCRIPT_CONTRACT = Object.freeze({
  modes: Object.keys(MODES),
  flags: Object.keys(OPTIONS),
  statuses: { ok: ['ok'], errors: ['refused', 'invalid-input', 'not-found'] },
});
const mode = positionals[0];

function runMode() {
  if (readSchemaVersion(root) === null) return { status: 'refused', data_root: root, reason: 'not a Chef data root; run chef-setup first' };
  const { recipes, unreadable } = listRecipes(root);
  const result = MODES[mode](recipes);
  if (unreadable.length) result.unreadable = unreadable;
  return result;
}

// Invocation event: registry codes and counts only (schemas/feedback/).
const FAILURES = { refused: 'not-a-data-root', 'invalid-input': 'invalid-input', 'not-found': 'recipe-not-found' };
function classify(result) {
  if (result.status === 'ok') return { outcome: 'ok', facts: mode === 'search' ? { results: result.recipes.length } : {} };
  return Object.hasOwn(FAILURES, result.status)
    ? { outcome: 'validation-error', error_code: FAILURES[result.status] }
    : { outcome: 'internal-error', error_code: 'unclassified' };
}

if (isDirectExecution(import.meta.url)) {
  const result = Object.hasOwn(MODES, mode)
    ? await chefCapture({ root, skill: 'chef-recipe-search', script: 'recipe-search', operation: mode, classify }, runMode)
    : invalidMode(mode, SCRIPT_CONTRACT.modes, root);
  console.log(JSON.stringify(result));
  if (['refused', 'invalid-input'].includes(result.status)) process.exitCode = 2;
}
