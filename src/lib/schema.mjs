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

function storedVersion(root) {
  try {
    const version = readSchemaVersion(root);
    return version === null || Number.isInteger(version) ? { version } : { problem: `${SCHEMA_FILE} has no integer schema_version` };
  } catch {
    return { problem: `${SCHEMA_FILE} is not valid JSON` };
  }
}

const UPDATE = 'Ask Chef to "update Chef" before changing anything.';

// The one write guard every writing skill calls first. Returns null when writes are safe,
// otherwise { reason, ... } to return as a `refused` result.
export function schemaWriteBlocker(root) {
  const { version, problem } = storedVersion(root);
  if (problem) return { reason: `${problem}; Chef won't write to this data root. ${UPDATE}` };
  if (version === null) return { reason: 'not a Chef data root; run chef-setup init first' };
  if (version === SCHEMA_VERSION) return null;
  const which = version > SCHEMA_VERSION ? 'a newer' : 'an older';
  return {
    reason: `this data root uses ${which} schema (${version}) than this Chef (${SCHEMA_VERSION}). ${UPDATE}`,
    schema_version: version,
    expected_schema_version: SCHEMA_VERSION,
  };
}
