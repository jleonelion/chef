import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { prepareSandbox, sandboxEnv } from '../lib/sandbox.mjs';
import { assertCase } from '../tier1/assertions.mjs';
import { checkFiles } from './report.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const row = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'))
  .find(({ id }) => id === 'chef-add-recipe-pasted-text');

test('pasted-recipe storage checks require exactly one intact new source and a searchable recipe', async (t) => {
  const { tmp, dataRoot } = prepareSandbox({
    prefix: 'chef-source-check',
    id: 'pasted-recipe',
    fixture: path.join(repo, 'fixtures/data-root'),
    author: 'eval-test',
  });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const prompt = fs.readFileSync(path.join(repo, row.turns[0].turnFile), 'utf8');
  const source = prompt.slice(prompt.indexOf('Tomato Lentil Soup'));
  const sourceFile = path.join(tmp, 'recipe.txt');
  const draftFile = path.join(tmp, 'draft.json');
  fs.writeFileSync(sourceFile, source);
  fs.writeFileSync(draftFile, JSON.stringify({
    title: 'Tomato Lentil Soup',
    servings: 4,
    prep_minutes: 10,
    cook_minutes: 30,
    ingredients: ['1 cup red lentils', '400 g crushed tomatoes', '1 onion', '4 cups vegetable stock'],
    steps: [
      'Soften the chopped onion in a pot.',
      'Add the lentils, tomatoes and stock.',
      'Simmer for 25 minutes until the lentils are soft.',
    ],
  }));
  const env = sandboxEnv(dataRoot, { CHEF_USDA_FDC_KEY: '' });
  const result = JSON.parse(execFileSync(process.execPath, [
    path.join(repo, 'src/skills/chef-add-recipe/scripts/add-recipe.mjs'),
    'draft', '--kind', 'text', '--source', sourceFile, '--draft', draftFile,
  ], { env, encoding: 'utf8' }));
  assert.equal(result.status, 'added');
  await checkFiles(dataRoot, row.files);
  for (const step of row.after) {
    const [command, ...args] = step.command.map((arg) => arg.replaceAll('{skills}', path.join(repo, 'src/skills')));
    const output = JSON.parse(execFileSync(command, args, { env, encoding: 'utf8' }));
    for (const assertion of step.assertions) assertCase(output, assertion);
  }

  const raw = path.join(dataRoot, result.raw[0]);
  fs.writeFileSync(path.join(path.dirname(raw), 'extra.txt'), source);
  await assert.rejects(checkFiles(dataRoot, row.files), /expected 5 files, found 6/);
  fs.unlinkSync(path.join(path.dirname(raw), 'extra.txt'));
  fs.unlinkSync(raw);
  await assert.rejects(checkFiles(dataRoot, row.files), /expected 5 files, found 4/);
  fs.writeFileSync(path.join(path.dirname(raw), 'unrelated.txt'), source);
  await assert.rejects(checkFiles(dataRoot, row.files), /expected 1 files, found 0/);
  fs.unlinkSync(path.join(path.dirname(raw), 'unrelated.txt'));
  fs.writeFileSync(raw, 'Tomato Lentil Soup\n1 cup red lentils\n');
  await assert.rejects(checkFiles(dataRoot, row.files), /missing/);
});
