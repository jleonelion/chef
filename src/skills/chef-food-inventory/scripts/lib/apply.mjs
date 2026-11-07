// Applies parsed receipt items to an inventory and returns a new inventory; never mutates input.
import { canonicalUnit } from './units.mjs';
import { itemKey, placeItem } from './placement.mjs';
import { isKey } from './store.mjs';

const round = (value) => Math.round(value * 1000) / 1000;
const earliest = (a, b) => [a, b].filter(Boolean).sort()[0];

function resolvePath(item) {
  const parts = (item.target ?? placeItem(item.name)).split('.');
  if (parts.length === 2) parts.push(itemKey(item.name));
  return parts.slice(1).every((part) => part && isKey(part)) ? parts : null;
}

function addTo(entry, item, { date, now }) {
  if (canonicalUnit(entry.unit) !== item.unit) return { reason: `stored in ${entry.unit}, receipt says ${item.unit}` };
  const expires = earliest(entry.expires, item.expires);
  Object.assign(entry, { amount: round(entry.amount + item.quantity), purchased: date, updated: now }, expires ? { expires } : {});
  return { action: 'updated' };
}

function create(items, key, item, { date, now }) {
  items[key] = { name: item.name, amount: item.quantity, unit: item.unit, purchased: date, updated: now, ...(item.expires ? { expires: item.expires } : {}) };
  return { action: 'added' };
}

// The own child object at `key`, created when missing; never an inherited property.
const child = (parent, key) => (Object.hasOwn(parent, key) ? parent[key] : (parent[key] = {}));

export function applyItems(inventory, items, when) {
  const next = structuredClone(inventory);
  const changes = [];
  const rejected = [];
  for (const item of items) {
    const parts = resolvePath(item);
    if (!parts) {
      rejected.push({ lineNumber: item.lineNumber, reason: 'no valid place for this item; check the name and target' });
      continue;
    }
    const [location, category, key] = parts;
    const bucket = child(child(next, location), category);
    const result = Object.hasOwn(bucket, key) ? addTo(bucket[key], item, when) : create(bucket, key, item, when);
    if (result.reason) rejected.push({ lineNumber: item.lineNumber, reason: `${parts.join('.')}: ${result.reason}` });
    else changes.push({ path: parts.join('.'), action: result.action, amount: item.quantity, unit: item.unit });
  }
  next.lastUpdated = when.now;
  return { inventory: next, changes, rejected };
}
