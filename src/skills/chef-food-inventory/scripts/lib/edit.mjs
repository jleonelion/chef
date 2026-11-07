// Manual inventory edits: set an item's amount, unit or expiry, or remove it.
import { commitInventory } from './commit.mjs';
import { canonicalUnit } from './units.mjs';
import { isIsoDate } from './dates.mjs';
import { loadInventory, validateInventory } from './store.mjs';

const PATH = /^(pantry|fridge|freezer)\.[a-z0-9]+(_[a-z0-9]+)*\.[a-z0-9]+(_[a-z0-9]+)*$/;
const invalid = (problem) => ({ status: 'invalid-input', problems: [problem] });

function problemWith({ path, amount, unit, expires, remove }, exists) {
  if (!PATH.test(path ?? '')) return 'path must be <pantry|fridge|freezer>.<category>.<item>, lower case with underscores';
  if (remove) return exists ? null : `${path} is not in the inventory`;
  if (amount !== undefined && !(Number.isFinite(amount) && amount >= 0)) return 'amount must be a number >= 0';
  if (expires !== undefined && expires !== null && !isIsoDate(expires)) return 'expires must be YYYY-MM-DD or none';
  if (!exists && (amount === undefined || !unit)) return `${path} is new, so it needs an amount and a unit`;
  return null;
}

function applyEdit(entry, key, { amount, unit, expires, now }) {
  const next = { name: entry?.name ?? key.replaceAll('_', ' '), ...entry, updated: now };
  if (amount !== undefined) next.amount = amount;
  if (unit) next.unit = canonicalUnit(unit);
  if (expires === null) delete next.expires;
  else if (expires !== undefined) next.expires = expires;
  return next;
}

export function editItem(root, edit) {
  const inventory = structuredClone(loadInventory(root));
  const [location, category, key] = (edit.path ?? '').split('.');
  const exists = Object.hasOwn(inventory[location]?.[category] ?? {}, key);
  const problem = problemWith(edit, exists);
  if (problem) return invalid(problem);
  if (edit.remove && !edit.reason?.trim()) return invalid('removing an item needs a reason');
  const bucket = ((inventory[location] ??= {})[category] ??= {});
  if (edit.remove) delete bucket[key];
  else bucket[key] = applyEdit(bucket[key], key, edit);
  inventory.lastUpdated = edit.now;
  const problems = validateInventory(inventory);
  if (problems.length) return { status: 'invalid-input', problems };
  const action = edit.remove ? 'remove' : 'edit';
  const written = commitInventory(root, { inventory, action, details: { path: edit.path, reason: edit.reason ?? null }, message: `chef-food-inventory: ${action} ${edit.path}` });
  return written.status === 'written' ? { status: 'saved', path: edit.path, item: bucket[key] ?? null } : written;
}
