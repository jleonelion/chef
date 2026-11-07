import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readRuleset, RULESET_PATH } from '../../../../lib/dietary-ruleset.mjs';
import { git } from '../../../../lib/git.mjs';
import { NOTICES_PATH } from '../../../../lib/notices.mjs';
import { TRAINING_NOTICE } from '../../../../lib/safety-text.mjs';
import { initDataRoot } from './init-data-root.mjs';
import { writeRuleset } from './write-ruleset.mjs';

const dataRoot = () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-ruleset-')), 'root');
  initDataRoot(root);
  return root;
};
const DATE = '2026-11-07';

test('"no" to the allergy question records none declared, with no notice', () => {
  const root = dataRoot();
  const result = writeRuleset(root, { none: true }, { date: DATE });
  assert.equal(result.status, 'saved');
  assert.equal(readRuleset(root).status, 'none-declared');
  assert.equal(result.notice, undefined);
  assert.equal(git(root, ['status', '--porcelain']), '');
});

test('free-text entries are stored as canonical names and reported as read', () => {
  const root = dataRoot();
  const result = writeRuleset(root, { member: 'Alex Example', hard: ['peanut allergy', 'Tree-nut'] }, { date: DATE });
  assert.deepEqual(result.read_as, [
    { entry: 'peanut allergy', read_as: ['peanuts'] },
    { entry: 'Tree-nut', read_as: ['tree-nuts'] },
  ]);
  assert.deepEqual(result.ruleset.members[0].hard_constraints, ['peanuts', 'tree-nuts']);
  assert.match(fs.readFileSync(path.join(root, RULESET_PATH), 'utf8'), /hard_constraints:\n\s+- peanuts\n\s+- tree-nuts/);
});

test('a first hard constraint saves the ruleset and shows the training notice once', () => {
  const root = dataRoot();
  const first = writeRuleset(root, { member: 'Alex Example', hard: ['Celiac', 'mustard'] }, { date: DATE });
  assert.equal(first.status, 'saved');
  assert.equal(first.notice, TRAINING_NOTICE);
  assert.equal(first.caveats.length, 1);
  assert.deepEqual(readRuleset(root).hard.map((h) => h.constraint), ['gluten', 'mustard']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, NOTICES_PATH), 'utf8')), { 'training-setting': DATE });
  assert.match(fs.readFileSync(path.join(root, RULESET_PATH), 'utf8'), /Alex Example.*gluten, mustard/);

  const second = writeRuleset(root, { member: 'Sam Example', hard: ['egg'], avoid: ['olives'] }, { date: DATE });
  assert.equal(second.notice, undefined);
  assert.equal(readRuleset(root).members.length, 2);
});

test('avoidances alone never trigger the notice', () => {
  const root = dataRoot();
  assert.equal(writeRuleset(root, { member: 'Sam Example', avoid: ['olives'] }, { date: DATE }).notice, undefined);
});

test('"none" never wipes declared rules, and removals are reported', () => {
  const root = dataRoot();
  writeRuleset(root, { member: 'Alex Example', hard: ['gluten', 'egg'] }, { date: DATE });
  assert.equal(writeRuleset(root, { none: true }, { date: DATE }).status, 'refused');
  const removed = writeRuleset(root, { member: 'Alex Example', hard: ['gluten'] }, { date: DATE });
  assert.deepEqual(removed.removed_hard_constraints, ['egg']);
});

test('invalid input and an unreadable page', () => {
  const root = dataRoot();
  assert.equal(writeRuleset(root, { member: 'Alex Example' }, { date: DATE }).status, 'invalid-input');
  assert.equal(writeRuleset(root, { hard: ['egg'] }, { date: DATE }).status, 'invalid-input');
  fs.mkdirSync(path.dirname(path.join(root, RULESET_PATH)), { recursive: true });
  fs.writeFileSync(path.join(root, RULESET_PATH), '---\nmembers: [\n---\n');
  const refused = writeRuleset(root, { member: 'Alex Example', hard: ['egg'] }, { date: DATE });
  assert.equal(refused.status, 'refused');
  assert.match(refused.content, /members/);
  assert.equal(writeRuleset(root, { member: 'Alex Example', hard: ['egg'] }, { date: DATE, rewrite: true }).status, 'saved');
});
