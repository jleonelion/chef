// Add one recipe: check the draft, stop on a duplicate, then write the page and its raw
// source through the single wiki write path.
import fs from 'node:fs';
import path from 'node:path';
import { listRecipes, normalizeUrl } from '../../../../lib/recipes.mjs';
import { RAW_DIR, slugify, wikiPath, writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';
import { checkDraft, recipePage } from './draft.mjs';

const RAW_RECIPES = `${RAW_DIR}/recipes`;

function findExisting(root, slug, url) {
  const wanted = url && normalizeUrl(url);
  for (const recipe of listRecipes(root).recipes) {
    if (recipe.slug === slug) return { recipe, matched: 'slug' };
    if (wanted && normalizeUrl(recipe.frontmatter.source_url ?? '') === wanted) return { recipe, matched: 'source_url' };
  }
  return null;
}

export function rawName(root, stem, ext) {
  for (let n = 1; ; n += 1) {
    const rel = `${RAW_RECIPES}/${stem}${n === 1 ? '' : `-${n}`}${ext}`;
    if (!fs.existsSync(path.join(root, rel))) return rel;
  }
}

export function addRecipe(root, { draft, kind, url, source, date, dryRun = false }) {
  const { recipe, problems } = checkDraft(draft);
  if (problems.length) return { status: 'invalid-input', data_root: root, problems };
  const slug = slugify(recipe.title);
  if (!slug) return { status: 'invalid-input', data_root: root, problems: ['title: needs at least one letter or digit'] };
  const refusal = writeRefusal(root);
  if (refusal) return refusal;

  const existing = findExisting(root, slug, url);
  if (existing) return { status: 'exists', data_root: root, slug: existing.recipe.slug, path: existing.recipe.path, matched: existing.matched };

  const raw = rawName(root, `${date.replaceAll('-', '')}-${slug}`, source.ext);
  const page = recipePage(recipe, { sourceKind: kind, sourceUrl: url, sourceRaw: [raw], date });
  const pagePath = wikiPath('recipe', slug);
  if (dryRun) return { status: 'would-add', data_root: root, slug, path: pagePath, raw: [raw], ...page };

  const written = writeWiki(root, { pages: [{ slug, ...page }], raw: [{ path: raw, content: source.content }], message: `chef-add-recipe: add ${slug}` });
  if (written.status !== 'written') return written;
  return { status: 'added', data_root: root, slug, title: recipe.title, path: pagePath, raw: written.raw };
}
