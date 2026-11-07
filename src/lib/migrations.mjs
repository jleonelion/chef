// Forward schema migrations. MIGRATIONS[n] upgrades a data root from schema n to n + 1 in
// place. A schema bump adds its step here plus a frozen fixtures/schema-v<n>/ copy.
import fs from 'node:fs';
import path from 'node:path';
import { readSchemaVersion, SCHEMA_FILE, SCHEMA_VERSION } from './schema.mjs';

export const MIGRATIONS = {};

const stamp = (root, version) => fs.writeFileSync(path.join(root, SCHEMA_FILE), `${JSON.stringify({ schema_version: version })}\n`);

export function migrate(root, { migrations = MIGRATIONS, target = SCHEMA_VERSION } = {}) {
  const from = readSchemaVersion(root);
  if (!Number.isInteger(from)) throw new Error(`${root} has no integer schema version`);
  if (from > target) throw new Error(`schema ${from} is newer than this Chef (${target})`);
  const steps = [];
  for (let version = from; version < target; version += 1) steps.push(version);
  const missing = steps.find((version) => typeof migrations[version] !== 'function');
  if (missing !== undefined) throw new Error(`no migration from schema ${missing}`);
  for (const version of steps) {
    migrations[version](root);
    stamp(root, version + 1);
  }
  return { from, to: target, applied: steps };
}
