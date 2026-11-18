// Single reader for eval datasets. `target` is a .json file (one array of rows) or a directory of
// them (tier1/cases/); rows are concatenated in file-name order. A duplicate id across files throws.
import fs from 'node:fs';
import path from 'node:path';

export const repoRoot = path.resolve(import.meta.dirname, '..', '..');

export function loadCases(target) {
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((name) => name.endsWith('.json')).sort().map((name) => path.join(target, name))
    : [target];
  const owner = new Map();
  const rows = [];
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data)) throw new Error(`${path.relative(repoRoot, file)}: dataset must be an array`);
    for (const row of data) {
      if (owner.has(row?.id)) throw new Error(`duplicate id ${row.id} in ${path.relative(repoRoot, owner.get(row.id))} and ${path.relative(repoRoot, file)}`);
      owner.set(row?.id, file);
      rows.push(row);
    }
  }
  return rows;
}

// seedFile / turnFile paths are repo-relative and live under evals/*/inputs/ (checked by evals:lint).
export const readInput = (relPath) => fs.readFileSync(path.join(repoRoot, relPath));
