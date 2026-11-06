import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ingredientLines, listRecipes, normalizeUrl } from './recipes.mjs';

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/data-root');

test('lists the fixture recipes sorted by slug', () => {
  const { recipes, unreadable } = listRecipes(fixture);
  assert.deepEqual(recipes.map((r) => r.slug), ['chickpea-spinach-stew', 'lemon-garlic-pasta']);
  assert.equal(recipes[1].path, 'knowledge/wiki/recipes/lemon-garlic-pasta.md');
  assert.equal(recipes[1].frontmatter.title, 'Lemon Garlic Pasta');
  assert.deepEqual(unreadable, []);
});

test('a root with no recipes folder has no recipes', () => {
  assert.deepEqual(listRecipes(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-recipes-'))), { recipes: [], unreadable: [] });
});

test('reports pages with broken frontmatter instead of failing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-recipes-'));
  const dir = path.join(root, 'knowledge/wiki/recipes');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'bad.md'), '---\ntitle: [oops\n---\n');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
  const { recipes, unreadable } = listRecipes(root);
  assert.deepEqual(recipes, []);
  assert.equal(unreadable[0].path, 'knowledge/wiki/recipes/bad.md');
});

test('ingredientLines reads the Ingredients list from the body', () => {
  const body = '# T\n\n## Ingredients\n\n- 1 onion\n* 2 eggs\n\n## Steps\n\n- not an ingredient\n';
  assert.deepEqual(ingredientLines(body), ['1 onion', '2 eggs']);
  assert.deepEqual(ingredientLines('# No list\n'), []);
});

test('normalizeUrl ignores fragments, trailing slashes and host case', () => {
  assert.equal(normalizeUrl('https://Example.com/a/#top'), normalizeUrl('https://example.com/a'));
  assert.equal(normalizeUrl('not a url'), null);
});
