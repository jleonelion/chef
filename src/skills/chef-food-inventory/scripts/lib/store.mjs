// The inventory store: data/food-inventory/current.json, shaped
// { lastUpdated, pantry|fridge|freezer: { <category>: { <item key>: Item } } }.
// Item: { amount >= 0, unit, name?, purchased?, expires?, updated?, notes? }. Reads only; writes go
// through the shared wiki write path (see commit.mjs).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isIsoDate } from './dates.mjs';

const DIR = 'data/food-inventory';
export const STORE = {
  inventory: `${DIR}/current.json`,
  audit: `${DIR}/audit.jsonl`,
  ledger: `${DIR}/receipt-ledger.json`,
  purchases: `${DIR}/purchases`,
};
export const LOCATIONS = ['pantry', 'fridge', 'freezer'];
const KEY = /^[a-z0-9]+(_[a-z0-9]+)*$/;

export const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
export const serializeInventory = (inventory) => `${JSON.stringify(inventory, null, 2)}\n`;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function itemProblems(item, at) {
  if (!isObject(item)) return [`${at}: not an object`];
  const problems = [];
  if (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount < 0) problems.push(`${at}.amount: must be a number >= 0`);
  if (typeof item.unit !== 'string' || !item.unit) problems.push(`${at}.unit: required text`);
  for (const field of ['purchased', 'expires']) {
    if (item[field] !== undefined && !isIsoDate(item[field])) problems.push(`${at}.${field}: must be YYYY-MM-DD`);
  }
  return problems;
}

function locationProblems(tree, location) {
  if (!isObject(tree)) return [`${location}: not an object`];
  return Object.entries(tree).flatMap(([category, items]) => {
    if (!KEY.test(category) || !isObject(items)) return [`${location}.${category}: bad category`];
    return Object.entries(items).flatMap(([key, item]) =>
      KEY.test(key) ? itemProblems(item, `${location}.${category}.${key}`) : [`${location}.${category}.${key}: bad item key`],
    );
  });
}

export function validateInventory(inventory) {
  if (!isObject(inventory)) return ['inventory: not an object'];
  const problems = [];
  if (typeof inventory.lastUpdated !== 'string' || Number.isNaN(Date.parse(inventory.lastUpdated))) problems.push('lastUpdated: must be a timestamp');
  for (const key of Object.keys(inventory)) {
    if (key === 'lastUpdated') continue;
    problems.push(...(LOCATIONS.includes(key) ? locationProblems(inventory[key], key) : [`${key}: unknown location`]));
  }
  return problems;
}

export function listItems(inventory) {
  return LOCATIONS.flatMap((location) =>
    Object.entries(inventory[location] ?? {}).flatMap(([category, items]) =>
      Object.entries(items).map(([key, item]) => ({ ...item, name: item.name ?? key.replaceAll('_', ' '), path: `${location}.${category}.${key}`, location, category, key })),
    ),
  );
}

export const readText = (root, relative) => {
  const file = path.join(root, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

export function loadInventory(root) {
  const text = readText(root, STORE.inventory);
  if (text === null) return { lastUpdated: new Date(0).toISOString() };
  const inventory = JSON.parse(text);
  const problems = validateInventory(inventory);
  if (problems.length) throw new Error(`inventory store is invalid: ${problems.join('; ')}`);
  return inventory;
}
