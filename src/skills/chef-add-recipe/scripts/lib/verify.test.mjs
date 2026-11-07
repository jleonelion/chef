import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { git } from '../../../../lib/git.mjs';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';
import { addRecipe } from './add.mjs';
import { verifyRecipe } from './verify.mjs';

function withRecipe(ingredients) {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-verify-')), 'root');
  initDataRoot(root);
  const added = addRecipe(root, { draft: { title: 'Dish', ingredients, steps: ['Cook.'] }, kind: 'text', source: { ext: '.txt', content: 'notes' }, date: '2026-01-15' });
  const page = () => parsePage(fs.readFileSync(path.join(root, added.path), 'utf8')).frontmatter;
  return { root, slug: added.slug, page };
}

test('records a permanent dated verification, in one commit', () => {
  const { root, slug, page } = withRecipe(['1 onion']);
  const result = verifyRecipe(root, { slug, constraints: ['Celiac'], date: '2026-11-07' });
  assert.equal(result.status, 'verified');
  assert.deepEqual(page().verified_by_user, { gluten: '2026-11-07' });
  assert.match(git(root, ['log', '-1', '--format=%s']), /verify dish/);
});

test('verifying again keeps the first date and writes nothing', () => {
  const { root, slug, page } = withRecipe(['1 onion']);
  verifyRecipe(root, { slug, constraints: ['gluten'], date: '2026-11-07' });
  const head = git(root, ['rev-parse', 'HEAD']);
  assert.equal(verifyRecipe(root, { slug, constraints: ['gluten'], date: '2026-12-01' }).status, 'unchanged');
  assert.deepEqual(page().verified_by_user, { gluten: '2026-11-07' });
  assert.equal(git(root, ['rev-parse', 'HEAD']), head);
});

test('refuses when the recipe shows a conflict, even with gluten-free wording', () => {
  const { root, slug, page } = withRecipe(['200 g gluten-free spaghetti']);
  const result = verifyRecipe(root, { slug, constraints: ['gluten'], date: '2026-11-07' });
  assert.equal(result.status, 'refused');
  assert.deepEqual(result.conflicts, [{ constraint: 'gluten', why: 'ingredient-text', detail: '200 g gluten-free spaghetti' }]);
  assert.equal(page().verified_by_user, undefined);
});

test('unknown recipe and missing constraint', () => {
  const { root, slug } = withRecipe(['1 onion']);
  assert.equal(verifyRecipe(root, { slug: 'nope', constraints: ['gluten'], date: '2026-11-07' }).status, 'not-found');
  assert.equal(verifyRecipe(root, { slug, constraints: [], date: '2026-11-07' }).status, 'invalid-input');
});
