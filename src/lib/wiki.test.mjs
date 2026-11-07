import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { initDataRoot } from '../skills/chef-setup/scripts/lib/init-data-root.mjs';
import { parsePage } from './frontmatter.mjs';
import { git } from './git.mjs';
import { slugify, writeWiki } from './wiki.mjs';

const dataRoot = () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-wiki-')), 'root');
  initDataRoot(root);
  return root;
};
const recipe = (slug) => ({ slug, frontmatter: { type: 'recipe', title: 'Toast' }, body: '# Toast\n' });

test('slugify makes a filename-safe slug', () => {
  assert.equal(slugify('  Crème Brûlée: The "Best" One!  '), 'creme-brulee-the-best-one');
  assert.equal(slugify('../../etc/passwd'), 'etc-passwd');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify('a'.repeat(100)).length, 80);
});

test('writes a page into its type folder and raw files, in one commit', () => {
  const root = dataRoot();
  const result = writeWiki(root, {
    pages: [recipe('toast')],
    raw: [{ path: 'knowledge/raw/recipes/20260115-toast.txt', content: 'toast source' }],
    message: 'chef-add-recipe: add toast',
  });
  assert.equal(result.status, 'written');
  assert.deepEqual(result.pages, ['knowledge/wiki/recipes/toast.md']);
  assert.deepEqual(result.raw, ['knowledge/raw/recipes/20260115-toast.txt']);
  const page = parsePage(fs.readFileSync(path.join(root, 'knowledge/wiki/recipes/toast.md'), 'utf8'));
  assert.deepEqual(page.frontmatter, { type: 'recipe', title: 'Toast' });
  assert.equal(git(root, ['log', '-1', '--format=%s']), 'chef-add-recipe: add toast');
  assert.equal(git(root, ['status', '--porcelain']), '');
});

test('refuses to replace an existing raw file and writes nothing', () => {
  const root = dataRoot();
  const raw = [{ path: 'knowledge/raw/recipes/x.txt', content: 'first' }];
  writeWiki(root, { raw, message: 'first' });
  const result = writeWiki(root, { pages: [recipe('toast')], raw: [{ ...raw[0], content: 'second' }], message: 'second' });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /append-only/);
  assert.equal(fs.readFileSync(path.join(root, raw[0].path), 'utf8'), 'first');
  assert.equal(fs.existsSync(path.join(root, 'knowledge/wiki/recipes/toast.md')), false);
});

test('rejects raw paths outside knowledge/raw and bad slugs or types', () => {
  const root = dataRoot();
  assert.throws(() => writeWiki(root, { raw: [{ path: 'knowledge/raw/../../x', content: '' }], message: 'm' }), /knowledge\/raw/);
  assert.throws(() => writeWiki(root, { pages: [recipe('../x')], message: 'm' }), /slug/);
  assert.throws(() => writeWiki(root, { pages: [{ ...recipe('x'), frontmatter: { type: 'nope' } }], message: 'm' }), /type/);
});

test('refuses to write outside a data root or on a schema mismatch', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-wiki-empty-'));
  assert.match(writeWiki(empty, { pages: [recipe('x')], message: 'm' }).reason, /chef-setup/);
  const root = dataRoot();
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":2}\n');
  const result = writeWiki(root, { pages: [recipe('x')], message: 'm' });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /update Chef/);
});
