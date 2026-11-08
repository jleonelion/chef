// Read-only view of the meal log, data/meal-log/log.json ({ entries: [...] }), which
// chef-meal-logging owns and writes. Each entry's `nutrition` is its totals, or null when unknown.
import fs from 'node:fs';
import path from 'node:path';
import { slugify } from './wiki.mjs';

export const MEAL_LOG_PATH = 'data/meal-log/log.json';

export function mealEntryId(entry) {
  return `${entry.date}-${entry.slot}-${entry.recipe ?? slugify(entry.food ?? '')}`;
}

function entriesWithIds(entries) {
  const used = new Set(entries.map((entry) => entry.id).filter(Boolean));
  return entries.map((entry) => {
    if (entry.id) return entry;
    const base = mealEntryId(entry);
    let id = base;
    for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
    used.add(id);
    return { ...entry, id };
  });
}

export function readMealLog(root) {
  const file = path.join(root, MEAL_LOG_PATH);
  if (!fs.existsSync(file)) return { entries: [] };
  try {
    const log = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(log?.entries)) throw new Error('no entries list');
    return { entries: entriesWithIds(log.entries) };
  } catch {
    return { problem: `${MEAL_LOG_PATH} can't be read` };
  }
}
