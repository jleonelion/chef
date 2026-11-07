import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from './decide.mjs';
import { propose } from './propose.mjs';
import { publishProposals } from './publish.mjs';
import { PROPOSALS_FILE } from './store.mjs';
import { commits, dataRoot, draft, readJson } from './test-root.mjs';

const date = '2026-01-21';
const id = 'mushroom-barley-soup';
const proposed = () => {
  const root = dataRoot();
  propose(root, { draft, date: '2026-01-20' });
  return root;
};

test('each decision is kept as history; the latest one sets the status', () => {
  const root = proposed();
  assert.equal(decide(root, { id, outcome: 'defer', date }).status, 'decided');
  const result = decide(root, { id, outcome: 'reject', reason: ' too heavy ', date });
  assert.equal(result.status, 'decided');
  assert.equal(result.reason, 'too heavy');
  const record = readJson(root, PROPOSALS_FILE).proposals[id];
  assert.deepEqual(record.decisions.map((d) => [d.outcome, d.by]), [['defer', 'user'], ['reject', 'user']]);
});

test('repeating a decision changes nothing', () => {
  const root = proposed();
  decide(root, { id, outcome: 'reject', date });
  const before = commits(root);
  assert.equal(decide(root, { id, outcome: 'reject', date }).status, 'unchanged');
  assert.equal(commits(root), before);
});

test('revise replaces the recipe and keeps the proposal open', () => {
  const root = proposed();
  const result = decide(root, { id, outcome: 'revise', reason: 'less barley', draft: { ...draft, ingredients: ['200 g mushrooms', '50 g pearl barley'] }, date });
  assert.equal(result.status, 'decided');
  assert.equal(readJson(root, PROPOSALS_FILE).proposals[id].draft.ingredients[1], '50 g pearl barley');
  assert.equal(decide(root, { id, outcome: 'revise', date }).status, 'invalid-input');
});

test('the decision is committed on its own, before publication', () => {
  const root = proposed();
  const before = commits(root);
  decide(root, { id, outcome: 'accept', date });
  assert.equal(commits(root), before + 1);
  assert.equal(readJson(root, PROPOSALS_FILE).proposals[id].published, undefined);
});

test('a published recipe cannot be rejected; unknown ids and outcomes are refused', () => {
  const root = proposed();
  decide(root, { id, outcome: 'accept', date });
  publishProposals(root, { date });
  assert.equal(decide(root, { id, outcome: 'reject', date }).status, 'invalid-input');
  assert.equal(decide(root, { id: 'nope', outcome: 'accept', date }).status, 'not-found');
  assert.equal(decide(root, { id, outcome: 'maybe', date }).status, 'invalid-input');
});
