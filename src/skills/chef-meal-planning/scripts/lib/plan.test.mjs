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

function profile(frontmatter) {
  return {
    path: 'knowledge/wiki/household/profile.md',
    content: serializePage(
      { type: 'household-profile', title: 'Household profile', updated: '2026-01-15', ...frontmatter },
      '# Household profile\n',
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
  assert.deepEqual(result.meals, saved.map((meal) => ({ ...meal, cook_servings: meal.servings })));
});

const invalidInputs = [
  ['input that is not a list', { date: '2026-01-19', slot: 'dinner', recipe: 'bean-chili' }, 'meals: must be a list of planned meals'],
  ['an empty list', [], 'meals: must list at least one planned meal'],
  ['an unknown slot', [{ date: '2026-01-19', slot: 'brunch', recipe: 'bean-chili' }], 'meals[0].slot: must be breakfast, lunch, dinner or snack'],
  ['a day past the end of the month', [{ date: '2026-02-30', slot: 'dinner', recipe: 'bean-chili' }], 'meals[0].date: must be a real YYYY-MM-DD date'],
  ['a day no month has', [{ date: '2026-01-32', slot: 'dinner', recipe: 'bean-chili' }], 'meals[0].date: must be a real YYYY-MM-DD date'],
  ['a date outside the week', [{ date: '2026-01-26', slot: 'dinner', recipe: 'bean-chili' }], 'meals[0].date: must fall in the week starting 2026-01-19'],
  ['no recipe, food or leftovers', [{ date: '2026-01-19', slot: 'dinner' }], 'meals[0]: must name exactly one of recipe, food or leftovers_of'],
  ['both a recipe and food', [{ date: '2026-01-19', slot: 'dinner', recipe: 'bean-chili', food: 'Pizza' }], 'meals[0]: must name exactly one of recipe, food or leftovers_of'],
  ['a recipe that is not a slug', [{ date: '2026-01-19', slot: 'dinner', recipe: 3 }], 'meals[0].recipe: must be a recipe slug'],
  ['empty food', [{ date: '2026-01-19', slot: 'dinner', food: '  ' }], 'meals[0].food: must be non-empty text'],
  ['leftovers_of that is not a meal', [{ date: '2026-01-19', slot: 'dinner', leftovers_of: { date: '2026-01-19', slot: 'brunch' } }], 'meals[0].leftovers_of: must be {date, slot} with a real YYYY-MM-DD date and a known slot'],
  ['leftovers of a meal not in the plan', [{ date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' } }], 'meals[0].leftovers_of: no planned meal at 2026-01-19 dinner in this plan'],
  ['leftovers of the same meal', [{ date: '2026-01-19', slot: 'dinner', leftovers_of: { date: '2026-01-19', slot: 'dinner' } }], 'meals[0].leftovers_of: 2026-01-19 dinner must be an earlier planned meal'],
  ['leftovers of a later meal', [
    { date: '2026-01-19', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' } },
    { date: '2026-01-19', slot: 'dinner', recipe: 'bean-chili' },
  ], 'meals[0].leftovers_of: 2026-01-19 dinner must be an earlier planned meal'],
  ['leftovers of free-text food', [
    { date: '2026-01-19', slot: 'dinner', food: 'Dinner out' },
    { date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' } },
  ], 'meals[1].leftovers_of: 2026-01-19 dinner is free-text food, not a saved recipe'],
  ['leftovers of leftovers', [
    { date: '2026-01-19', slot: 'dinner', recipe: 'bean-chili' },
    { date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' } },
    { date: '2026-01-20', slot: 'dinner', leftovers_of: { date: '2026-01-20', slot: 'lunch' } },
  ], 'meals[2].leftovers_of: 2026-01-20 lunch is itself leftovers; point to the meal that cooked the dish'],
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
  const root = makeRoot([recipe('soup'), profile({ portions_per_meal: 4 })]);

  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [{ date: '2026-01-19', slot: 'dinner', recipe: 'soup' }, { date: '2026-01-20', slot: 'dinner', recipe: 'soup', servings: 2 }],
  });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.meals.map((meal) => meal.servings), [4, 2]);
  assert.equal(result.servings_source, 'profile');
  assert.equal(result.nutrition_by_member, undefined);
  assert.deepEqual(result.household, { path: 'knowledge/wiki/household/profile.md', servings: 4, servings_source: 'profile' });
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
const measured = (slug, sodium, { title, ingredients, frontmatter } = {}) =>
  recipe(slug, { title, ingredients, frontmatter: { nutrition_status: 'complete', nutrition_per_serving: perServing(sodium), ...frontmatter } });
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

// The leftover chain and a dinner out: Monday dinner eats 2 and cooks 2 more for Tuesday lunch.
const chainMeals = [
  { date: '2026-01-20', slot: 'dinner', food: 'Dinner out: Thai', servings: 2 },
  { date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' }, servings: 2 },
  { date: '2026-01-19', slot: 'dinner', recipe: 'chili', servings: 2 },
];

test('free-text food and leftovers save in their own shapes; the cooking meal reports its amount to cook', () => {
  const root = makeRoot([measured('chili', 500, { title: 'Chili' })]);

  const result = planWeek(root, { weekStart: '2026-01-19', meals: chainMeals });

  assert.equal(result.status, 'saved');
  const page = parsePage(fs.readFileSync(path.join(root, result.path), 'utf8'));
  assert.deepEqual(page.frontmatter.meals, [
    { date: '2026-01-19', slot: 'dinner', slug: 'chili', title: 'Chili', servings: 2 },
    { date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' }, slug: 'chili', title: 'Chili', servings: 2 },
    { date: '2026-01-20', slot: 'dinner', food: 'Dinner out: Thai', servings: 2 },
  ]);
  assert.deepEqual(result.meals.map((meal) => meal.cook_servings), [4, undefined, undefined]);
  assert.match(page.body, /\| 2026-01-19 \| dinner \| Chili \| 2 \(cook 4\) \|/);
  assert.match(page.body, /\| 2026-01-20 \| lunch \| Leftovers: Chili \(from 2026-01-19 dinner\) \| 2 \|/);
  assert.match(page.body, /\| 2026-01-20 \| dinner \| Dinner out: Thai \| 2 \|/);
});

test('nutrition counts leftovers at servings eaten and lists free-text food as unmeasured without going incomplete', () => {
  const root = makeRoot([measured('chili', 500, { title: 'Chili' }), goalsFile]);

  const result = planWeek(root, { weekStart: '2026-01-19', meals: chainMeals });

  assert.equal(result.nutrition.status, 'complete');
  assert.deepEqual(result.nutrition.meals.map(({ date, slot, slug, servings }) => [date, slot, slug, servings]), [
    ['2026-01-19', 'dinner', 'chili', 2],
    ['2026-01-20', 'lunch', 'chili', 2],
  ]);
  assert.equal(result.nutrition.totals.calories, 1600);
  assert.deepEqual(result.nutrition.unmeasured, [{ date: '2026-01-20', slot: 'dinner', food: 'Dinner out: Thai' }]);
  assert.equal(result.health_suggestions.status, 'advisory');
  assert.match(result.health_suggestions.basis, /free-text meals are not counted/);
});

test('a roster defaults eaters and servings, while a subset and explicit servings stay attributable', () => {
  const members = [{ name: 'Alex Example' }, { name: 'Sam Example' }, { name: 'Jo Example' }];
  const root = makeRoot([measured('soup', 100), profile({ members })]);

  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [
      { date: '2026-01-19', slot: 'dinner', recipe: 'soup' },
      { date: '2026-01-20', slot: 'dinner', recipe: 'soup', eaters: ['Alex Example', 'Jo Example'] },
      { date: '2026-01-21', slot: 'dinner', recipe: 'soup', servings: 5 },
    ],
  });

  assert.equal(result.status, 'saved');
  assert.equal(result.servings_source, 'roster');
  assert.deepEqual(result.meals.map(({ servings, eaters }) => ({ servings, eaters })), [
    { servings: 3, eaters: ['Alex Example', 'Sam Example', 'Jo Example'] },
    { servings: 2, eaters: ['Alex Example', 'Jo Example'] },
    { servings: 5, eaters: ['Alex Example', 'Sam Example', 'Jo Example'] },
  ]);
  assert.equal(result.nutrition.totals.calories, 4000);
  assert.equal(result.nutrition_by_member.unattributed_servings, 2);
  assert.deepEqual(result.nutrition_by_member.members.map(({ name, totals }) => [name, totals.calories]), [
    ['Alex Example', 1200],
    ['Sam Example', 800],
    ['Jo Example', 1200],
  ]);
  assert.deepEqual(result.nutrition_by_member.members[0].days.map(({ date, totals }) => [date, totals.calories]), [
    ['2026-01-19', 400],
    ['2026-01-20', 400],
    ['2026-01-21', 400],
  ]);
});

test('incomplete nutrition blocks only members who eat that meal', () => {
  const members = [{ name: 'Alex Example' }, { name: 'Sam Example' }];
  const root = makeRoot([
    measured('soup', 100),
    recipe('mystery-stew', { frontmatter: { nutrition_status: 'incomplete' } }),
    profile({ members }),
  ]);

  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [
      { date: '2026-01-19', slot: 'dinner', recipe: 'soup' },
      { date: '2026-01-20', slot: 'dinner', recipe: 'mystery-stew', eaters: ['Alex Example'] },
    ],
  });

  const [alex, sam] = result.nutrition_by_member.members;
  assert.equal(alex.status, 'incomplete');
  assert.deepEqual(alex.missing, [{ date: '2026-01-20', slot: 'dinner', slug: 'mystery-stew', reason: 'recipe nutrition is not complete' }]);
  assert.equal(alex.days[1].status, 'incomplete');
  assert.equal(alex.totals, undefined);
  assert.equal(sam.status, 'complete');
  assert.equal(sam.totals.calories, 400);
  assert.deepEqual(sam.days.map(({ date }) => date), ['2026-01-19']);
});

test('explicit servings stay the household amount even below the eater count, and free-text surplus is reported', () => {
  const members = [{ name: 'Alex Example' }, { name: 'Sam Example' }];
  const root = makeRoot([measured('soup', 100), profile({ members })]);

  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [
      { date: '2026-01-19', slot: 'dinner', recipe: 'soup', servings: 1 },
      { date: '2026-01-20', slot: 'dinner', food: 'Dinner out', servings: 4 },
    ],
  });

  assert.equal(result.status, 'saved');
  assert.equal(result.nutrition.totals.calories, 400);
  assert.deepEqual(result.nutrition_by_member.members.map(({ totals }) => totals.calories), [400, 400]);
  assert.equal(result.nutrition_by_member.unattributed_servings, 2);
});

test('unknown eater and dietary-rule names are invalid input and save nothing', () => {
  const members = [{ name: 'Alex Example' }];
  for (const [files, meals, problem] of [
    [[measured('soup', 100)], [{ date: '2026-01-19', slot: 'dinner', recipe: 'soup', eaters: ['Alex Example'] }], 'meals[0].eaters: household roster is not configured'],
    [[measured('soup', 100), profile({ members })], [{ date: '2026-01-19', slot: 'dinner', recipe: 'soup', eaters: ['Unknown Example'] }], 'meals[0].eaters: unknown household member "Unknown Example"'],
    [[measured('soup', 100), profile({ members }), ruleset([{ name: 'Unknown Example', avoidances: ['olives'] }])], [{ date: '2026-01-19', slot: 'dinner', recipe: 'soup' }], 'dietary ruleset: unknown household member "Unknown Example"'],
  ]) {
    const root = makeRoot(files);
    const beforeHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });

    const result = planWeek(root, { weekStart: '2026-01-19', meals });

    assert.equal(result.status, 'invalid-input');
    assert.deepEqual(result.problems, [problem]);
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }), beforeHead);
  }
});

