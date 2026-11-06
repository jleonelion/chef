import fs from 'node:fs';
import path from 'node:path';
import { commit, git } from '../../../../lib/git.mjs';
import { readSchemaVersion, SCHEMA_FILE, SCHEMA_VERSION } from '../../../../lib/schema.mjs';
import { SETTINGS_FILE, SETTINGS_VERSION } from '../../../../lib/settings.mjs';

const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value)}\n`);

export function initDataRoot(root) {
  const existing = readSchemaVersion(root);
  if (existing !== null) return { status: 'exists', data_root: root, schema_version: existing };
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
    return { status: 'refused', data_root: root, reason: 'directory is not empty and is not a Chef data root' };
  }

  fs.mkdirSync(root, { recursive: true });
  git(root, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(root, '.gitignore'), `${SETTINGS_FILE}\n`);
  writeJson(path.join(root, SCHEMA_FILE), { schema_version: SCHEMA_VERSION });
  writeJson(path.join(root, SETTINGS_FILE), { settings_version: SETTINGS_VERSION });
  git(root, ['add', '.gitignore', SCHEMA_FILE]);
  commit(root, 'chef-setup: create data root');

  return { status: 'created', data_root: root, schema_version: SCHEMA_VERSION };
}
