import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addRule, matchRule, removeRule } from './rules.mjs';
import { readRules } from './store.mjs';
import { dataRoot } from './test-root.mjs';

const date = '2026-01-20';
const recipe = { title: 'Pork Belly Tacos', cuisine: 'mexican', tags: ['weeknight'], ingredients: ['500 g pork belly', '8 corn tortillas'] };

test('title and text phrases must all match', () => {
  const rules = { auto_reject: [{ id: 'r', title_includes: ['tacos'], text_includes: ['pork', 'tortilla'] }], auto_approve: [] };
  assert.equal(matchRule(rules, recipe).rule.id, 'r');
  assert.equal(matchRule({ auto_reject: [{ id: 'r', title_includes: ['pork', 'beans'] }] }, recipe), null);
  assert.equal(matchRule({ auto_approve: [{ id: 'a', text_includes: ['mexican'] }] }, recipe).action, 'approve');
});

test('adding a rule with an existing id replaces it, even across actions', () => {
  const root = dataRoot();
  assert.equal(addRule(root, { action: 'approve', id: 'pork', reason: 'Yes pork', text: ['pork'], date }).status, 'added');
  assert.equal(addRule(root, { action: 'reject', id: 'pork', reason: 'No pork', text: ['pork'], date }).status, 'replaced');
  assert.deepEqual(readRules(root), { auto_reject: [{ id: 'pork', reason: 'No pork', text_includes: ['pork'], created: date }], auto_approve: [] });
  assert.equal(removeRule(root, { id: 'pork' }).status, 'removed');
  assert.equal(removeRule(root, { id: 'pork' }).status, 'not-found');
});

test('a rule needs an action, an id, a reason and a phrase', () => {
  const result = addRule(dataRoot(), { action: 'maybe', id: 'Bad Id', text: [' '], date });
  assert.equal(result.status, 'invalid-input');
  assert.equal(result.problems.length, 4);
});
