// Post-error report offers, per error: one skill's error code (chef-food-inventory/unclassified).
// At most one offer per error per hour, and none for an error the user declined ("no thanks").
// State lives in <data root>/diagnostics/offers.json, git-ignored with the
// trace; an unreadable file counts as empty.
import fs from 'node:fs';
import path from 'node:path';
import { DIAGNOSTICS_DIR, ensureDiagnosticsDir, writePrivate } from './trace.mjs';

export const OFFERS_FILE = `${DIAGNOSTICS_DIR}/offers.json`;
const OFFER_INTERVAL_MS = 60 * 60 * 1000;

const keyOf = ({ skill, code }) => `${skill}/${code}`;

function readErrors(root) {
  try {
    const { errors } = JSON.parse(fs.readFileSync(path.join(root, OFFERS_FILE), 'utf8'));
    return errors !== null && typeof errors === 'object' ? errors : {};
  } catch {
    return {};
  }
}

function writeErrors(root, errors) {
  ensureDiagnosticsDir(root);
  writePrivate(path.join(root, OFFERS_FILE), `${JSON.stringify({ errors })}\n`);
}

// True, and remembered, when Chef may offer a report for `error` ({ skill, code }) now.
export function claimOffer(root, error, { now = new Date() } = {}) {
  const errors = readErrors(root);
  const { offered_at, declined_at } = errors[keyOf(error)] ?? {};
  if (declined_at || (offered_at && now - Date.parse(offered_at) < OFFER_INTERVAL_MS)) return false;
  writeErrors(root, { ...errors, [keyOf(error)]: { offered_at: now.toISOString() } });
  return true;
}

export function declineOffer(root, error, { now = new Date() } = {}) {
  const errors = readErrors(root);
  writeErrors(root, { ...errors, [keyOf(error)]: { ...errors[keyOf(error)], declined_at: now.toISOString() } });
}

export function clearDeclines(root) {
  const errors = readErrors(root);
  writeErrors(root, Object.fromEntries(Object.entries(errors).map(([key, { declined_at, ...rest }]) => [key, rest])));
}
