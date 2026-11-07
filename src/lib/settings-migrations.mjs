import fs from 'node:fs';
import path from 'node:path';
import { SETTINGS_FILE, SETTINGS_VERSION } from './settings.mjs';

export const SETTINGS_MIGRATIONS = {};

function storedSettings(root) {
  const file = path.join(root, SETTINGS_FILE);
  if (!fs.existsSync(file)) return null;
  let stored;
  try {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${SETTINGS_FILE} is not valid JSON; fix it with chef-setup before updating`);
  }
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored) || !Number.isInteger(stored.settings_version)) {
    throw new Error(`${SETTINGS_FILE} has no integer settings_version; fix it with chef-setup before updating`);
  }
  return stored;
}

export function settingsMigrationPlan(root, { migrations = SETTINGS_MIGRATIONS, target = SETTINGS_VERSION } = {}) {
  const stored = storedSettings(root);
  if (stored === null) return { from: target, to: target, applied: [] };
  const from = stored.settings_version;
  if (from > target) throw new Error(`settings ${from} are newer than this Chef (${target})`);
  const applied = Array.from({ length: target - from }, (_, index) => from + index);
  const missing = applied.find((version) => typeof migrations[version] !== 'function');
  if (missing !== undefined) throw new Error(`no settings migration from version ${missing}`);
  return { from, to: target, applied };
}

export function migrateSettings(root, options = {}) {
  const { migrations = SETTINGS_MIGRATIONS } = options;
  const plan = settingsMigrationPlan(root, options);
  if (plan.applied.length === 0) return plan;
  let stored = storedSettings(root);
  for (const version of plan.applied) {
    stored = migrations[version](stored);
    if (stored?.settings_version !== version + 1) throw new Error(`settings migration ${version} did not stamp version ${version + 1}`);
  }
  fs.writeFileSync(path.join(root, SETTINGS_FILE), `${JSON.stringify(stored, null, 2)}\n`);
  return plan;
}
