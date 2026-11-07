import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { git } from '../../../../lib/git.mjs';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';
import { retireRecipe } from '../../../chef-recipe-decisions/scripts/lib/lifecycle.mjs';
import { addRecipe } from './add.mjs';

const dataRoot = () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-add-')), 'root');
  initDataRoot(root);
  return root;
};
const draft = { title: 'Weeknight Dal', ingredients: ['1 cup red lentils'], steps: ['Simmer.'] };
const text = { kind: 'text', source: { ext: '.txt', content: 'dal notes' }, date: '2026-01-15' };
const url = { kind: 'url', url: 'https://example.com/dal', source: { ext: '.html', content: '<html></html>' }, date: '2026-01-15' };

test('adds a recipe page and its raw source in one commit', () => {
  const root = dataRoot();
  const result = addRecipe(root, { draft, ...text });
  assert.equal(result.status, 'added');
  assert.equal(result.path, 'knowledge/wiki/recipes/weeknight-dal.md');
  assert.deepEqual(result.raw, ['knowledge/raw/recipes/20260115-weeknight-dal.txt']);
  assert.equal(fs.readFileSync(path.join(root, result.raw[0]), 'utf8'), 'dal notes');
  assert.match(fs.readFileSync(path.join(root, result.path), 'utf8'), /source_raw:\n {2}- knowledge\/raw\/recipes\/20260115-weeknight-dal.txt/);
  assert.equal(git(root, ['log', '-1', '--format=%s']), 'chef-add-recipe: add weeknight-dal');
});

test('a second add of the same title or URL reports the existing recipe', () => {
  const root = dataRoot();
  addRecipe(root, { draft, ...url });
  assert.deepEqual(addRecipe(root, { draft, ...text }), { status: 'exists', data_root: root, slug: 'weeknight-dal', path: 'knowledge/wiki/recipes/weeknight-dal.md', matched: 'slug' });
  const other = addRecipe(root, { draft: { ...draft, title: 'Other' }, ...url, url: 'https://EXAMPLE.com/dal/#notes' });
  assert.equal(other.status, 'exists');
  assert.equal(other.matched, 'source_url');
});

test('adding a retired recipe again reports it as retired', () => {
  const root = dataRoot();
  addRecipe(root, { draft, ...text });
  retireRecipe(root, { slug: 'weeknight-dal', date: '2026-02-01' });
  assert.equal(addRecipe(root, { draft, ...text }).lifecycle, 'retired');
});

test('raw names never reuse an existing file', () => {
  const root = dataRoot();
  fs.mkdirSync(path.join(root, 'knowledge/raw/recipes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'knowledge/raw/recipes/20260115-weeknight-dal.txt'), 'older');
  assert.deepEqual(addRecipe(root, { draft, ...text }).raw, ['knowledge/raw/recipes/20260115-weeknight-dal-2.txt']);
});

test('dry run returns the page and writes nothing', () => {
  const root = dataRoot();
  const result = addRecipe(root, { draft, ...url, dryRun: true });
  assert.equal(result.status, 'would-add');
  assert.equal(result.frontmatter.source_url, 'https://example.com/dal');
  assert.match(result.body, /## Ingredients/);
  assert.equal(fs.existsSync(path.join(root, 'knowledge')), false);
});

test('reports draft problems and refuses outside a data root', () => {
  assert.equal(addRecipe(dataRoot(), { draft: { title: 'x' }, ...text }).status, 'invalid-input');
  assert.equal(addRecipe(dataRoot(), { draft: { ...draft, title: '!!!' }, ...text }).problems[0], 'title: needs at least one letter or digit');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-add-empty-'));
  assert.equal(addRecipe(empty, { draft, ...text }).status, 'refused');
});
