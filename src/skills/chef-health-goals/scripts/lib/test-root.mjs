// Test helpers: a fresh data root and meal-log entries. Not an entry point (lives under lib/).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../../../../lib/git.mjs';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';

export function dataRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-health-')), 'root');
  initDataRoot(root);
  return root;
}

export function writeFile(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export const writeMealLog = (root, entries) => writeFile(root, 'data/meal-log/log.json', `${JSON.stringify({ entries }, null, 2)}\n`);

export function entry(date, slot, nutrition) {
  return { id: `${date}-${slot}-food`, date, slot, recipe: null, food: 'food', servings: 1, cooked: false, nutrition, logged_at: `${date}T12:00:00Z` };
}

export const commits = (root) => Number(git(root, ['rev-list', '--count', 'HEAD']));
export const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
export const exists = (root, rel) => fs.existsSync(path.join(root, rel));
