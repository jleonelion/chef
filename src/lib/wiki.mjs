// The one write path into a data root: wiki pages by type, append-only raw files, one git
// commit per call. Refuses when the root's schema version is not the one Chef was built for.
import fs from 'node:fs';
import path from 'node:path';
import { serializePage } from './frontmatter.mjs';
import { commit, git } from './git.mjs';
import { readSchemaVersion, SCHEMA_VERSION } from './schema.mjs';

export const WIKI_DIR = 'knowledge/wiki';
export const RAW_DIR = 'knowledge/raw';
export const WIKI_FOLDERS = { recipe: 'recipes', 'household-profile': 'household' };
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

function rawPath(relative) {
  const normalized = path.posix.normalize(relative);
  if (!normalized.startsWith(`${RAW_DIR}/`)) throw new Error(`raw files must live under ${RAW_DIR}/: ${relative}`);
  return normalized;
}

// null when writes are allowed, else a refusal to return to the caller.
export function writeRefusal(root) {
  const version = readSchemaVersion(root);
  const refuse = (reason) => ({ status: 'refused', data_root: root, reason });
  if (version === null) return refuse('not a Chef data root; run chef-setup first');
  if (version !== SCHEMA_VERSION) {
    return refuse(`data root is at schema version ${version} but this Chef expects ${SCHEMA_VERSION}; run "update Chef" first`);
  }
  if (!fs.existsSync(path.join(root, '.git'))) return refuse('data root has no git history; run chef-setup to repair it');
  return null;
}

export function writeWiki(root, { pages = [], raw = [], message }) {
  const pageFiles = pages.map((page) => ({ path: wikiPath(page.frontmatter.type, page.slug), content: serializePage(page.frontmatter, page.body) }));
  const rawFiles = raw.map((file) => ({ path: rawPath(file.path), content: file.content }));
  const refusal = writeRefusal(root);
  if (refusal) return refusal;
  const taken = rawFiles.find((file) => fs.existsSync(path.join(root, file.path)));
  if (taken) return { status: 'refused', data_root: root, reason: `raw files are append-only and ${taken.path} already exists` };

  const files = [...rawFiles, ...pageFiles];
  for (const file of files) {
    const abs = path.join(root, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content);
  }
  git(root, ['add', '--', ...files.map((file) => file.path)]);
  commit(root, message);
  return { status: 'written', data_root: root, pages: pageFiles.map((f) => f.path), raw: rawFiles.map((f) => f.path) };
}
