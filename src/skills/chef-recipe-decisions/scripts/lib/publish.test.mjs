import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fdcClient } from '../../../../lib/fdc.mjs';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { writeWiki } from '../../../../lib/wiki.mjs';
import { decide } from './decide.mjs';
import { propose } from './propose.mjs';
import { publishAndEnrich, publishProposals } from './publish.mjs';
import { PROPOSALS_FILE } from './store.mjs';
import { commits, dataRoot, draft, exists, readJson } from './test-root.mjs';

const date = '2026-01-22';
const id = 'mushroom-barley-soup';
const page = 'knowledge/wiki/recipes/mushroom-barley-soup.md';
const accepted = (url) => {
  const root = dataRoot();
  propose(root, { draft, url, date });
  decide(root, { id, outcome: 'accept', date });
  return root;
};

function declareConstraint(root, constraint) {
  writeWiki(root, {
    pages: [{
      slug: 'dietary-ruleset',
      frontmatter: {
        type: 'dietary-ruleset',
        title: 'Dietary ruleset',
        members: [{ name: 'Alex Example', hard_constraints: [constraint] }],
        updated: date,
      },
      body: '\n# Dietary ruleset\n',
    }],
    message: 'declare dietary rule',
  });
}

test('publishing writes the page, the accepted draft as raw provenance and the link, in one commit', () => {
  const root = accepted('https://example.com/soup');
  const before = commits(root);
  const result = publishProposals(root, { date });
  assert.equal(result.status, 'published');
  assert.equal(commits(root), before + 1);
  const { frontmatter } = parsePage(fs.readFileSync(path.join(root, page), 'utf8'));
  assert.equal(frontmatter.source_kind, 'proposal');
  assert.equal(frontmatter.source_url, 'https://example.com/soup');
  assert.deepEqual(frontmatter.source_raw, ['knowledge/raw/recipes/20260122-mushroom-barley-soup.json']);
  assert.equal(readJson(root, frontmatter.source_raw[0]).title, 'Mushroom Barley Soup');
  assert.deepEqual(readJson(root, PROPOSALS_FILE).proposals[id].published, { date, path: page });
});

test('publishing again is a no-op', () => {
  const root = accepted();
  publishProposals(root, { date });
  const before = commits(root);
  assert.deepEqual(publishProposals(root, { date }), { status: 'unchanged', data_root: root, published: [] });
  assert.equal(publishProposals(root, { ids: [id], date }).status, 'unchanged');
  assert.equal(commits(root), before);
});

test('an existing page with the same slug is linked, never overwritten', () => {
  const root = accepted();
  const mine = { type: 'recipe', title: 'Mushroom Barley Soup', source_kind: 'text', source_raw: [], created: date, updated: date };
  writeWiki(root, { pages: [{ slug: id, frontmatter: mine, body: '\nmine\n' }], message: 'manual add' });
  const result = publishProposals(root, { date });
  assert.deepEqual(result.published, [{ id, slug: id, date, path: page, linked: true }]);
  assert.match(fs.readFileSync(path.join(root, page), 'utf8'), /mine/);
});

test('only accepted proposals can be published by id', () => {
  const root = dataRoot();
  propose(root, { draft, date });
  assert.equal(publishProposals(root, { ids: [id], date }).status, 'invalid-input');
  assert.equal(publishProposals(root, { ids: ['nope'], date }).status, 'not-found');
  assert.equal(exists(root, page), false);
});

test('publishing a dietary conflict without confirmation is refused without writes', () => {
  const root = dataRoot();
  declareConstraint(root, 'dairy');
  propose(root, { draft: { ...draft, ingredients: [...draft.ingredients, '1 cup milk'] }, date });
  decide(root, { id, outcome: 'accept', date });
  const before = commits(root);

  const result = publishProposals(root, { date });

  assert.equal(result.status, 'refused');
  assert.match(result.reason, /confirmation/i);
  assert.equal(result.blocked[0].id, id);
  assert.equal(result.blocked[0].reasons[0].constraint, 'dairy');
  assert.deepEqual(result.blocked[0].reasons.map((reason) => reason.why), ['flagged', 'ingredient-text']);
  assert.equal(commits(root), before);
  assert.equal(exists(root, page), false);
  assert.equal(readJson(root, PROPOSALS_FILE).proposals[id].decisions.at(-1).outcome, 'accept');
});

test('explicit confirmation publishes a dietary conflict and records the user decision', () => {
  const root = dataRoot();
  declareConstraint(root, 'dairy');
  propose(root, { draft: { ...draft, ingredients: [...draft.ingredients, '1 cup milk'] }, date });
  decide(root, { id, outcome: 'accept', date });

  const result = publishProposals(root, { date, confirm: true });

  assert.equal(result.status, 'published');
  assert.equal(exists(root, page), true);
  const decisions = readJson(root, PROPOSALS_FILE).proposals[id].decisions;
  assert.deepEqual(decisions.at(-1), {
    outcome: 'accept',
    date,
    by: 'user',
    reason: 'Confirmed publication despite the dietary hard-constraint gate.',
  });
  assert.equal(decisions.length, 2);
  assert.equal(exists(root, 'data/recipe-decisions/standing-rules.json'), false);
});

test('derived dietary flags let an accepted safe proposal publish without confirmation', () => {
  const root = dataRoot();
  declareConstraint(root, 'peanut allergy');
  const safeDraft = { title: 'Plain Rice', ingredients: ['1 cup rice', '2 cups water'], steps: ['Simmer.'] };
  propose(root, { draft: safeDraft, date });
  decide(root, { id: 'plain-rice', outcome: 'accept', date });

  const result = publishProposals(root, { ids: ['plain-rice'], date });

  assert.equal(result.status, 'published');
  assert.equal(exists(root, 'knowledge/wiki/recipes/plain-rice.md'), true);
});

test('an unreadable dietary ruleset refuses publication without confirmation', () => {
  const root = accepted();
  writeWiki(root, {
    pages: [{
      slug: 'dietary-ruleset',
      frontmatter: { type: 'dietary-ruleset', title: 'Dietary ruleset', members: 'broken', updated: date },
      body: '\n# Dietary ruleset\n',
    }],
    message: 'write unreadable dietary rule',
  });
  const before = commits(root);

  const result = publishProposals(root, { date });

  assert.equal(result.status, 'refused');
  assert.equal(result.blocked[0].reasons[0].why, 'ruleset-unreadable');
  assert.equal(commits(root), before);
  assert.equal(exists(root, page), false);
});

test('a refused publication keeps the decision for a later retry', () => {
  const root = accepted();
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version": 99}');
  assert.equal(publishProposals(root, { date }).status, 'refused');
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version": 1}');
  assert.equal(readJson(root, PROPOSALS_FILE).proposals[id].decisions.at(-1).outcome, 'accept');
  assert.equal(publishProposals(root, { date }).status, 'published');
});

test('new pages are enriched; nutrition is not computed without USDA', async () => {
  const root = accepted();
  const fdc = fdcClient({ credential: { ok: false, reason: 'not-connected' } });
  const result = await publishAndEnrich(root, { date, fdc });
  assert.deepEqual(result.enrichment.map((e) => [e.slug, e.nutrition]), [[id, 'not-computed']]);
  assert.match(result.hint, /chef-setup/);
});
