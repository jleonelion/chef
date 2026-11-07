// Test helpers: a fresh data root and a sample draft. Not an entry point (lives under lib/).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../../../../lib/git.mjs';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';

export function dataRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-decisions-')), 'root');
  initDataRoot(root);
  return root;
}

export const draft = { title: 'Mushroom Barley Soup', servings: 4, ingredients: ['200 g mushrooms', '100 g pearl barley'], steps: ['Simmer.'] };
export const commits = (root) => Number(git(root, ['rev-list', '--count', 'HEAD']));
export const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
export const exists = (root, rel) => fs.existsSync(path.join(root, rel));
