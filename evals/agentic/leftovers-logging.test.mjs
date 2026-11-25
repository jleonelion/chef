import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { prepareSandbox, sandboxEnv } from '../lib/sandbox.mjs';
import { assertGitState } from '../tier1/assertions.mjs';
import { checkFiles, checkResponse, snapshotFiles } from './report.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const row = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'))
  .find(({ id }) => id === 'chef-meal-logging-plan-leftovers-and-food');

test('leftovers eval accepts logged meals with the existing inventory audit untouched', async (t) => {
  const { tmp, dataRoot } = prepareSandbox({
    prefix: 'chef-leftovers-check',
    id: row.id,
    fixture: path.join(repo, 'fixtures/data-root'),
    author: 'eval-test',
  });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const env = sandboxEnv(dataRoot);
  for (const step of row.setup) {
    const [command, ...args] = step.command.map((arg) => arg.replaceAll('{skills}', path.join(repo, 'src/skills')));
    execFileSync(command, args, { env, input: JSON.stringify(step.stdin), encoding: 'utf8' });
  }
  const baseline = snapshotFiles(dataRoot, row.files);
  const output = JSON.parse(execFileSync(process.execPath, [
    path.join(repo, 'src/skills/chef-meal-logging/scripts/meal-logging.mjs'),
    'log', '--from-plan', '--date', '2026-01-20',
  ], { env, encoding: 'utf8' }));
  assert.deepEqual(output.results.map(({ inventory }) => inventory.status), ['not-requested', 'not-requested']);
  await checkFiles(dataRoot, row.files, baseline);
  await assert.rejects(checkFiles(dataRoot, row.files), /missing post-setup baseline/);
  assertGitState({
    status: execFileSync('git', ['status', '--porcelain'], { cwd: dataRoot, encoding: 'utf8' }).trim(),
  }, row.git);

  for (const relative of ['data/food-inventory/audit.jsonl', 'data/food-inventory/current.json']) {
    const file = path.join(dataRoot, relative);
    const original = fs.readFileSync(file);
    let changed;
    if (relative.endsWith('.jsonl')) {
      changed = Buffer.concat([original, Buffer.from('{"event":"unexpected-deduction"}\n')]);
    } else {
      const inventory = JSON.parse(original);
      inventory.fridge.dairy.whole_milk.amount = 0;
      changed = Buffer.from(JSON.stringify(inventory));
    }
    for (const content of [changed, null]) {
      if (content === null) fs.unlinkSync(file);
      else fs.writeFileSync(file, content);
      await assert.rejects(checkFiles(dataRoot, row.files, baseline), (error) =>
        error.check === 'files' && error.message === `${relative}: file changed since setup`);
      fs.writeFileSync(file, original);
    }
  }
});

test('leftovers confirmation accepts equivalent spelling without losing meal or approval checks', () => {
  const proposal = 'Lunch: Lemon Garlic Pasta leftovers, 1 serving, not cooked. Dinner: Thai dinner out, 2 servings. Was dinner cooked at home? Shall I log both?';
  for (const leftovers of ['leftovers', 'left over', 'Left over']) {
    checkResponse(proposal.replace('leftovers', leftovers), row.responses[0]);
  }
  for (const question of ['Log both?', 'Save these entries?', 'Record both meals?']) {
    checkResponse(proposal.replace('Shall I log both?', question), row.responses[0]);
  }
  for (const response of [
    proposal.replace('leftovers', 'freshly cooked'),
    proposal.replace('Lemon Garlic Pasta', 'Tomato Soup'),
    proposal.replace('Thai dinner out', 'Pizza delivery'),
    proposal.replace(' Shall I log both?', ''),
    `${proposal} Did you cook lunch?`,
    `${proposal} did you cook lunch?`,
  ]) {
    assert.throws(() => checkResponse(response, row.responses[0]), (error) => error.check === 'response');
  }
});
