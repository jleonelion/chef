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
  const list = buildList(root, { units: 'us' });
  assert.equal(list.status, 'built');
  assert.equal(list.week_start, '2026-01-19');
  assert.deepEqual(list.items.map(({ item, amount, unit }) => [item, amount, unit]), [['chickpeas', 4, 'can'], ['cumin', 1, 'tbsp']]);
  assert.deepEqual(list.covered.map((c) => c.item), ['spaghetti']);
  assert.deepEqual(list.unquantified.map((u) => u.item), ['salt']);
  assert.match(list.text, /- 4 can chickpeas/);
  assert.match(list.text, /- 1 tbsp cumin/);
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
  const list = buildList(root, { weekStart: '2026-01-19', units: 'metric' });
  assert.deepEqual(list.excluded.map((e) => [e.slug, e.reasons[0].why]), [['pasta', 'flagged']]);
  assert.deepEqual(list.items.map((i) => i.item), ['chickpeas']);
  assert.match(list.dietary.footer, /always check labels/);
  assert.match(list.text, /always check labels/);
});

test('picks the latest saved plan when no week is given; no plan is no-plan', () => {
  const root = makeRoot([recipe('stew', ['1 can chickpeas']), plan('2026-01-12', [['stew', 2]]), plan('2026-01-19', [['stew', 4]])]);
  const latest = buildList(root, {});
  assert.equal(latest.week_start, '2026-01-19');
  assert.match(latest.text, /week of 2026-01-19/);
  assert.equal(buildList(root, { weekStart: '2026-02-02' }).status, 'no-plan');
  assert.equal(buildList(makeRoot([]), {}).status, 'no-plan');
});

test('upcoming never falls back to a past plan or includes a delivery payload', () => {
  const root = makeRoot([recipe('stew', ['1 can chickpeas']), plan('2026-01-12', [['stew', 2]])]);
  const result = buildList(root, { upcoming: true, today: '2026-01-19' });
  assert.deepEqual(result, {
    status: 'no-plan',
    data_root: root,
    looked_for: '2026-01-20',
    reason: 'no saved meal plan starts in the next 7 days; plan meals with chef-meal-planning first',
  });
  assert.equal(Object.hasOwn(result, 'delivery'), false);
});

test('upcoming picks the earliest plan from today through 7 days and excludes plans 8 days out', () => {
  const files = [
    recipe('stew', ['1 can chickpeas']),
    plan('2026-01-19', [['stew', 2]]),
    plan('2026-01-22', [['stew', 3]]),
    plan('2026-01-26', [['stew', 4]]),
    plan('2026-01-27', [['stew', 5]]),
  ];
  const root = makeRoot(files);
  assert.equal(buildList(root, { upcoming: true, today: '2026-01-19' }).week_start, '2026-01-19');

  const withoutToday = makeRoot(files.filter((file) => !file.path.endsWith('/2026-01-19.md')));
  assert.equal(buildList(withoutToday, { upcoming: true, today: '2026-01-19' }).week_start, '2026-01-22');

  const tooFar = makeRoot([recipe('stew', ['1 can chickpeas']), plan('2026-01-27', [['stew', 5]])]);
  assert.equal(buildList(tooFar, { upcoming: true, today: '2026-01-19' }).status, 'no-plan');
});

test('upcoming gets today from the user timezone', (t) => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  t.after(() => {
    process.env.TZ = previousTimezone;
  });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-20T07:30:00Z') });

  const root = makeRoot([recipe('stew', ['1 can chickpeas']), plan('2026-01-19', [['stew', 2]])]);
  assert.equal(buildList(root, { upcoming: true }).week_start, '2026-01-19');
});

test('a planned recipe that no longer exists is reported, not guessed', () => {
  const root = makeRoot([plan('2026-01-19', [['gone', 2]])]);
  const list = buildList(root, {});
  assert.deepEqual(list.missing_recipes, ['gone']);
  assert.deepEqual(list.items, []);
});

const slottedPlan = (weekStart, meals) => ({
  path: `knowledge/wiki/meal-plans/${weekStart}.md`,
  content: serializePage({ type: 'meal-plan', title: `Meal plan: week of ${weekStart}`, week_start: weekStart, meals }, '# Plan\n'),
});

test('a recipe planned at two meals buys for both meals\' servings and the list shows each meal\'s slot', () => {
  const root = makeRoot([
    recipe('oats', ['1 cup rolled oats']),
    slottedPlan('2026-01-19', [
      { date: '2026-01-19', slot: 'breakfast', slug: 'oats', title: 'oats', servings: 4 },
      { date: '2026-01-19', slot: 'snack', slug: 'oats', title: 'oats', servings: 1 },
    ]),
  ]);
  const list = buildList(root, { units: 'us' });
  assert.deepEqual(list.items.map(({ item, amount, unit }) => [item, amount, unit]), [['rolled oats', 2.5, 'cup']]);
  assert.deepEqual(list.meals, [
    { date: '2026-01-19', slot: 'breakfast', slug: 'oats', servings: 4 },
    { date: '2026-01-19', slot: 'snack', slug: 'oats', servings: 1 },
  ]);
});

test('a v1 one-per-day plan reads as dinners', () => {
  const root = makeRoot([recipe('stew', ['2 can chickpeas']), plan('2026-01-19', [['stew', 2]])]);
  assert.deepEqual(buildList(root, {}).meals, [{ date: '2026-01-19', slot: 'dinner', slug: 'stew', servings: 2 }]);
});

test('quantities show in the household unit system; sources keep each recipe\'s units', () => {
  const root = makeRoot([
    recipe('soup', ['1 cup milk', '400 g tomatoes']),
    recipe('bake', ['250 ml milk', '1 lb tomatoes']),
    plan('2026-01-19', [['soup', 2], ['bake', 2]]),
    { ...inventory, content: JSON.stringify({ lastUpdated: '2026-01-14T00:00:00Z', fridge: { produce: { tomatoes: { amount: 2, unit: 'kg' } } } }) },
  ]);
  const us = buildList(root, { units: 'us' });
  const metric = buildList(root, { units: 'metric' });
  assert.match(us.text, /- 2\.25 cups milk/);
  assert.match(metric.text, /- 500 ml milk/);
  assert.deepEqual(metric.items[0].sources.map((s) => [s.recipe, s.amount, s.unit]), [['soup', 1, 'cup'], ['bake', 250, 'ml']]);
  assert.deepEqual(us.covered.map((c) => [c.item, c.text, c.on_hand.text]), [['tomatoes', '2 lb', '4.5 lb']]);
});
