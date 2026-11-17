// One-time notices Chef has shown, by key, with the date. Household notices live in
// `data/notices.json`, committed with the write that shows them: `training-setting` is shown once,
// on the first hard constraint or health entry. Machine-local notices live in the git-ignored
// `diagnostics/notices.json`, so showing one never changes the data root's history:
// `invocation-trace` is shown once per machine, on the first captured run.
import fs from 'node:fs';
import path from 'node:path';
import { DIAGNOSTICS_DIR, ensureDiagnosticsDir, writePrivate } from './diagnostics/trace.mjs';

export const NOTICES_PATH = 'data/notices.json';
export const LOCAL_NOTICES_PATH = `${DIAGNOSTICS_DIR}/notices.json`;

export function readNotices(root, file = NOTICES_PATH) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch {
    return {};
  }
}

const withKey = (notices, key, date) => `${JSON.stringify({ ...notices, [key]: date }, null, 2)}\n`;

// The data file to write when `key` has not been shown yet, else null.
export function noticeToRecord(root, key, date) {
  const notices = readNotices(root);
  if (notices[key]) return null;
  return { path: NOTICES_PATH, content: withKey(notices, key, date) };
}

// True, and remembered, the first time machine-local notice `key` is taken.
export function takeLocalNotice(root, key, date) {
  const notices = readNotices(root, LOCAL_NOTICES_PATH);
  if (notices[key]) return false;
  ensureDiagnosticsDir(root);
  writePrivate(path.join(root, LOCAL_NOTICES_PATH), withKey(notices, key, date));
  return true;
}
