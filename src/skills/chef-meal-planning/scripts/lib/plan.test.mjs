import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { parsePage, serializePage } from '../../../../lib/frontmatter.mjs';
import { planWeek } from './plan.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function recipe(slug, { title = slug, ingredients = ['1 cup rice'], frontmatter = {} } = {}) {
  return {
    path: `knowledge/wiki/recipes/${slug}.md`,
    content: serializePage(
      {
        type: 'recipe',
        title,
        servings: 2,
        source_kind: 'text',
        source_raw: [],
        created: '2026-01-15',
        updated: '2026-01-15',
        dietary_flags: [],
        ...frontmatter,
      },
      `# ${title}\n\n## Ingredients\n\n${ingredients.map((line) => `- ${line}`).join('\n')}\n\n## Steps\n\n1. Cook.\n`,
    ),
  };
}

function makeRoot(files = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-meal-plan-test-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":1}\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'settings.json\n');
  for (const file of files) {
    const target = path.join(root, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Meal Test', '-c', 'user.email=meal-test@example.com', 'commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

function ruleset(members) {
  return {
    path: 'knowledge/wiki/household/dietary-ruleset.md',
    content: serializePage(
      { type: 'dietary-ruleset', title: 'Dietary ruleset', members, updated: '2026-01-15' },
      '# Dietary ruleset\n',
    ),
  };
}

// The synthetic week: breakfast, lunch and dinner on Monday and Tuesday, only dinner on Wednesday.
const week = () => [
  recipe('overnight-oats', { title: 'Overnight Oats', ingredients: ['1 cup oats'] }),
  recipe('lentil-salad', { title: 'Lentil Salad', ingredients: ['1 cup lentils'] }),
  recipe('bean-chili', { title: 'Bean Chili', ingredients: ['2 can beans'] }),
];
const weekMeals = [
  { date: '2026-01-21', slot: 'dinner', recipe: 'bean-chili' },
  { date: '2026-01-19', slot: 'dinner', recipe: 'bean-chili', servings: 4 },
  { date: '2026-01-19', slot: 'breakfast', recipe: 'overnight-oats' },
  { date: '2026-01-19', slot: 'lunch', recipe: 'lentil-salad', note: 'pack for work' },
  { date: '2026-01-20', slot: 'breakfast', recipe: 'overnight-oats' },
  { date: '2026-01-20', slot: 'lunch', recipe: 'bean-chili' },
  { date: '2026-01-20', slot: 'dinner', recipe: 'lentil-salad' },
];

test('a breakfast, lunch and dinner week saves every planned meal with its slot, in date and slot order', () => {
  const root = makeRoot(week());

  const result = planWeek(root, { weekStart: '2026-01-19', meals: weekMeals });

  assert.equal(result.status, 'saved');
  const saved = parsePage(fs.readFileSync(path.join(root, result.path), 'utf8')).frontmatter.meals;
  assert.deepEqual(saved, [
    { date: '2026-01-19', slot: 'breakfast', slug: 'overnight-oats', title: 'Overnight Oats', servings: 1 },
    { date: '2026-01-19', slot: 'lunch', slug: 'lentil-salad', title: 'Lentil Salad', servings: 1, note: 'pack for work' },
    { date: '2026-01-19', slot: 'dinner', slug: 'bean-chili', title: 'Bean Chili', servings: 4 },
    { date: '2026-01-20', slot: 'breakfast', slug: 'overnight-oats', title: 'Overnight Oats', servings: 1 },
    { date: '2026-01-20', slot: 'lunch', slug: 'bean-chili', title: 'Bean Chili', servings: 1 },
    { date: '2026-01-20', slot: 'dinner', slug: 'lentil-salad', title: 'Lentil Salad', servings: 1 },
    { date: '2026-01-21', slot: 'dinner', slug: 'bean-chili', title: 'Bean Chili', servings: 1 },
  ]);
  assert.deepEqual(result.meals, saved);
});

const invalidInputs = [
  ['input that is not a list', { date: '2026-01-19', slot: 'dinner', recipe: 'bean-chili' }, 'meals: must be a list of planned meals'],
  ['an empty list', [], 'meals: must list at least one planned meal'],
  ['an unknown slot', [{ date: '2026-01-19', slot: 'brunch', recipe: 'bean-chili' }], 'meals[0].slot: must be breakfast, lunch, dinner or snack'],
  ['a day past the end of the month', [{ date: '2026-02-30', slot: 'dinner', recipe: 'bean-chili' }], 'meals[0].date: must be a real YYYY-MM-DD date'],
  ['a day no month has', [{ date: '2026-01-32', slot: 'dinner', recipe: 'bean-chili' }], 'meals[0].date: must be a real YYYY-MM-DD date'],
  ['a date outside the week', [{ date: '2026-01-26', slot: 'dinner', recipe: 'bean-chili' }], 'meals[0].date: must fall in the week starting 2026-01-19'],
  ['a missing recipe', [{ date: '2026-01-19', slot: 'dinner' }], 'meals[0].recipe: must be a recipe slug'],
  ['non-positive servings', [{ date: '2026-01-19', slot: 'dinner', recipe: 'bean-chili', servings: 0 }], 'meals[0].servings: must be a number greater than zero'],
  ['a note that is not text', [{ date: '2026-01-19', slot: 'dinner', recipe: 'bean-chili', note: 3 }], 'meals[0].note: must be text'],
  ['two meals in one date and slot', [
    { date: '2026-01-19', slot: 'dinner', recipe: 'bean-chili' },
    { date: '2026-01-19', slot: 'dinner', recipe: 'lentil-salad' },
  ], 'meals[1]: 2026-01-19 dinner is already planned'],
];

for (const [name, meals, problem] of invalidInputs) {
  test(`${name} returns invalid-input and writes nothing`, () => {
    const root = makeRoot(week());
    const beforeHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });

    const result = planWeek(root, { weekStart: '2026-01-19', meals });

    assert.equal(result.status, 'invalid-input');
    assert.deepEqual(result.problems, [problem]);
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }), beforeHead);
    assert.equal(fs.existsSync(path.join(root, 'knowledge/wiki/meal-plans')), false);
  });
}

