import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA_VERSION = 1;
export const SCHEMA_FILE = 'schema-version.json';

// Returns the data root's schema version, or null when it is not a data root.
export function readSchemaVersion(root) {
  const file = path.join(root, SCHEMA_FILE);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).schema_version;
}