test('a refused recipe with leftovers is refused once, at the cooking meal', () => {
  const root = makeRoot([
    recipe('dairy', { frontmatter: { dietary_flags: ['contains-dairy'] } }),
    ruleset([{ name: 'Alex Example', hard_constraints: ['dairy'] }]),
  ]);

  const result = planWeek(root, {
    weekStart: '2026-01-19',
    meals: [
      { date: '2026-01-19', slot: 'dinner', recipe: 'dairy' },
      { date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' } },
      { date: '2026-01-20', slot: 'dinner', food: 'Cheese pizza out' },
    ],
  });

  assert.equal(result.status, 'refused');
  assert.deepEqual(result.refused_choices.map(({ date, slot, slug }) => [date, slot, slug]), [['2026-01-19', 'dinner', 'dairy']]);
});

test('the calendar payload titles free-text food by its text and leftovers by their recipe', () => {
  const root = makeRoot([
    measured('chili', 500, { title: 'Chili' }),
    { path: 'settings.json', content: '{"settings_version":1,"calendar":"Household meals"}\n' },
  ]);

  const result = planWeek(root, { weekStart: '2026-01-19', meals: chainMeals });

  assert.deepEqual(result.calendar.events, [
    { date: '2026-01-19', slot: 'dinner', title: 'Chili', recipe_slug: 'chili' },
    { date: '2026-01-20', slot: 'lunch', title: 'Leftovers: Chili', recipe_slug: 'chili' },
    { date: '2026-01-20', slot: 'dinner', title: 'Dinner out: Thai' },
  ]);
});

test('a week of only free-text food saves, and health suggestions say there is nothing to compare', () => {
  const root = makeRoot([goalsFile]);

  const result = planWeek(root, { weekStart: '2026-01-19', meals: [{ date: '2026-01-19', slot: 'dinner', food: 'Dinner out' }] });

  assert.equal(result.status, 'saved');
  assert.equal(result.health_suggestions.status, 'unavailable');
  assert.match(result.health_suggestions.reason, /no planned recipe meals/);
});
