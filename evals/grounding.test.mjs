// Every agentic row and tier1 case must resolve against fixtures/data-root (or its own seed).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildCatalog, groundingErrors } from './lib/grounding.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const fixture = path.join(repo, 'fixtures', 'data-root');
const datasets = {
  agentic: JSON.parse(fs.readFileSync(path.join(repo, 'evals', 'agentic', 'rows.json'), 'utf8')),
  tier1: JSON.parse(fs.readFileSync(path.join(repo, 'evals', 'tier1', 'cases.json'), 'utf8')),
};

test('every row and case is grounded in the fixture', () => {
  const catalog = buildCatalog(fixture);
  const errors = Object.entries(datasets).flatMap(([suite, rows]) => rows.flatMap((row) => groundingErrors(row, catalog).map((e) => `${suite} ${row.id}: ${e}`)));
  assert.deepEqual(errors, []);
});

test('the catalog reads the fixture', () => {
  const catalog = buildCatalog(fixture);
  assert.ok(catalog.recipes.has('lemon-garlic-pasta'));
  assert.ok(catalog.inventory.has('spinach'));
});

test('removing a referenced recipe from a fixture copy fails the rows that use it', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-grounding-'));
  try {
    fs.cpSync(fixture, copy, { recursive: true });
    fs.rmSync(path.join(copy, 'knowledge', 'wiki', 'recipes', 'lemon-garlic-pasta.md'));
    const catalog = buildCatalog(copy);
    const failing = datasets.agentic.filter((row) => groundingErrors(row, catalog).length);
    assert.ok(failing.some((row) => row.id === 'chef-meal-logging-day-from-plan'));
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

test('flags undeclared and ungrounded references', () => {
  const catalog = { recipes: new Set(['a']), mealPlans: new Set(), inventory: new Set() };
  assert.deepEqual(groundingErrors({ turns: ['x'], grounding: { recipes: ['a'] } }, catalog), []);
  assert.equal(groundingErrors({ grounding: { recipes: ['b'] } }, catalog).length, 1);
  assert.equal(groundingErrors({ stdin: [{ recipe: 'b' }] }, catalog).length, 1);
  assert.equal(groundingErrors({ command: ['x', '--recipe', 'b'] }, catalog).length, 1);
  assert.deepEqual(groundingErrors({ seed: [{ path: 'knowledge/wiki/recipes/b.md', content: '' }], stdin: [{ recipe: 'b' }] }, catalog), []);
});
