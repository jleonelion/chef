import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { prepareSandbox, sandboxEnv } from '../lib/sandbox.mjs';
import { assertCase, assertGitState } from '../tier1/assertions.mjs';
import { checkFiles } from './report.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const rows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'));
const script = path.join(repo, 'src/skills/chef-food-inventory/scripts/inventory.mjs');

function prepareReceipt(t, row, category, unit, name = 'red lentils') {
  const { tmp, dataRoot } = prepareSandbox({
    prefix: 'chef-receipt-check',
    id: row.id,
    fixture: path.join(repo, 'fixtures/data-root'),
    author: 'eval-test',
    afterCommitSeed: row.seed,
  });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const env = sandboxEnv(dataRoot);
  const transcript = path.join(tmp, 'transcript.txt');
  fs.writeFileSync(transcript, [
    '- 1 gal whole milk - $3.49',
    '- 2.1 lb bananas - $1.26',
    `- 1 ${unit} ${name} - $2.19 -> pantry.${category}`,
  ].join('\n'));
  const result = JSON.parse(execFileSync(process.execPath, [
    script, 'add-receipt', '--transcript-file', transcript, '--date', '2026-01-20',
  ], { env, encoding: 'utf8' }));
  assert.equal(result.status, 'added');
  return { dataRoot, env };
}

function checkAfter(row, env) {
  for (const step of row.after) {
    const [command, ...args] = step.command.map((arg) => arg.replaceAll('{skills}', path.join(repo, 'src/skills')));
    const output = JSON.parse(execFileSync(command, args, { env, encoding: 'utf8' }));
    for (const assertion of step.assertions) assertCase(output, assertion);
  }
}

test('dry receipt eval accepts one pound of lentils in legumes or grains', async (t) => {
  const row = rows.find(({ id }) => id === 'chef-food-inventory-receipt-to-inventory');
  for (const [category, name] of [
    ['legumes', 'red lentils'], ['grains', 'red lentils'],
    ['legumes', 'dry red lentils'], ['grains', 'dry red lentils'],
  ]) {
    const { dataRoot, env } = prepareReceipt(t, row, category, 'lb', name);
    await checkFiles(dataRoot, row.files);
    checkAfter(row, env);
    assertGitState({
      status: execFileSync('git', ['status', '--porcelain'], { cwd: dataRoot, encoding: 'utf8' }).trim(),
    }, row.git);
    const receipt = fs.readFileSync(path.join(dataRoot, row.seed[0].path), 'utf8');
    assert.match(receipt, /\bDRY RED LENTILS 1 LB\b/);
    assert.doesNotMatch(receipt, /\bCANNED\b/);
  }
});

test('canned receipt eval requires one can of lentils in canned', async (t) => {
  const row = rows.find(({ id }) => id === 'chef-food-inventory-canned-receipt-to-inventory');
  assert.ok(row, 'the canned receipt scenario exists');
  for (const name of ['red lentils', 'canned red lentils']) {
    const { dataRoot, env } = prepareReceipt(t, row, 'canned', 'can', name);
    await checkFiles(dataRoot, row.files);
    checkAfter(row, env);
    assertGitState({
      status: execFileSync('git', ['status', '--porcelain'], { cwd: dataRoot, encoding: 'utf8' }).trim(),
    }, row.git);
    const receipt = fs.readFileSync(path.join(dataRoot, row.seed[0].path), 'utf8');
    assert.match(receipt, /\bCANNED RED LENTILS 1 CAN\b/);
    assert.doesNotMatch(receipt, /\bDRY\b/);
  }
});

for (const scenario of [
  { id: 'chef-food-inventory-receipt-to-inventory', category: 'legumes', unit: 'lb', wrongCategory: 'canned', qualified: 'dry red lentils', wrongForm: 'canned red lentils' },
  { id: 'chef-food-inventory-canned-receipt-to-inventory', category: 'canned', unit: 'can', wrongCategory: 'legumes', qualified: 'canned red lentils', wrongForm: 'dry red lentils' },
]) {
  test(`${scenario.id} rejects incorrect lentils and non-food inventory`, async (t) => {
    const row = rows.find(({ id }) => id === scenario.id);
    const { env } = prepareReceipt(t, row, scenario.category, scenario.unit);
    const view = JSON.parse(execFileSync(process.execPath, [script, 'view'], { env, encoding: 'utf8' }));
    const assertions = row.after.find(({ command }) => command.at(-1) === 'view').assertions;
    const check = (output) => {
      for (const assertion of assertions) assertCase(output, assertion);
    };
    const lentils = view.items.find(({ name }) => name === 'red lentils');
    const cases = [
      ['missing lentils', (output) => { output.items = output.items.filter(({ name }) => name !== 'red lentils'); }, /red lentils.*path/],
      ['wrong category', (output) => { output.items.find(({ name }) => name === 'red lentils').path = `pantry.${scenario.wrongCategory}.red_lentils`; }, /red lentils.*path/],
      ['wrong amount', (output) => { output.items.find(({ name }) => name === 'red lentils').amount = 2; }, /red lentils.*amount/],
      ['wrong unit', (output) => { output.items.find(({ name }) => name === 'red lentils').unit = scenario.unit === 'lb' ? 'can' : 'lb'; }, /red lentils.*unit/],
      ['wrong storage form', (output) => { output.items.find(({ name }) => name === 'red lentils').name = scenario.wrongForm; }, /red lentils.*path/],
      ['wrong lentil variety', (output) => { output.items.find(({ name }) => name === 'red lentils').name = 'green lentils'; }, /red lentils.*path/],
      ['duplicate lentils under another name', (output) => { output.items.push({ ...lentils, name: scenario.qualified, path: `pantry.other.${scenario.qualified.replaceAll(' ', '_')}` }); }, /red lentils.*path/],
      ['reusable bag under another name', (output) => { output.items.push({ name: 'Reusable Bag', path: 'pantry.other.reusable_bag', amount: 1, unit: 'each' }); }, /items\.length/],
    ];
    for (const location of ['pantry', 'fridge', 'freezer']) {
      cases.push(
        [`duplicate lentils in ${location}`, (output) => { output.items.push({ ...lentils, path: `${location}.other.red_lentils` }); }, /red lentils.*path/],
        [`reusable bag in ${location}`, (output) => { output.items.push({ name: 'reusable bag', path: `${location}.other.reusable_bag`, amount: 1, unit: 'each' }); }, /unexpected "reusable bag"/],
      );
    }
    for (const [name, mutate, expected] of cases) {
      await t.test(name, () => {
        const output = structuredClone(view);
        mutate(output);
        assert.throws(() => check(output), expected);
      });
    }
  });
}
