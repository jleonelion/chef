// Read-only view of the meal log, data/meal-log/log.json ({ entries: [...] }), which
// chef-meal-logging owns and writes. Each entry's `nutrition` is its totals, or null when unknown.
import fs from 'node:fs';
import path from 'node:path';

export const MEAL_LOG_PATH = 'data/meal-log/log.json';

export function readMealLog(root) {
  const file = path.join(root, MEAL_LOG_PATH);
  if (!fs.existsSync(file)) return { entries: [] };
  try {
    const log = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(log?.entries)) throw new Error('no entries list');
    return { entries: log.entries };
  } catch {
    return { problem: `${MEAL_LOG_PATH} can't be read` };
  }
}
