import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderRollup, ROLLUP_PATH } from './rollup.mjs';

const inventory = {
  lastUpdated: '2026-01-15T12:00:00.000Z',
  pantry: { grains: { jasmine_rice: { name: 'jasmine rice', amount: 2, unit: 'lb' } } },
  fridge: { dairy: { whole_milk: { name: 'whole milk', amount: 1, unit: 'gal', expires: '2026-01-22' } } },
};

test('renders one line per store item, grouped by location and category', () => {
  const page = renderRollup(inventory);
  assert.equal(page.slug, 'current-inventory');
  assert.deepEqual(page.frontmatter, { type: 'inventory-rollup', title: 'Current inventory', generated_from: 'data/food-inventory/current.json', updated: '2026-01-15' });
  assert.equal(ROLLUP_PATH, 'knowledge/wiki/household/current-inventory.md');
  const lines = page.body.split('\n');
  assert.ok(lines.indexOf('## Pantry') < lines.indexOf('## Fridge'));
  assert.ok(lines.includes('- jasmine rice: 2 lb'));
  assert.ok(lines.includes('- whole milk: 1 gal (expires 2026-01-22)'));
});

test('an empty store renders an explicit empty state', () => {
  assert.match(renderRollup({ lastUpdated: '2026-01-15T00:00:00.000Z' }).body, /No items/);
});

test('item names are rendered as plain text, not Markdown', () => {
  const evil = { lastUpdated: '2026-01-15T00:00:00.000Z', pantry: { other: { x: { name: '[click](https://example.com) *x*', amount: 1, unit: 'each' } } } };
  assert.match(renderRollup(evil).body, /\\\[click\\\]\\\(https:\/\/example\.com\\\) \\\*x\\\*/);
});
