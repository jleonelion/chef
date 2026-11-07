import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { dietaryNotes, flagFor, normalizeConstraints, readRuleset, RULESET_PATH } from './dietary-ruleset.mjs';
import { GUARANTEE_LINE, NEVER_ASKED_NUDGE } from './safety-text.mjs';

const root = (page) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-ruleset-'));
  if (page !== undefined) {
    fs.mkdirSync(path.dirname(path.join(dir, RULESET_PATH)), { recursive: true });
    fs.writeFileSync(path.join(dir, RULESET_PATH), page);
  }
  return dir;
};
const page = (members) => `---\ntype: dietary-ruleset\ntitle: Dietary ruleset\nmembers: ${JSON.stringify(members)}\n---\n# Dietary ruleset\n`;

test('constraint names normalize to the flag set, with aliases', () => {
  assert.deepEqual(normalizeConstraints(['Celiac', 'contains-sesame', ' Milk ', 'mustard']), ['dairy', 'gluten', 'mustard', 'sesame']);
  assert.deepEqual(normalizeConstraints(['nuts']), ['peanuts', 'tree-nuts']);
  assert.equal(flagFor('tree-nuts'), 'contains-tree-nuts');
  assert.equal(flagFor('mustard'), null);
});

test('no ruleset page means never asked', () => {
  assert.equal(readRuleset(root()).status, 'never-asked');
});

test('a page with no rules means none declared', () => {
  assert.equal(readRuleset(root(page([]))).status, 'none-declared');
  assert.equal(readRuleset(root(page([{ name: 'Sam Example', hard_constraints: [], avoidances: [] }]))).status, 'none-declared');
});

test('declared rules are listed per member', () => {
  const ruleset = readRuleset(root(page([{ name: 'Alex Example', hard_constraints: ['gluten', 'mustard'], avoidances: ['cilantro'] }])));
  assert.equal(ruleset.status, 'declared');
  assert.deepEqual(ruleset.hard, [
    { member: 'Alex Example', constraint: 'gluten' },
    { member: 'Alex Example', constraint: 'mustard' },
  ]);
  assert.deepEqual(ruleset.avoid, [{ member: 'Alex Example', avoidance: 'cilantro' }]);
});

test('a broken ruleset page is unreadable, never treated as empty', () => {
  assert.equal(readRuleset(root('---\nmembers: [\n---\n')).status, 'unreadable');
  assert.equal(readRuleset(root(page([{ hard_constraints: ['gluten'] }]))).status, 'unreadable');
  assert.equal(readRuleset(root(page('everyone'))).status, 'unreadable');
});

test('notes: nudge only while never asked, footer and caveats only with hard constraints', () => {
  assert.deepEqual(dietaryNotes(readRuleset(root())), { status: 'never-asked', nudge: NEVER_ASKED_NUDGE });
  assert.deepEqual(dietaryNotes(readRuleset(root(page([])))), { status: 'none-declared' });
  const avoidOnly = dietaryNotes(readRuleset(root(page([{ name: 'Sam Example', avoidances: ['olives'] }]))));
  assert.deepEqual(avoidOnly, { status: 'declared' });
  const notes = dietaryNotes(readRuleset(root(page([{ name: 'Alex Example', hard_constraints: ['gluten', 'mustard'] }]))));
  assert.equal(notes.footer, GUARANTEE_LINE);
  assert.equal(notes.caveats.length, 1);
  assert.match(notes.caveats[0], /"mustard".*ingredient wording only/);
});
