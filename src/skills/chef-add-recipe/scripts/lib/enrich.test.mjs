import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fdcClient } from '../../../../lib/fdc.mjs';
import { parsePage, serializePage } from '../../../../lib/frontmatter.mjs';
import { commit, git } from '../../../../lib/git.mjs';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';
import { addRecipe } from './add.mjs';
import { enrichRecipes } from './enrich.mjs';

const samples = JSON.parse(fs.readFileSync(new URL('../../../../../fixtures/usda/fdc-samples.json', import.meta.url), 'utf8'));
const usda = fdcClient({
  credential: { ok: true, value: 'k', placement: { in: 'query', name: 'api_key' } },
  fetchImpl: async (href) => {
    const url = new URL(href);
    if (url.pathname.endsWith('/foods/search')) return Response.json(samples.search[url.searchParams.get('query')] ?? { foods: [] });
    const food = samples.food[url.pathname.split('/').pop()];
    return food ? Response.json(food) : new Response('{}', { status: 404 });
  },
});
const noKey = fdcClient({ credential: { ok: false, reason: 'not-connected' } });
const source = { kind: 'text', source: { ext: '.txt', content: 'notes' }, date: '2026-01-15' };

function withRecipe(draft) {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-enrich-')), 'root');
  initDataRoot(root);
  const added = addRecipe(root, { draft: { steps: ['Cook.'], ...draft }, ...source });
  const page = () => parsePage(fs.readFileSync(path.join(root, added.path), 'utf8')).frontmatter;
  return { root, slug: added.slug, page };
}

test('sets dietary flags and USDA nutrition on the page, in one commit', async () => {
  const { root, slug, page } = withRecipe({ title: 'Garlic Onions', servings: 1, ingredients: ['100 g onion', '2 cloves garlic', '1 tbsp butter'] });
  // butter has no recorded USDA answer here, so nutrition is incomplete but flags are set.
  const result = await enrichRecipes(root, { slugs: [slug], fdc: usda, date: '2026-02-01' });
  assert.equal(result.status, 'enriched');
  assert.deepEqual(result.recipes[0], { slug, dietary_flags: ['contains-dairy'], nutrition: 'incomplete', missing: ['1 tbsp butter: no matching USDA food'] });
  assert.deepEqual(page().dietary_flags, ['contains-dairy']);
  assert.equal(page().nutrition_status, 'incomplete');
  assert.deepEqual(page().nutrition_missing, ['1 tbsp butter: no matching USDA food']);
  assert.equal(page().nutrition_per_serving, undefined);
  assert.equal(page().updated, '2026-02-01');
  assert.equal(git(root, ['log', '-1', '--format=%s']), `chef-add-recipe: enrich ${slug}`);
});

test('complete nutrition is written per serving with its USDA sources', async () => {
  const { root, slug, page } = withRecipe({ title: 'Onion Garlic', servings: 1, ingredients: ['100 g onion', '2 cloves garlic'] });
  await enrichRecipes(root, { slugs: [slug], fdc: usda, date: '2026-02-01' });
  assert.equal(page().nutrition_status, 'complete');
  assert.equal(page().nutrition_per_serving.calories, 49);
  assert.equal(page().nutrition_sources.length, 2);
  assert.deepEqual(page().dietary_flags, []);
});

test('without a USDA key nutrition is "not computed" with a chef-setup hint, never numbers', async () => {
  const { root, slug, page } = withRecipe({ title: 'Plain Pasta', servings: 2, ingredients: ['200 g spaghetti'] });
  const result = await enrichRecipes(root, { slugs: [slug], fdc: noKey, date: '2026-02-01' });
  assert.deepEqual(result.recipes[0], { slug, dietary_flags: ['contains-gluten', 'contains-wheat'], nutrition: 'not-computed', reason: 'not-connected' });
  assert.match(result.hint, /chef-setup/);
  assert.equal(page().nutrition_status, 'not-computed');
  assert.equal(page().nutrition_per_serving, undefined);
});

