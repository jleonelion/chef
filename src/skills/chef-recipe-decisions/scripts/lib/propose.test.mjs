import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeWiki } from '../../../../lib/wiki.mjs';
import { decide } from './decide.mjs';
import { propose } from './propose.mjs';
import { addRule } from './rules.mjs';
import { PROPOSALS_FILE } from './store.mjs';
import { commits, dataRoot, draft, exists, readJson } from './test-root.mjs';

const date = '2026-01-20';

test('a new recipe is recorded as an open proposal outside the wiki', () => {
  const root = dataRoot();
  const result = propose(root, { draft, url: 'https://example.com/soup', note: 'uses the mushrooms', date });
  assert.equal(result.status, 'proposed');
  assert.equal(result.id, 'mushroom-barley-soup');
  const record = readJson(root, PROPOSALS_FILE).proposals['mushroom-barley-soup'];
  assert.deepEqual(record.decisions, []);
  assert.equal(record.source_url, 'https://example.com/soup');
  assert.deepEqual(record.draft.ingredients, draft.ingredients);
});

test('a rejected recipe is not proposed again, by title or by source address', () => {
  const root = dataRoot();
  propose(root, { draft, url: 'https://example.com/soup', date });
  decide(root, { id: 'mushroom-barley-soup', outcome: 'reject', reason: 'no barley', date });
  const before = commits(root);
  const again = propose(root, { draft, date });
  assert.equal(again.status, 'already-rejected');
  assert.equal(again.reason, 'no barley');
  const renamed = propose(root, { draft: { ...draft, title: 'Barley Mushroom Soup' }, url: 'https://EXAMPLE.com/soup/', date });
  assert.equal(renamed.status, 'already-rejected');
  assert.equal(commits(root), before);
});

test('an open proposal is not duplicated', () => {
  const root = dataRoot();
  propose(root, { draft, date });
  assert.equal(propose(root, { draft, date }).status, 'already-proposed');
});

test('standing rules decide a proposal; reject rules win over approve rules', () => {
  const root = dataRoot();
  addRule(root, { action: 'approve', id: 'soups', reason: 'Always soups', text: ['soup'], date });
  assert.equal(propose(root, { draft, date }).status, 'auto-accepted');
  addRule(root, { action: 'reject', id: 'no-lentils', reason: 'No lentils', text: ['lentil'], date });
  const lentil = propose(root, { draft: { ...draft, title: 'Lentil Soup', ingredients: ['1 cup red lentils'] }, date });
  assert.equal(lentil.status, 'auto-rejected');
  assert.deepEqual(lentil.rule, { id: 'no-lentils', reason: 'No lentils' });
  assert.equal(readJson(root, PROPOSALS_FILE).proposals['lentil-soup'].decisions[0].by, 'rule:no-lentils');
});

test('a dietary conflict keeps a matching auto-approve proposal open with reasons', () => {
  const root = dataRoot();
  writeWiki(root, {
    pages: [{
      slug: 'dietary-ruleset',
      frontmatter: {
        type: 'dietary-ruleset',
        title: 'Dietary ruleset',
        members: [{ name: 'Alex Example', hard_constraints: ['dairy'] }],
        updated: date,
      },
      body: '\n# Dietary ruleset\n',
    }],
    message: 'declare dietary rule',
  });
  addRule(root, { action: 'approve', id: 'soups', reason: 'Always soups', text: ['soup'], date });

  const result = propose(root, { draft: { ...draft, ingredients: [...draft.ingredients, '1 cup milk'] }, date });

  assert.equal(result.status, 'proposed');
  assert.equal(result.state, 'open');
  assert.equal(result.reasons[0].constraint, 'dairy');
  assert.equal(result.reasons[0].why, 'ingredient-text');
  const record = readJson(root, PROPOSALS_FILE).proposals['mushroom-barley-soup'];
  assert.deepEqual(record.decisions, []);
  assert.deepEqual(record.gate_reasons, result.reasons);
  assert.equal(exists(root, 'knowledge/wiki/recipes/mushroom-barley-soup.md'), false);
});

test('rule phrases match at word starts only', () => {
  const root = dataRoot();
  addRule(root, { action: 'reject', id: 'no-ham', reason: 'No ham', text: ['ham'], date });
  assert.equal(propose(root, { draft: { ...draft, title: 'Shallot Soup', ingredients: ['4 shallots'] }, date }).status, 'proposed');
});

test('invalid drafts and urls write nothing', () => {
  const root = dataRoot();
  const before = commits(root);
  assert.equal(propose(root, { draft: { title: 'x' }, date }).status, 'invalid-input');
  assert.equal(propose(root, { draft, url: 'file:///etc/hosts', date }).status, 'invalid-input');
  assert.equal(commits(root), before);
});
