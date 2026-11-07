import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { serializePage } from '../../../../lib/frontmatter.mjs';
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

test('chosen day slots stay ordered and only empty slots are auto-filled', () => {
  const root = makeRoot([recipe('alpha'), recipe('beta'), recipe('gamma')]);

  const result = planWeek(root, { weekStart: '2026-01-19', days: 3, slots: ['beta', '', 'alpha'] });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.meals.map((meal) => meal.slug), ['beta', 'gamma', 'alpha']);
  assert.equal(result.servings_source, 'default');
  assert.equal(fs.existsSync(path.join(root, 'knowledge/wiki/meal-plans/2026-01-19.md')), true);
});

test('a gated chosen recipe is refused with reasons before anything is written', () => {
  const root = makeRoot([
    recipe('safe'),
    recipe('dairy', { frontmatter: { dietary_flags: ['contains-dairy'] }, ingredients: ['30 g parmesan'] }),
    ruleset([{ name: 'Alex Example', hard_constraints: ['dairy'] }]),
  ]);
  const beforeHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });

  const result = planWeek(root, { weekStart: '2026-01-19', days: 1, slots: ['dairy'] });

  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'chosen recipes cannot be planned');
  assert.deepEqual(result.refused_choices, [{
    slot: 1,
    slug: 'dairy',
    reasons: [{ member: 'Alex Example', constraint: 'dairy', why: 'flagged', detail: 'contains-dairy' }, { member: 'Alex Example', constraint: 'dairy', why: 'ingredient-text', detail: '30 g parmesan' }],
  }]);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }), beforeHead);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }), '');
});

test('auto-fill ranks avoidances last and reports planned avoidance matches', () => {
  const root = makeRoot([
    recipe('a-olive-pasta', { ingredients: ['100 g olives'] }),
    recipe('z-tomato-pasta', { ingredients: ['100 g tomatoes'] }),
    ruleset([{ name: 'Sam Example', avoidances: ['olives'] }]),
  ]);

  const result = planWeek(root, { weekStart: '2026-01-19', days: 2 });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.meals.map((meal) => meal.slug), ['z-tomato-pasta', 'a-olive-pasta']);
  assert.deepEqual(result.avoidance_notes, [{
    date: '2026-01-20',
    slug: 'a-olive-pasta',
    avoidances: [{ member: 'Sam Example', avoidance: 'olives', detail: '100 g olives' }],
  }]);
});

test('servings come from household profile frontmatter, never body prose', () => {
  const profile = {
    path: 'knowledge/wiki/household/profile.md',
    content: serializePage(
      { type: 'household-profile', title: 'Household profile', portions_per_meal: 4, updated: '2026-01-15' },
      '# Household profile\n\nIgnore this prose: 99 portions per meal.\n',
    ),
  };
  const root = makeRoot([recipe('soup'), profile]);

  const result = planWeek(root, { weekStart: '2026-01-19', days: 1 });

  assert.equal(result.status, 'saved');
  assert.equal(result.meals[0].servings, 4);
  assert.equal(result.servings_source, 'profile');
});