test('a gated chosen recipe is refused with reasons before anything is written', () => {
  const root = makeRoot([
    recipe('safe'),
    recipe('dairy', { frontmatter: { dietary_flags: ['contains-dairy'] }, ingredients: ['30 g parmesan'] }),
    ruleset([{ name: 'Alex Example', hard_constraints: ['dairy'] }]),
  ]);
  const beforeHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });

  const result = planWeek(root, { weekStart: '2026-01-19', meals: [{ date: '2026-01-20', slot: 'lunch', recipe: 'dairy' }] });

  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'chosen recipes cannot be planned');
  assert.deepEqual(result.refused_choices, [{
    date: '2026-01-20',
    slot: 'lunch',
    slug: 'dairy',
    reasons: [{ member: 'Alex Example', constraint: 'dairy', why: 'flagged', detail: 'contains-dairy' }, { member: 'Alex Example', constraint: 'dairy', why: 'ingredient-text', detail: '30 g parmesan' }],
  }]);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }), beforeHead);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }), '');
});

test('avoidances never block a planned meal and are reported per planned meal', () => {
  const root = makeRoot([
    recipe('a-olive-pasta', { ingredients: ['100 g olives'] }),
    recipe('z-tomato-pasta', { ingredients: ['100 g tomatoes'] }),
    ruleset([{ name: 'Sam Example', avoidances: ['olives'] }]),
  ]);

  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [
      { date: '2026-01-19', slot: 'dinner', recipe: 'z-tomato-pasta' },
      { date: '2026-01-20', slot: 'lunch', recipe: 'a-olive-pasta' },
    ],
  });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.meals.map((meal) => meal.slug), ['z-tomato-pasta', 'a-olive-pasta']);
  assert.deepEqual(result.avoidance_notes, [{
    date: '2026-01-20',
    slot: 'lunch',
    slug: 'a-olive-pasta',
    avoidances: [{ member: 'Sam Example', avoidance: 'olives', detail: '100 g olives' }],
  }]);
});

test('household servings from profile frontmatter apply when a planned meal gives none', () => {
  const profile = {
    path: 'knowledge/wiki/household/profile.md',
    content: serializePage(
      { type: 'household-profile', title: 'Household profile', portions_per_meal: 4, updated: '2026-01-15' },
      '# Household profile\n\nIgnore this prose: 99 portions per meal.\n',
    ),
  };
  const root = makeRoot([recipe('soup'), profile]);

  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [{ date: '2026-01-19', slot: 'dinner', recipe: 'soup' }, { date: '2026-01-20', slot: 'dinner', recipe: 'soup', servings: 2 }],
  });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.meals.map((meal) => meal.servings), [4, 2]);
  assert.equal(result.servings_source, 'profile');
});

