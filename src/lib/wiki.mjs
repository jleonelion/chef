// The one write path into a data root: wiki pages by type, append-only raw files and
// operational store files under data/, one git commit per call. Refuses through the shared schema write guard.
import fs from 'node:fs';
import path from 'node:path';
import { serializePage } from './frontmatter.mjs';
import { commit, git } from './git.mjs';
import { schemaWriteBlocker } from './schema.mjs';

export const WIKI_DIR = 'knowledge/wiki';
export const RAW_DIR = 'knowledge/raw';
export const DATA_DIR = 'data';
export const WIKI_FOLDERS = { recipe: 'recipes', 'household-profile': 'household', 'inventory-rollup': 'household' };
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
}

export function wikiPath(type, slug) {
  if (!Object.hasOwn(WIKI_FOLDERS, type)) throw new Error(`unknown wiki page type: ${type}`);
  if (!SLUG.test(slug)) throw new Error(`invalid slug: ${JSON.stringify(slug)}`);
  return `${WIKI_DIR}/${WIKI_FOLDERS[type]}/${slug}.md`;
}

function pathUnder(dir, relative, kind) {
  const normalized = path.posix.normalize(relative);
  if (!normalized.startsWith(`${dir}/`)) throw new Error(`${kind} files must live under ${dir}/: ${relative}`);
  return normalized;
}

// null when writes are allowed, else a refusal to return to the caller.
export function writeRefusal(root) {
  const blocked = schemaWriteBlocker(root);
  if (blocked) return { status: 'refused', data_root: root, ...blocked };
  if (!fs.existsSync(path.join(root, '.git'))) return { status: 'refused', data_root: root, reason: 'data root has no git history; run chef-setup to repair it' };
  return null;
}

export function writeWiki(root, { pages = [], raw = [], data = [], message }) {
  const pageFiles = pages.map((page) => ({ path: wikiPath(page.frontmatter.type, page.slug), content: serializePage(page.frontmatter, page.body) }));
  const rawFiles = raw.map((file) => ({ path: pathUnder(RAW_DIR, file.path, 'raw'), content: file.content }));
  const dataFiles = data.map((file) => ({ path: pathUnder(DATA_DIR, file.path, 'data'), content: file.content }));
  const refusal = writeRefusal(root);
  if (refusal) return refusal;
  const taken = rawFiles.find((file) => fs.existsSync(path.join(root, file.path)));
  if (taken) return { status: 'refused', data_root: root, reason: `raw files are append-only and ${taken.path} already exists` };

  const files = [...rawFiles, ...dataFiles, ...pageFiles];
  for (const file of files) {
    const abs = path.join(root, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content);
  }
  git(root, ['add', '--', ...files.map((file) => file.path)]);
  commit(root, message);
  return { status: 'written', data_root: root, pages: pageFiles.map((f) => f.path), raw: rawFiles.map((f) => f.path), data: dataFiles.map((f) => f.path) };
}
