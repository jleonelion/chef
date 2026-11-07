import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchRecipes } from './search.mjs';

const recipe = (slug, frontmatter, ingredients) => ({
  slug,
  path: `knowledge/wiki/recipes/${slug}.md`,
  frontmatter: { type: 'recipe', title: slug, ...frontmatter },
  body: `## Ingredients\n\n${ingredients.map((i) => `- ${i}`).join('\n')}\n`,
});
const recipes = [
  recipe('pasta', { cuisine: 'italian', tags: ['weeknight'], total_minutes: 20, dietary_flags: ['contains-gluten'] }, ['200 g spaghetti', '2 cloves garlic']),
  recipe('stew', { cuisine: 'mediterranean', total_minutes: 45 }, ['2 cans chickpeas', '1 clove garlic']),
  recipe('salad', { cuisine: 'italian' }, ['1 tomato']),
];
const slugs = (facets) => searchRecipes(recipes, facets).recipes.map((r) => r.slug);

test('no facets returns every recipe', () => {
  assert.deepEqual(slugs({}), ['pasta', 'stew', 'salad']);
});

test('ingredient facets match words at the start of ingredient words', () => {
  assert.deepEqual(slugs({ ingredient: ['garlic'] }), ['pasta', 'stew']);
  assert.deepEqual(slugs({ ingredient: ['chickpea'] }), ['stew']);
  assert.deepEqual(slugs({ ingredient: ['pea'] }), []);
  assert.deepEqual(slugs({ ingredient: ['garlic'], exclude_ingredient: ['spaghetti'] }), ['stew']);
});

test('cuisine, tag and query facets', () => {
  assert.deepEqual(slugs({ cuisine: 'Italian' }), ['pasta', 'salad']);
  assert.deepEqual(slugs({ tag: ['weeknight'] }), ['pasta']);
  assert.deepEqual(slugs({ query: 'tomato italian' }), ['salad']);
});

test('time and flag facets count recipes left out for missing data', () => {
  const byTime = searchRecipes(recipes, { max_minutes: 30 });
  assert.deepEqual(byTime.recipes.map((r) => r.slug), ['pasta']);
  assert.deepEqual(byTime.missing_data, { total_minutes: 1 });
  const byFlag = searchRecipes(recipes, { flag: ['contains-gluten'] });
  assert.deepEqual(byFlag.recipes.map((r) => r.slug), ['pasta']);
  assert.deepEqual(byFlag.missing_data, { dietary_flags: 2 });
});

test('limit caps results but count is the full match count', () => {
  const result = searchRecipes(recipes, { limit: 1 });
  assert.equal(result.count, 3);
  assert.equal(result.recipes.length, 1);
});

test('summaries carry the facet fields and null for unknown flags', () => {
  assert.deepEqual(searchRecipes(recipes, { cuisine: 'mediterranean' }).recipes[0], {
    slug: 'stew',
    title: 'stew',
    path: 'knowledge/wiki/recipes/stew.md',
    cuisine: 'mediterranean',
    tags: [],
    total_minutes: 45,
    servings: null,
    dietary_flags: null,
  });
});

test('a gate splits matches into results and excluded recipes with reasons', () => {
  const gate = (r) => ({ excluded: r.slug === 'pasta', reasons: [{ why: 'flagged' }], overridden: [], avoidances: r.slug === 'stew' ? [{ avoidance: 'garlic' }] : [] });
  const result = searchRecipes(recipes, { ingredient: ['garlic'] }, gate);
  assert.equal(result.count, 1);
  assert.deepEqual(result.recipes.map((r) => r.slug), ['stew']);
  assert.deepEqual(result.recipes[0].avoidances, [{ avoidance: 'garlic' }]);
  assert.deepEqual(result.excluded, [{ slug: 'pasta', title: 'pasta', reasons: [{ why: 'flagged' }] }]);
});

test('retired recipes are left out and counted unless asked for', () => {
  const book = [...recipes, recipe('old', { lifecycle: 'retired' }, ['3 cloves garlic'])];
  const result = searchRecipes(book, { ingredient: ['garlic'] });
  assert.deepEqual(result.recipes.map((r) => r.slug), ['pasta', 'stew']);
  assert.equal(result.retired_hidden, 1);
  const all = searchRecipes(book, { ingredient: ['garlic'], include_retired: true });
  assert.deepEqual(all.recipes.map((r) => [r.slug, r.lifecycle]), [['pasta', undefined], ['stew', undefined], ['old', 'retired']]);
  assert.equal(all.retired_hidden, undefined);
});

test('a hidden retired recipe is never listed as excluded by the gate', () => {
  const book = [...recipes, recipe('old', { lifecycle: 'retired' }, ['3 cloves garlic'])];
  const gate = () => ({ excluded: true, reasons: [{ why: 'flagged' }], overridden: [], avoidances: [] });
  const result = searchRecipes(book, { ingredient: ['garlic'] }, gate);
  assert.deepEqual(result.excluded.map((r) => r.slug), ['pasta', 'stew']);
  assert.equal(result.retired_hidden, 1);
});
