import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { readPdf } from '../../../../evals/tier1/pdf.mjs';
import { serializePage } from '../../../lib/frontmatter.mjs';

const roots = [];
const script = fileURLToPath(new URL('./batch-prep.mjs', import.meta.url));

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function recipe(slug, title, steps, extra = {}) {
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
        ...extra,
      },
      `# ${title}\n\n## Ingredients\n\n- 1 cup vegetables\n\n## Steps\n\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n`,
    ),
  };
}

const twoMeals = [
  { date: '2026-01-19', slug: 'tomato-soup', title: 'Tomato Soup', servings: 2 },
  { date: '2026-01-20', slug: 'herbed-rice', title: 'Herbed Rice', servings: 2 },
];

function makeRoot({ riceExtra, meals = twoMeals } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-batch-prep-test-'));
  roots.push(root);
  const files = [
    recipe('tomato-soup', 'Tomato Soup', ['Chop the vegetables.', 'Simmer the soup.']),
    recipe('herbed-rice', 'Herbed Rice', ['Rinse the rice.', 'Cook until tender.'], riceExtra),
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
          meals,
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

const run = (root) => {
  try {
    return { code: 0, output: JSON.parse(execFileSync(process.execPath, [script, 'render', '--week-start', '2026-01-19'], { env: { ...process.env, CHEF_DATA_ROOT: root }, encoding: 'utf8' })) };
  } catch (error) {
    return { code: error.status, output: JSON.parse(error.stdout) };
  }
};

test('a recipe retired since planning is refused and nothing is written', () => {
  const root = makeRoot({ riceExtra: { lifecycle: 'retired', retired: '2026-01-16' } });

  const { code, output } = run(root);

  assert.equal(code, 2);
  assert.equal(output.status, 'refused');
  assert.deepEqual(output.blocked.map((entry) => entry.slug), ['herbed-rice']);
  assert.equal(fs.existsSync(path.join(root, 'data/batch-prep-plans')), false);
});

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

test('a v1 one-per-day plan renders each planned date as dinner', async () => {
  const root = makeRoot();

  const { output } = run(root);

  const { text } = await readPdf(fs.readFileSync(path.join(root, output.path)));
  assert.ok(text.includes('Planned: 2026-01-19 dinner'));
  assert.ok(text.includes('Planned: 2026-01-20 dinner'));
});

test('a leftover chain gets one page showing the amount to cook and the leftovers it feeds; free-text food gets none', async () => {
  const root = makeRoot({
    meals: [
      { date: '2026-01-19', slot: 'dinner', slug: 'tomato-soup', title: 'Tomato Soup', servings: 2 },
      { date: '2026-01-20', slot: 'lunch', leftovers_of: { date: '2026-01-19', slot: 'dinner' }, slug: 'tomato-soup', title: 'Tomato Soup', servings: 2 },
      { date: '2026-01-20', slot: 'dinner', food: 'Dinner out: Thai', servings: 2 },
    ],
  });

  const { output } = run(root);

  assert.equal(output.status, 'rendered');
  assert.equal(output.pages, 1);
  const { text } = await readPdf(fs.readFileSync(path.join(root, output.path)));
  assert.ok(text.includes('Planned: 2026-01-19 dinner'), text);
  assert.ok(text.includes('2026-01-19 dinner: cook 4 servings, including leftovers for 2026-01-20 lunch'), text);
  assert.ok(!text.includes('Dinner out'), text);
});

test('a plan with only free-text food has nothing to prep and writes nothing', () => {
  const root = makeRoot({ meals: [{ date: '2026-01-19', slot: 'dinner', food: 'Dinner out', servings: 2 }] });

  const { code, output } = run(root);

  assert.equal(code, 2);
  assert.equal(output.status, 'not-found');
  assert.match(output.reason, /no recipe meals to prep/);
  assert.equal(fs.existsSync(path.join(root, 'data/batch-prep-plans')), false);
});
