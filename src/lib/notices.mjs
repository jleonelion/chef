// One-time notices Chef has shown, by key, with the date: `data/notices.json`.
// `training-setting` is shown once, on the first hard constraint or health entry.
import fs from 'node:fs';
import path from 'node:path';

export const NOTICES_PATH = 'data/notices.json';

export function readNotices(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, NOTICES_PATH), 'utf8'));
  } catch {
    return {};
  }
}

// The data file to write when `key` has not been shown yet, else null.
export function noticeToRecord(root, key, date) {
  const notices = readNotices(root);
  if (notices[key]) return null;
  return { path: NOTICES_PATH, content: `${JSON.stringify({ ...notices, [key]: date }, null, 2)}\n` };
}
