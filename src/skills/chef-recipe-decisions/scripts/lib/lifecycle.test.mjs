import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { writeWiki } from '../../../../lib/wiki.mjs';
import { retireRecipe, restoreRecipe } from './lifecycle.mjs';
import { commits, dataRoot } from './test-root.mjs';

const slug = 'weeknight-dal';
const file = `knowledge/wiki/recipes/${slug}.md`;
const read = (root) => parsePage(fs.readFileSync(path.join(root, file), 'utf8'));
const withRecipe = () => {
  const root = dataRoot();
  const frontmatter = { type: 'recipe', title: 'Weeknight Dal', source_kind: 'text', source_raw: ['knowledge/raw/recipes/x.txt'], created: '2026-01-01', updated: '2026-01-01' };
  writeWiki(root, { pages: [{ slug, frontmatter, body: '\n# Weeknight Dal\n' }], message: 'seed' });
  return root;
};

test('retiring keeps the page and its provenance and marks it retired', () => {
  const root = withRecipe();
  assert.equal(retireRecipe(root, { slug, reason: 'too often', date: '2026-02-01' }).status, 'retired');
  const { frontmatter, body } = read(root);
  assert.equal(frontmatter.lifecycle, 'retired');
  assert.equal(frontmatter.retired, '2026-02-01');
  assert.equal(frontmatter.retired_reason, 'too often');
  assert.deepEqual(frontmatter.source_raw, ['knowledge/raw/recipes/x.txt']);
  assert.equal(body, '\n# Weeknight Dal\n');
});

test('restoring reverses retirement; repeats change nothing', () => {
  const root = withRecipe();
  retireRecipe(root, { slug, date: '2026-02-01' });
  assert.equal(retireRecipe(root, { slug, date: '2026-02-02' }).status, 'unchanged');
  assert.equal(restoreRecipe(root, { slug, date: '2026-02-03' }).status, 'restored');
  const { frontmatter } = read(root);
  assert.equal(frontmatter.lifecycle, 'active');
  assert.equal(frontmatter.retired, undefined);
  assert.equal(frontmatter.updated, '2026-02-03');
  const before = commits(root);
  assert.equal(restoreRecipe(root, { slug, date: '2026-02-04' }).status, 'unchanged');
  assert.equal(commits(root), before);
});

test('an unknown recipe is not found', () => {
  assert.equal(retireRecipe(dataRoot(), { slug: 'nope', date: '2026-02-01' }).status, 'not-found');
});
