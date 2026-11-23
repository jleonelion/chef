import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { git } from '../../../lib/git.mjs';
import { writeWiki } from '../../../lib/wiki.mjs';
import { initDataRoot } from '../../chef-setup/scripts/lib/init-data-root.mjs';
import { commitInventory } from './lib/commit.mjs';
import { loadInventory, STORE } from './lib/store.mjs';

const script = fileURLToPath(new URL('./inventory.mjs', import.meta.url));

function dataRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-inventory-cli-')), 'root');
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

function deduct(root) {
  const output = execFileSync(process.execPath, [
    script,
    'deduct',
    '--data-root', root,
    '--recipe', 'test-pasta',
    '--servings', '5',
    '--deduction-id', 'cook-test-pasta-20260115',
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

test('deduct applies a converted recipe quantity once per deduction id', () => {
  const root = dataRoot();
  const first = deduct(root);
  const second = deduct(root);

  assert.equal(first.status, 'deducted');
  assert.equal(first.deductions[0].deducted, 0.5);
  assert.equal(second.status, 'duplicate');
  assert.equal(loadInventory(root).pantry.grains.pasta.amount, 0.5);
  const audit = fs.readFileSync(path.join(root, STORE.audit), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(audit.filter((entry) => entry.action === 'deduct').length, 1);
});

test('deduct accepts an explicit ingredient-to-inventory match', () => {
  const root = dataRoot();
  writeWiki(root, {
    pages: [{
      slug: 'test-milk',
      frontmatter: {
        type: 'recipe', title: 'Test Milk', servings: 2, source_kind: 'text', source_raw: [], created: '2026-01-15', updated: '2026-01-15',
      },
      body: '# Test Milk\n\n## Ingredients\n\n- 1 cup milk\n\n## Steps\n\n1. Cook.\n',
    }],
    message: 'test: add milk recipe',
  });
  const inventory = loadInventory(root);
  inventory.fridge = { dairy: { whole_milk: { name: 'whole milk', amount: 2, unit: 'cup' } } };
  commitInventory(root, { inventory, action: 'seed', details: {}, message: 'test: add whole milk' });
  const result = JSON.parse(execFileSync(process.execPath, [
    script,
    'deduct',
    '--data-root', root,
    '--recipe', 'test-milk',
    '--servings', '2',
    '--deduction-id', 'cook-test-milk-20260115',
    '--match', 'milk=fridge.dairy.whole_milk',
  ], { encoding: 'utf8' }));
  assert.equal(result.status, 'deducted');
  assert.equal(result.deductions[0].inventory_path, 'fridge.dairy.whole_milk');
  assert.equal(loadInventory(root).fridge.dairy.whole_milk.amount, 1);
});

test('deduct rejects a match whose inventory path does not exist', () => {
  const root = dataRoot();
  const result = spawnSync(process.execPath, [
    script,
    'deduct',
    '--data-root', root,
    '--recipe', 'test-pasta',
    '--servings', '2',
    '--deduction-id', 'cook-test-pasta-invalid-match',
    '--match', 'pasta=fridge.dairy.missing',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, 'invalid-input');
});

test('deduct validates every path even for repeated ingredients', () => {
  const root = dataRoot();
  const result = spawnSync(process.execPath, [
    script, 'deduct', '--data-root', root, '--recipe', 'test-pasta', '--servings', '2',
    '--deduction-id', 'cook-test-pasta-repeated-match',
    '--match', 'pasta=fridge.dairy.missing',
    '--match', 'pasta=pantry.grains.pasta',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, 'invalid-input');
});

test('deduct reports an unconvertible unit mismatch without writing', () => {
  const root = dataRoot();
  writeWiki(root, {
    pages: [{
      slug: 'test-pasta',
      frontmatter: {
        type: 'recipe', title: 'Test Pasta', servings: 2, source_kind: 'text', source_raw: [], created: '2026-01-15', updated: '2026-01-15',
      },
      body: '# Test Pasta\n\n## Ingredients\n\n- 1 cup pasta\n\n## Steps\n\n1. Cook.\n',
    }],
    message: 'test: change recipe unit',
  });
  const head = git(root, ['rev-parse', 'HEAD']);
  const result = spawnSync(process.execPath, [
    script,
    'deduct',
    '--data-root', root,
    '--recipe', 'test-pasta',
    '--servings', '2',
    '--deduction-id', 'cook-test-pasta-mismatch',
  ], { encoding: 'utf8' });
  const output = JSON.parse(result.stdout);

  assert.equal(result.status, 2);
  assert.equal(output.status, 'invalid-input');
  assert.equal(output.unit_mismatches[0].reason, 'cannot convert cup to kg');
  assert.equal(loadInventory(root).pantry.grains.pasta.amount, 1);
  assert.equal(git(root, ['rev-parse', 'HEAD']), head);
});

function view(root) {
  return JSON.parse(execFileSync(process.execPath, [script, 'view', '--data-root', root], { encoding: 'utf8' }));
}

test('view shows on-hand amounts in the household unit system; stored amount and unit stay as stored', () => {
  const root = dataRoot();
  fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ settings_version: 1, units: 'us' }));
  assert.deepEqual(view(root).items.map(({ amount, unit, display }) => [amount, unit, display]), [[1, 'kg', '2.25 lb']]);
  fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ settings_version: 1, units: 'metric' }));
  assert.equal(view(root).items[0].display, '1 kg');
  assert.deepEqual(loadInventory(root).pantry.grains.pasta, { name: 'pasta', amount: 1, unit: 'kg' });
});
