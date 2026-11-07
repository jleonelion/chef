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
