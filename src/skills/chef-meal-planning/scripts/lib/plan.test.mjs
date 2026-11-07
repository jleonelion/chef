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

test('chosen day slots stay ordered and only empty slots are auto-filled', () => {
  const root = makeRoot([recipe('alpha'), recipe('beta'), recipe('gamma')]);

  const result = planWeek(root, { weekStart: '2026-01-19', days: 3, slots: ['beta', '', 'alpha'] });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.meals.map((meal) => meal.slug), ['beta', 'gamma', 'alpha']);
  assert.equal(fs.existsSync(path.join(root, 'knowledge/wiki/meal-plans/2026-01-19.md')), true);
});
