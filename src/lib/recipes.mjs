// Read-only access to recipe pages. Writes go through wiki.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { parsePage } from './frontmatter.mjs';
import { WIKI_DIR, WIKI_FOLDERS } from './wiki.mjs';

export const RECIPES_DIR = `${WIKI_DIR}/${WIKI_FOLDERS.recipe}`;

export function listRecipes(root) {
  const dir = path.join(root, RECIPES_DIR);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
  const recipes = [];
  const unreadable = [];
  for (const file of files) {
    const rel = `${RECIPES_DIR}/${file}`;
    try {
      const { frontmatter, body } = parsePage(fs.readFileSync(path.join(root, rel), 'utf8'));
      recipes.push({ slug: file.slice(0, -3), path: rel, frontmatter, body });
    } catch (error) {
      unreadable.push({ path: rel, reason: error.message });
    }
  }
  return { recipes, unreadable };
}

// Bulleted lines under the body's "## Ingredients" heading.
export function ingredientLines(body) {
  const section = body.split(/^## /m).find((part) => /^ingredients\s*$/im.test(part.split('\n')[0]));
  if (!section) return [];
  return section.split('\n').map((line) => line.match(/^\s*[-*]\s+(.+)$/)?.[1].trim()).filter(Boolean);
}

export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function today(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