test('a one-plan override allows the chosen recipe and reports lifted reasons', () => {
  const root = makeRoot([
    recipe('dairy', { frontmatter: { dietary_flags: ['contains-dairy'] }, ingredients: ['30 g parmesan'] }),
    ruleset([{ name: 'Alex Example', hard_constraints: ['dairy'] }]),
  ]);

  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [{ date: '2026-01-19', slot: 'breakfast', recipe: 'dairy' }],
    overrides: [{ member: 'Alex Example', constraint: 'dairy' }],
  });

  assert.equal(result.status, 'saved');
  assert.equal(result.meals[0].slug, 'dairy');
  assert.deepEqual(result.overridden, [{
    slug: 'dairy',
    reasons: [
      { member: 'Alex Example', constraint: 'dairy', why: 'flagged', detail: 'contains-dairy' },
      { member: 'Alex Example', constraint: 'dairy', why: 'ingredient-text', detail: '30 g parmesan' },
    ],
  }]);
  assert.doesNotMatch(fs.readFileSync(path.join(root, result.path), 'utf8'), /overrid(?:e|den)/);
});

test('unknown and retired recipes are refused per planned meal', () => {
  const root = makeRoot([
    recipe('retired-soup', { frontmatter: { lifecycle: 'retired', retired: '2026-01-16' } }),
    recipe('active-soup'),
  ]);

  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [
      { date: '2026-01-19', slot: 'dinner', recipe: 'missing-soup' },
      { date: '2026-01-19', slot: 'lunch', recipe: 'active-soup' },
      { date: '2026-01-20', slot: 'snack', recipe: 'retired-soup' },
    ],
  });

  assert.equal(result.status, 'refused');
  assert.deepEqual(result.refused_choices, [
    { date: '2026-01-19', slot: 'dinner', slug: 'missing-soup', reasons: [{ why: 'not-found' }] },
    { date: '2026-01-20', slot: 'snack', slug: 'retired-soup', reasons: [{ why: 'retired' }] },
  ]);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }), '');
});

const perServing = (sodium) => ({ calories: 400, protein: 20, fat: 10, saturated_fat: 2, carbs: 50, fiber: 5, sugar: 5, sodium, cholesterol: 0 });
const measured = (slug, sodium, { ingredients, frontmatter } = {}) =>
  recipe(slug, { ingredients, frontmatter: { nutrition_status: 'complete', nutrition_per_serving: perServing(sodium), ...frontmatter } });
const goalsFile = { path: 'data/health-goals/goals.json', content: '{"goal":"Lower sodium","targets":{"sodium":{"max":2300}},"set":"2026-01-10","updated":"2026-01-10"}\n' };

test('with no declared goal, planning has no health output', () => {
  const root = makeRoot([measured('soup', 2500)]);
  const result = planWeek(root, { weekStart: '2026-01-19', meals: [{ date: '2026-01-19', slot: 'dinner', recipe: 'soup' }] });
  assert.equal(result.status, 'saved');
  assert.equal(result.health_suggestions, undefined);
});

test('with a declared goal, the saved plan gets advisory health suggestions that never override the dietary gate', () => {
  const root = makeRoot([
    measured('soup', 2500),
    measured('cheesy', 100, { ingredients: ['30 g parmesan'], frontmatter: { dietary_flags: ['contains-dairy'] } }),
    ruleset([{ name: 'Alex Example', hard_constraints: ['dairy'] }]),
    goalsFile,
  ]);
  const result = planWeek(root, { weekStart: '2026-01-19', meals: [{ date: '2026-01-19', slot: 'dinner', recipe: 'soup' }] });
  assert.deepEqual(result.meals.map((meal) => meal.slug), ['soup']);
  assert.equal(result.health_suggestions.status, 'advisory');
  assert.equal(result.health_suggestions.footer, 'Chef gives general information, not medical advice.');
  assert.deepEqual(result.health_suggestions.targets[0].over_daily_max, [{ date: '2026-01-19', slot: 'dinner', slug: 'soup', per_serving: 2500 }]);
  assert.doesNotMatch(JSON.stringify(result.health_suggestions), /cheesy/);
});

test('nutrition and health suggestions are per planned meal, so one recipe at two slots on a day stays two meals', () => {
  const root = makeRoot([measured('soup', 2500), goalsFile]);
  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [{ date: '2026-01-19', slot: 'lunch', recipe: 'soup' }, { date: '2026-01-19', slot: 'dinner', recipe: 'soup', servings: 2 }],
  });
  assert.deepEqual(result.nutrition.meals.map(({ date, slot, slug, servings }) => [date, slot, slug, servings]), [
    ['2026-01-19', 'lunch', 'soup', 1],
    ['2026-01-19', 'dinner', 'soup', 2],
  ]);
  assert.equal(result.nutrition.totals.calories, 1200);
  assert.deepEqual(result.health_suggestions.targets[0].over_daily_max, [
    { date: '2026-01-19', slot: 'lunch', slug: 'soup', per_serving: 2500 },
    { date: '2026-01-19', slot: 'dinner', slug: 'soup', per_serving: 2500 },
  ]);
});
