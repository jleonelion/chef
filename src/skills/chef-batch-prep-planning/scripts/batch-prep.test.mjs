import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { serializePage } from '../../../lib/frontmatter.mjs';

const roots = [];
const script = fileURLToPath(new URL('./batch-prep.mjs', import.meta.url));

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function recipe(slug, title, steps) {
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
      },
      `# ${title}\n\n## Ingredients\n\n- 1 cup vegetables\n\n## Steps\n\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n`,
    ),
  };
}

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-batch-prep-test-'));
  roots.push(root);
  const files = [
    recipe('tomato-soup', 'Tomato Soup', ['Chop the vegetables.', 'Simmer the soup.']),
    recipe('herbed-rice', 'Herbed Rice', ['Rinse the rice.', 'Cook until tender.']),
    {
      path: 'knowledge/wiki/meal-plans/2026-01-19.md',
      content: serializePage(
        {
          type: 'meal-plan',
          title: 'Meal plan: week of 2026-01-19',
          week_start: '2026-01-19',
          created: '2026-01-15',
          household_profile: null,
          servings_source: 'default',
          meals: [
            { date: '2026-01-19', slug: 'tomato-soup', title: 'Tomato Soup', servings: 2 },
            { date: '2026-01-20', slug: 'herbed-rice', title: 'Herbed Rice', servings: 2 },
          ],
          nutrition: { status: 'incomplete', missing: [] },
          dietary: { status: 'none-declared' },
          inventory: { items_considered: 0 },
        },
        '# Meal plan\n',
      ),
    },
  ];
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":1}\n');
  for (const file of files) {
    const target = path.join(root, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Prep Test', '-c', 'user.email=prep-test@example.com', 'commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

test('saved meal plan renders as a valid committed PDF with one page per recipe', async () => {
  const root = makeRoot();

  const output = JSON.parse(execFileSync(process.execPath, [script, 'render', '--week-start', '2026-01-19'], {
    env: { ...process.env, CHEF_DATA_ROOT: root },
    encoding: 'utf8',
  }));

  assert.equal(output.status, 'rendered');
  assert.equal(output.path, 'data/batch-prep-plans/2026-01-19.pdf');
  assert.equal(output.attachment, undefined);
  const pdf = await PDFDocument.load(fs.readFileSync(path.join(root, output.path)));
  assert.equal(pdf.getPageCount(), 2);
  assert.match(pdf.getSubject(), /Tomato Soup/);
  assert.match(pdf.getSubject(), /Herbed Rice/);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }), '');
});
