// Post-error report offers: at most one per error code per hour, and none for a code the user
// declined ("no thanks"). State lives in <data root>/diagnostics/offers.json, git-ignored with the
// trace; an unreadable file counts as empty.
import fs from 'node:fs';
import path from 'node:path';
import { DIAGNOSTICS_DIR, ensureDiagnosticsDir, writePrivate } from './trace.mjs';

export const OFFERS_FILE = `${DIAGNOSTICS_DIR}/offers.json`;
const OFFER_INTERVAL_MS = 60 * 60 * 1000;

function readCodes(root) {
  try {
    const { codes } = JSON.parse(fs.readFileSync(path.join(root, OFFERS_FILE), 'utf8'));
    return codes !== null && typeof codes === 'object' ? codes : {};
  } catch {
    return {};
  }
}

function writeCodes(root, codes) {
  ensureDiagnosticsDir(root);
  writePrivate(path.join(root, OFFERS_FILE), `${JSON.stringify({ codes })}\n`);
}

// True, and remembered, when Chef may offer a report for `code` now.
export function claimOffer(root, code, { now = new Date() } = {}) {
  const codes = readCodes(root);
  const { offered_at, declined_at } = codes[code] ?? {};
  if (declined_at || (offered_at && now - Date.parse(offered_at) < OFFER_INTERVAL_MS)) return false;
  writeCodes(root, { ...codes, [code]: { offered_at: now.toISOString() } });
  return true;
}

export function declineOffer(root, code, { now = new Date() } = {}) {
  const codes = readCodes(root);
  writeCodes(root, { ...codes, [code]: { ...codes[code], declined_at: now.toISOString() } });
}

export function clearDeclines(root) {
  const codes = readCodes(root);
  writeCodes(root, Object.fromEntries(Object.entries(codes).map(([code, { declined_at, ...rest }]) => [code, rest])));
}
