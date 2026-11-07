import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { writeWiki } from '../../../../lib/wiki.mjs';
import { initDataRoot } from '../../../chef-setup/scripts/lib/init-data-root.mjs';
import { commitInventory } from '../../../chef-food-inventory/scripts/lib/commit.mjs';
import { loadInventory, STORE } from '../../../chef-food-inventory/scripts/lib/store.mjs';
import { logMeal, MEAL_LOG_FILE } from './log.mjs';

const script = fileURLToPath(new URL('../meal-logging.mjs', import.meta.url));

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

test('meal logging CLI records a confirmed cooked meal', () => {
  const root = dataRoot();
  const result = spawnSync(process.execPath, [
    script,
    'log',
    '--data-root', root,
    '--date', '2026-01-16',
    '--slot', 'dinner',
    '--recipe', 'test-pasta',
    '--servings', '2',
    '--cooked',
    '--logged-at', '2026-01-16T19:30:00.000Z',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'logged');
  assert.equal(output.entry.id, '2026-01-16-dinner-test-pasta');
  assert.equal(output.inventory.status, 'deducted');
});

test('a unit mismatch is reported while the cooked meal stays logged', () => {
  const root = dataRoot();
  commitInventory(root, {
    inventory: {
      lastUpdated: '2026-01-15T12:00:00.000Z',
      pantry: { grains: { pasta: { name: 'pasta', amount: 3, unit: 'box' } } },
      fridge: {},
      freezer: {},
    },
    action: 'seed',
    details: {},
    message: 'test: pasta in boxes',
  });

  const result = logMeal(root, {
    date: '2026-01-17',
    slot: 'lunch',
    recipe: 'test-pasta',
    servings: 2,
    cooked: true,
    loggedAt: '2026-01-17T12:30:00.000Z',
  });

  assert.equal(result.status, 'logged');
  assert.equal(result.inventory.status, 'invalid-input');
  assert.equal(result.inventory.unit_mismatches.length, 1);
  const log = JSON.parse(fs.readFileSync(path.join(root, MEAL_LOG_FILE), 'utf8'));
  assert.deepEqual(log.entries.map((entry) => entry.id), ['2026-01-17-lunch-test-pasta']);
  assert.equal(loadInventory(root).pantry.grains.pasta.amount, 3);
});

test('invalid input is rejected without creating the meal log', () => {
  const root = dataRoot();
  const result = logMeal(root, {
    date: '2026-13-40',
    slot: 'brunch',
    recipe: 'no-such-recipe',
    food: 'toast',
    servings: 0,
    cooked: true,
    loggedAt: '2026-01-16T09:00:00.000Z',
  });

  assert.equal(result.status, 'invalid-input');
  assert.deepEqual(result.problems, [
    'date: must be YYYY-MM-DD',
    'slot: must be breakfast, lunch, dinner or snack',
    'provide exactly one of recipe or food',
    'servings: must be a positive number',
    'recipe not found: no-such-recipe',
  ]);
  assert.equal(fs.existsSync(path.join(root, MEAL_LOG_FILE)), false);
});
