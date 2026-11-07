// The single settings writer ("change settings" mode). Keeps unknown keys, stores only
// user-set values, and makes sure settings.json stays out of data-root git.
import fs from 'node:fs';
import path from 'node:path';
import { git } from '../../../../lib/git.mjs';
import { schemaWriteBlocker } from '../../../../lib/schema.mjs';
import { readSettings, SETTING_KEYS, SETTINGS_FILE, SETTINGS_VERSION, validateSettings } from '../../../../lib/settings.mjs';

const IGNORE_LINES = new Set([SETTINGS_FILE, `/${SETTINGS_FILE}`]);
const SIDE_EFFECTS = { household_recipients: 'recreate-delivery-tasks' };

function isTracked(root) {
  if (!fs.existsSync(path.join(root, '.git'))) return false;
  try {
    git(root, ['ls-files', '--error-unmatch', SETTINGS_FILE]);
    return true;
  } catch {
    return false;
  }
}

function ensureIgnored(root) {
  const file = path.join(root, '.gitignore');
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (content.split(/\r?\n/).some((line) => IGNORE_LINES.has(line.trim()))) return;
  const separator = content === '' || content.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(file, `${content}${separator}${SETTINGS_FILE}\n`);
}

function applyChanges(stored, changes) {
  const next = { ...stored, settings_version: SETTINGS_VERSION };
  for (const key of SETTING_KEYS.filter((k) => Object.hasOwn(changes, k))) {
    const value = changes[key];
    if (value === null) delete next[key];
    else next[key] = Array.isArray(value) ? [...new Set(value)] : value;
  }
  return next;
}

const definedChanges = (changes) => Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== null));

function blocker(root, current, rewrite) {
  const schemaBlocked = schemaWriteBlocker(root);
  if (schemaBlocked) return schemaBlocked;
  if (current.status !== 'ok' && current.status !== 'missing' && !rewrite) {
    return { reason: current.warning, content: current.content };
  }
  if (isTracked(root)) return { reason: `${SETTINGS_FILE} is tracked by data-root git; untrack it before saving settings` };
  return null;
}

export function writeSettings(root, changes, { locale, rewrite = false } = {}) {
  const problems = validateSettings(definedChanges(changes));
  if (problems.length) return { status: 'invalid-input', data_root: root, problems };

  const current = readSettings(root, { locale });
  const blocked = blocker(root, current, rewrite);
  if (blocked) return { status: 'refused', data_root: root, ...blocked };

  ensureIgnored(root);
  const next = applyChanges(current.stored ?? {}, changes);
  fs.writeFileSync(path.join(root, SETTINGS_FILE), `${JSON.stringify(next, null, 2)}\n`);

  const saved = readSettings(root, { locale });
  const changed = SETTING_KEYS.filter((key) => JSON.stringify(current.settings[key]) !== JSON.stringify(saved.settings[key]));
  const side_effects = changed.map((key) => SIDE_EFFECTS[key]).filter(Boolean);
  return { status: 'saved', data_root: root, settings: saved.settings, changed, side_effects };
}
