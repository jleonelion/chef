// Per-user settings: <data root>/settings.json, git-ignored. The file holds only user-set
// values plus settings_version; defaults live here. Skills read; only chef-setup writes.
import fs from 'node:fs';
import path from 'node:path';
import { muse } from '../runtime/muse.mjs';

export const SETTINGS_FILE = 'settings.json';
export const SETTINGS_VERSION = 1;
export const SETTING_KEYS = ['household_recipients', 'trusted_receipt_senders', 'units', 'calendar'];

const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function unitsForLocale(locale = '') {
  const region = locale.split(/[-_.@]/)[1]?.toUpperCase();
  return IMPERIAL_REGIONS.has(region) ? 'us' : 'metric';
}

export function defaultSettings({ locale = muse.locale() } = {}) {
  return { household_recipients: [], trusted_receipt_senders: [], units: unitsForLocale(locale), calendar: null };
}

function emailListProblem(key, value) {
  if (!Array.isArray(value)) return `${key}: must be a list of email addresses`;
  const bad = value.find((entry) => typeof entry !== 'string' || !EMAIL.test(entry));
  return bad === undefined ? null : `${key}: ${JSON.stringify(bad)} is not an email address`;
}

const CHECKS = {
  household_recipients: (value) => emailListProblem('household_recipients', value),
  trusted_receipt_senders: (value) => emailListProblem('trusted_receipt_senders', value),
  units: (value) => (value === 'us' || value === 'metric' ? null : 'units: must be "us" or "metric"'),
  calendar: (value) => (value === null || (typeof value === 'string' && value.trim()) ? null : 'calendar: must be a calendar name or null'),
};

// Problems with the v1 keys present in `values`; other keys are not checked.
export function validateSettings(values) {
  return SETTING_KEYS.filter((key) => Object.hasOwn(values, key))
    .map((key) => CHECKS[key](values[key]))
    .filter(Boolean);
}

const warn = (reason) => `settings.json can't be used (${reason}), so Chef is using default settings. Run chef-setup to fix it.`;

function parse(content) {
  try {
    const value = JSON.parse(content);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function classify(stored) {
  if (!stored) return { status: 'invalid', reason: 'not a JSON object' };
  const version = stored.settings_version;
  if (Number.isInteger(version) && version > SETTINGS_VERSION) {
    return { status: 'unknown-version', reason: `written by a newer Chef: version ${version}` };
  }
  if (version !== SETTINGS_VERSION) return { status: 'invalid', reason: 'missing or bad settings_version' };
  const problems = validateSettings(stored);
  return problems.length ? { status: 'invalid', reason: problems.join('; ') } : { status: 'ok' };
}

// Missing file -> defaults. Invalid file or unknown version -> defaults + one warning;
// `content` carries the raw file so chef-setup can show it before offering a rewrite.
export function readSettings(root, { locale } = {}) {
  const defaults = defaultSettings({ locale });
  const file = path.join(root, SETTINGS_FILE);
  if (!fs.existsSync(file)) return { status: 'missing', settings: defaults };
  const content = fs.readFileSync(file, 'utf8');
  const stored = parse(content);
  const { status, reason } = classify(stored);
  if (status !== 'ok') return { status, settings: defaults, warning: warn(reason), content };
  const known = Object.fromEntries(SETTING_KEYS.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]]));
  return { status, settings: { ...defaults, ...known }, stored };
}
