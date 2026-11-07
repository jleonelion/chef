import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeWiki } from '../../../../lib/wiki.mjs';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';
import { commitInventory } from '../../../chef-food-inventory/scripts/lib/commit.mjs';
import { loadInventory, STORE } from '../../../chef-food-inventory/scripts/lib/store.mjs';
import { logMeal, MEAL_LOG_FILE } from './log.mjs';

function dataRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-meal-log-')), 'root');
  initDataRoot(root);
  writeWiki(root, {
    pages: [{
      slug: 'test-pasta',
      frontmatter: {
        type: 'recipe',
        title: 'Test Pasta',
        servings: 2,
        source_kind: 'text',
        source_raw: [],
        created: '2026-01-15',
        updated: '2026-01-15',
      },
      body: '# Test Pasta\n\n## Ingredients\n\n- 200 g pasta\n\n## Steps\n\n1. Cook.\n',
    }],
    message: 'test: add recipe',
  });
  commitInventory(root, {
    inventory: {
      lastUpdated: '2026-01-15T12:00:00.000Z',
      pantry: { grains: { pasta: { name: 'pasta', amount: 1, unit: 'kg' } } },
      fridge: {},
      freezer: {},
    },
    action: 'seed',
    details: {},
    message: 'test: seed inventory',
  });
  return root;
}

test('logging the same cooked recipe twice stores one entry and deducts inventory once', () => {
  const root = dataRoot();
  const input = {
    date: '2026-01-16',
    slot: 'dinner',
    recipe: 'test-pasta',
    servings: 5,
    cooked: true,
    loggedAt: '2026-01-16T19:30:00.000Z',
  };

  const first = logMeal(root, input);
  const second = logMeal(root, input);

  assert.equal(first.status, 'logged');
  assert.equal(first.inventory.status, 'deducted');
  assert.equal(second.status, 'unchanged');
  assert.equal(second.inventory.status, 'duplicate');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, MEAL_LOG_FILE), 'utf8')), {
    entries: [{
      id: '2026-01-16-dinner-test-pasta',
      date: '2026-01-16',
      slot: 'dinner',
      recipe: 'test-pasta',
      food: null,
      servings: 5,
      cooked: true,
      nutrition: null,
      logged_at: '2026-01-16T19:30:00.000Z',
    }],
  });
  assert.equal(loadInventory(root).pantry.grains.pasta.amount, 0.5);
  const audit = fs.readFileSync(path.join(root, STORE.audit), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(audit.filter((entry) => entry.action === 'deduct').length, 1);
});

test('logging a recipe copies complete nutrition totals scaled by servings', () => {
  const root = dataRoot();
  writeWiki(root, {
    pages: [{
      slug: 'test-pasta',
      frontmatter: {
        type: 'recipe',
        title: 'Test Pasta',
        servings: 2,
        source_kind: 'text',
        source_raw: [],
        created: '2026-01-15',
        updated: '2026-01-15',
        nutrition_status: 'complete',
        nutrition_per_serving: { calories: 120, protein: 4.5, sodium: 80 },
      },
      body: '# Test Pasta\n\n## Ingredients\n\n- 200 g pasta\n\n## Steps\n\n1. Cook.\n',
    }],
    message: 'test: add nutrition',
  });

  const result = logMeal(root, {
    date: '2026-01-17',
    slot: 'lunch',
    recipe: 'test-pasta',
    servings: 2.5,
    cooked: false,
    loggedAt: '2026-01-17T12:30:00.000Z',
  });

  assert.deepEqual(result.entry.nutrition, { calories: 300, protein: 11.25, sodium: 200 });
});
