import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDraft, recipePage } from './draft.mjs';

const draft = {
  title: '  Weeknight\nDal ',
  description: 'Red lentils, fast.',
  servings: 4,
  prep_minutes: 10,
  cook_minutes: 25,
  cuisine: 'Indian',
  tags: ['Lentils', 'lentils', ' quick '],
  ingredients: ['1 cup red lentils', '  2 cups\nwater '],
  steps: ['Rinse the lentils.', 'Simmer until soft.'],
};

test('normalizes a valid draft', () => {
  const { recipe, problems } = checkDraft(draft);
  assert.deepEqual(problems, []);
  assert.equal(recipe.title, 'Weeknight Dal');
  assert.equal(recipe.total_minutes, 35);
  assert.equal(recipe.cuisine, 'indian');
  assert.deepEqual(recipe.tags, ['lentils', 'quick']);
  assert.deepEqual(recipe.ingredients, ['1 cup red lentils', '2 cups water']);
});

test('lists every problem with an invalid draft', () => {
  const { problems } = checkDraft({ title: '', servings: -1, prep_minutes: 'ten', ingredients: [], steps: 'stir' });
  assert.deepEqual(problems, [
    'title: required, at most 200 characters',
    'servings: must be a whole number from 1 to 1000',
    'prep_minutes: must be a whole number from 0 to 10080',
    'ingredients: must be a list of 1 to 100 non-empty lines',
    'steps: must be a list of 1 to 100 non-empty lines',
  ]);
  assert.deepEqual(checkDraft(null).problems, ['draft must be a JSON object']);
});

test('builds a v1 recipe page with provenance', () => {
  const { recipe } = checkDraft(draft);
  const page = recipePage(recipe, {
    sourceKind: 'url',
    sourceUrl: 'https://example.com/dal',
    sourceRaw: ['knowledge/raw/recipes/20260115-weeknight-dal.html'],
    date: '2026-01-15',
  });
  assert.deepEqual(page.frontmatter, {
    type: 'recipe',
    title: 'Weeknight Dal',
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 25,
    total_minutes: 35,
    cuisine: 'indian',
    tags: ['lentils', 'quick'],
    source_kind: 'url',
    source_url: 'https://example.com/dal',
    source_raw: ['knowledge/raw/recipes/20260115-weeknight-dal.html'],
    created: '2026-01-15',
    updated: '2026-01-15',
  });
  assert.equal(
    page.body,
    '\n# Weeknight Dal\n\nRed lentils, fast.\n\n## Ingredients\n\n- 1 cup red lentils\n- 2 cups water\n\n## Steps\n\n1. Rinse the lentils.\n2. Simmer until soft.\n',
  );
});

test('omits optional fields the draft did not give', () => {
  const { recipe } = checkDraft({ title: 'Toast', ingredients: ['bread'], steps: ['Toast it.'] });
  const page = recipePage(recipe, { sourceKind: 'text', sourceRaw: ['knowledge/raw/recipes/x.txt'], date: '2026-01-15' });
  assert.deepEqual(Object.keys(page.frontmatter), ['type', 'title', 'source_kind', 'source_raw', 'created', 'updated']);
});
