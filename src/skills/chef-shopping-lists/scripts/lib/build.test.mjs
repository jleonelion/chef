import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { serializePage } from '../../../../lib/frontmatter.mjs';
import { buildList } from './build.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const recipe = (slug, ingredients, frontmatter = {}) => ({
  path: `knowledge/wiki/recipes/${slug}.md`,
  content: serializePage(
    { type: 'recipe', title: slug, servings: 2, source_kind: 'text', source_raw: [], created: '2026-01-15', updated: '2026-01-15', dietary_flags: [], ...frontmatter },
    `# ${slug}\n\n## Ingredients\n\n${ingredients.map((line) => `- ${line}`).join('\n')}\n`,
  ),
});

const plan = (weekStart, meals) => ({
  path: `knowledge/wiki/meal-plans/${weekStart}.md`,
  content: serializePage(
    { type: 'meal-plan', title: `Meal plan: week of ${weekStart}`, week_start: weekStart, meals: meals.map(([slug, servings]) => ({ date: weekStart, slug, title: slug, servings })) },
    '# Plan\n',
  ),
});

const ruleset = (hard) => ({
  path: 'knowledge/wiki/household/dietary-ruleset.md',
  content: serializePage({ type: 'dietary-ruleset', title: 'Dietary ruleset', members: [{ name: 'Alex Example', hard_constraints: hard }], updated: '2026-01-15' }, '# Dietary ruleset\n'),
});

const inventory = {
  path: 'data/food-inventory/current.json',
  content: JSON.stringify({ lastUpdated: '2026-01-14T00:00:00Z', pantry: { grains: { spaghetti: { amount: 1, unit: 'kg' } } } }),
};

function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-shopping-test-'));
  roots.push(root);
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file.path)), { recursive: true });
    fs.writeFileSync(path.join(root, file.path), file.content);
  }
  return root;
}

test('combines the plan\'s recipes scaled to planned servings, minus inventory', () => {
  const root = makeRoot([
    recipe('stew', ['2 can chickpeas', '1 tsp cumin']),
    recipe('pasta', ['200 g spaghetti', '1 tsp cumin', 'salt to taste']),
    plan('2026-01-19', [['stew', 3], ['stew', 1], ['pasta', 2]]),
    inventory,
  ]);
  const list = buildList(root, {});
  assert.equal(list.status, 'built');
  assert.equal(list.week_start, '2026-01-19');
  assert.deepEqual(list.items.map(({ item, amount, unit }) => [item, amount, unit]), [['chickpeas', 4, 'can'], ['cumin', 3, 'tsp']]);
  assert.deepEqual(list.covered.map((c) => c.item), ['spaghetti']);
  assert.deepEqual(list.unquantified.map((u) => u.item), ['salt']);
  assert.match(list.text, /- 4 can chickpeas/);
  assert.match(list.text, /salt/);
  assert.equal(list.dietary.nudge.startsWith('No dietary constraints recorded'), true);
});

test('the gate re-runs: a plan recipe now excluded is reported and left off the list', () => {
  const root = makeRoot([
    recipe('stew', ['2 can chickpeas']),
    recipe('pasta', ['200 g spaghetti', '30 g parmesan'], { dietary_flags: ['contains-dairy'] }),
    plan('2026-01-19', [['stew', 2], ['pasta', 2]]),
    ruleset(['dairy']),
  ]);
  const list = buildList(root, { weekStart: '2026-01-19' });
  assert.deepEqual(list.excluded.map((e) => [e.slug, e.reasons[0].why]), [['pasta', 'flagged']]);
  assert.deepEqual(list.items.map((i) => i.item), ['chickpeas']);
  assert.match(list.dietary.footer, /always check labels/);
  assert.match(list.text, /always check labels/);
});

test('picks the latest saved plan when no week is given; no plan is no-plan', () => {
  const root = makeRoot([recipe('stew', ['1 can chickpeas']), plan('2026-01-12', [['stew', 2]]), plan('2026-01-19', [['stew', 4]])]);
  assert.equal(buildList(root, {}).week_start, '2026-01-19');
  assert.equal(buildList(root, { weekStart: '2026-02-02' }).status, 'no-plan');
  assert.equal(buildList(makeRoot([]), {}).status, 'no-plan');
});

test('a planned recipe that no longer exists is reported, not guessed', () => {
  const root = makeRoot([plan('2026-01-19', [['gone', 2]])]);
  const list = buildList(root, {});
  assert.deepEqual(list.missing_recipes, ['gone']);
  assert.deepEqual(list.items, []);
});