test('re-enriching never drops a flag and keeps earlier nutrition when USDA is unavailable', async () => {
  const { root, slug, page } = withRecipe({ title: 'Onion Garlic', servings: 1, ingredients: ['100 g onion', '2 cloves garlic'] });
  await enrichRecipes(root, { slugs: [slug], fdc: usda, date: '2026-02-01' });
  const file = path.join(root, 'knowledge/wiki/recipes/onion-garlic.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('dietary_flags: []', 'dietary_flags: [contains-sesame]'));
  git(root, ['add', '-A']);
  commit(root, 'user edit');
  await enrichRecipes(root, { slugs: [slug], fdc: noKey, date: '2026-03-01' });
  assert.deepEqual(page().dietary_flags, ['contains-sesame']);
  assert.equal(page().nutrition_status, 'complete');
  assert.equal(page().nutrition_per_serving.calories, 49);
});

test('unenriched picks recipes without flags or complete nutrition; nothing to do writes nothing', async () => {
  const { root, slug } = withRecipe({ title: 'Onion Garlic', servings: 1, ingredients: ['100 g onion', '2 cloves garlic'] });
  assert.deepEqual((await enrichRecipes(root, { unenriched: true, fdc: usda, date: '2026-02-01' })).recipes.map((r) => r.slug), [slug]);
  const head = git(root, ['rev-parse', 'HEAD']);
  assert.deepEqual(await enrichRecipes(root, { unenriched: true, fdc: usda, date: '2026-02-02' }), { status: 'unchanged', data_root: root, recipes: [] });
  assert.equal(git(root, ['rev-parse', 'HEAD']), head);
});

test('a page whose fields are only in a different order is unchanged', async () => {
  const { root, slug } = withRecipe({ title: 'Onion Garlic', servings: 1, ingredients: ['100 g onion', '2 cloves garlic'] });
  await enrichRecipes(root, { slugs: [slug], fdc: usda, date: '2026-02-01' });
  const file = path.join(root, 'knowledge/wiki/recipes/onion-garlic.md');
  const { frontmatter, body } = parsePage(fs.readFileSync(file, 'utf8'));
  const { dietary_flags, ...rest } = frontmatter;
  fs.writeFileSync(file, serializePage({ dietary_flags, ...rest }, body));
  git(root, ['add', '-A']);
  commit(root, 'reorder');
  assert.equal((await enrichRecipes(root, { slugs: [slug], fdc: usda, date: '2026-03-01' })).status, 'unchanged');
});

test('unknown slugs are reported and nothing is written', async () => {
  const { root } = withRecipe({ title: 'Onion Garlic', servings: 1, ingredients: ['100 g onion'] });
  assert.deepEqual(await enrichRecipes(root, { slugs: ['nope'], fdc: usda, date: '2026-02-01' }), { status: 'not-found', data_root: root, slugs: ['nope'] });
});

function addTo(root, draft) {
  return addRecipe(root, { draft: { steps: ['Cook.'], ...draft }, ...source });
}
const frontmatterOf = (root, slug) => parsePage(fs.readFileSync(path.join(root, `knowledge/wiki/recipes/${slug}.md`), 'utf8')).frontmatter;

test('a recipe that links a sub-recipe is enriched after it, with its scaled nutrition and its flags', async () => {
  // "angel-hair-supper" lists before "egg-topping", so this only passes if the sub-recipe goes first.
  const { root } = withRecipe({ title: 'Angel Hair Supper', servings: 2, ingredients: ['200 g spaghetti', '2 servings [[egg-topping]]'] });
  addTo(root, { title: 'Egg Topping', servings: 1, ingredients: ['2 large eggs'] });
  const result = await enrichRecipes(root, { unenriched: true, fdc: usda, date: '2026-02-01' });
  assert.deepEqual(result.recipes.map((r) => [r.slug, r.nutrition]), [['egg-topping', 'complete'], ['angel-hair-supper', 'complete']]);
  const parent = frontmatterOf(root, 'angel-hair-supper');
  // (742 kcal spaghetti + 2 x 143 kcal topping) / 2 servings.
  assert.equal(parent.nutrition_per_serving.calories, 514);
  assert.deepEqual(parent.dietary_flags, ['contains-egg', 'contains-gluten', 'contains-wheat']);
  assert.ok(parent.nutrition_sources.includes('2 servings [[egg-topping]]: sub-recipe egg-topping, 2 servings'));
});

test('re-enriching a sub-recipe re-enriches the recipes that use it', async () => {
  const { root } = withRecipe({ title: 'Angel Hair Supper', servings: 2, ingredients: ['200 g spaghetti', '2 servings [[egg-topping]]'] });
  addTo(root, { title: 'Egg Topping', servings: 1, ingredients: ['2 large eggs'] });
  await enrichRecipes(root, { unenriched: true, fdc: usda, date: '2026-02-01' });
  const file = path.join(root, 'knowledge/wiki/recipes/egg-topping.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- 2 large eggs', '- 4 large eggs'));
  git(root, ['add', '-A']);
  commit(root, 'user edit');
  const result = await enrichRecipes(root, { slugs: ['egg-topping'], fdc: usda, date: '2026-03-01' });
  assert.deepEqual(result.recipes.map((r) => r.slug), ['egg-topping', 'angel-hair-supper']);
  assert.equal(frontmatterOf(root, 'angel-hair-supper').nutrition_per_serving.calories, 657);
});

test('sub-recipe cycles are refused and deep nesting is capped, each with a reason', async () => {
  const { root } = withRecipe({ title: 'Cycle A', servings: 1, ingredients: ['1 serving [[cycle-b]]'] });
  addTo(root, { title: 'Cycle B', servings: 1, ingredients: ['1 serving [[cycle-a]]', '100 g onion'] });
  for (const [title, next] of [['Nest 1', 'nest-2'], ['Nest 2', 'nest-3'], ['Nest 3', 'nest-4'], ['Nest 4', 'nest-5']]) addTo(root, { title, servings: 1, ingredients: [`1 serving [[${next}]]`] });
  addTo(root, { title: 'Nest 5', servings: 1, ingredients: ['100 g onion'] });
  const result = await enrichRecipes(root, { unenriched: true, fdc: usda, date: '2026-02-01' });
  const bySlug = Object.fromEntries(result.recipes.map((r) => [r.slug, r]));
  const cycle = 'sub-recipe cycle: cycle-a -> cycle-b -> cycle-a';
  assert.deepEqual([bySlug['cycle-a'].missing, bySlug['cycle-b'].missing], [[cycle], [cycle]]);
  assert.deepEqual(bySlug['nest-1'].missing, ['sub-recipes nest more than 3 levels deep']);
  assert.equal(bySlug['nest-2'].nutrition, 'complete');
  assert.equal(frontmatterOf(root, 'nest-2').nutrition_per_serving.calories, 40);
});
