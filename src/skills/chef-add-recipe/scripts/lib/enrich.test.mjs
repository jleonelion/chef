import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fdcClient } from '../../../../lib/fdc.mjs';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { git } from '../../../../lib/git.mjs';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';
import { addRecipe } from './add.mjs';
import { enrichRecipes } from './enrich.mjs';

const samples = JSON.parse(fs.readFileSync(new URL('../../../../lib/__fixtures__/fdc-samples.json', import.meta.url), 'utf8'));
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
  git(root, ['commit', '-qam', 'user edit', '--author', 't <t@example.com>']);
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

test('unknown slugs are reported and nothing is written', async () => {
  const { root } = withRecipe({ title: 'Onion Garlic', servings: 1, ingredients: ['100 g onion'] });
  assert.deepEqual(await enrichRecipes(root, { slugs: ['nope'], fdc: usda, date: '2026-02-01' }), { status: 'not-found', data_root: root, slugs: ['nope'] });
});
