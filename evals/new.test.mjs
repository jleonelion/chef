import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { lintDatasets } from './lint-datasets.mjs';
import { loadCases } from './lib/load-cases.mjs';
import { scaffold } from './new.mjs';

function sandboxRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evals-new-'));
  fs.mkdirSync(path.join(root, 'src', 'skills', 'chef-setup'), { recursive: true });
  fs.mkdirSync(path.join(root, 'evals', 'repro'), { recursive: true });
  return root;
}
const loadIfPresent = (...parts) => (fs.existsSync(path.join(...parts)) ? loadCases(path.join(...parts)) : []);
const lintRoot = (root) =>
  lintDatasets({
    suites: { tier1: loadIfPresent(root, 'evals', 'tier1', 'cases'), agentic: loadIfPresent(root, 'evals', 'agentic', 'rows.json') },
    skillNames: new Set(['chef-setup']),
  });

test('tier1 skeletons pass lint and accumulate in the skill file', () => {
  const root = sandboxRoot();
  scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'first' });
  const { file, id } = scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'second' });
  assert.equal(path.basename(file), 'chef-setup.json');
  assert.equal(id, 'chef-setup-second');
  assert.deepEqual(loadCases(path.dirname(file)).map((row) => row.id), ['chef-setup-first', 'chef-setup-second']);
  assert.deepEqual(lintRoot(root), []);
});

test('agentic skeleton appends to rows.json without reformatting it', () => {
  const root = sandboxRoot();
  const rows = path.join(root, 'evals', 'agentic', 'rows.json');
  fs.mkdirSync(path.dirname(rows));
  const original = '[\n  {\n    "id": "chef-setup-old", "flow": "core", "description": "d", "turns": ["hi"], "skills": ["chef-setup"], "files": [], "git": { "clean": true }\n  }\n]\n';
  fs.writeFileSync(rows, original);
  scaffold({ root, suite: 'agentic', skill: 'chef-setup', slug: 'new' });
  assert.ok(fs.readFileSync(rows, 'utf8').startsWith(original.slice(0, -3)));
  assert.equal(loadCases(rows).length, 2);
  assert.deepEqual(lintRoot(root), []);
});

test('--from-repro adds the repro link and known_failure marker', () => {
  const root = sandboxRoot();
  fs.writeFileSync(path.join(root, 'evals', 'repro', 'rc-1.json'), '{}');
  const { file } = scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'bug', fromRepro: 'rc-1' });
  const [row] = loadCases(path.dirname(file));
  assert.equal(row.repro, 'rc-1');
  assert.equal(row.known_failure, 'rc-1');
  assert.deepEqual(lintRoot(root), []);
  assert.throws(() => scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'bug2', fromRepro: 'missing' }), /not found/);
});

test('an agentic repro requires its expected behavioral check', () => {
  const root = sandboxRoot();
  fs.writeFileSync(path.join(root, 'evals', 'repro', 'rc-1.json'), '{}');
  assert.throws(() => scaffold({ root, suite: 'agentic', skill: 'chef-setup', slug: 'missing-check', fromRepro: 'rc-1' }), /--expect-failure/);
  const { file } = scaffold({ root, suite: 'agentic', skill: 'chef-setup', slug: 'bug', fromRepro: 'rc-1', expectFailure: 'response' });
  const [row] = loadCases(file);
  assert.equal(row.expect_failure, 'response');
  assert.deepEqual(lintRoot(root), []);
});

test('a topic-split skill needs --topic', () => {
  const root = sandboxRoot();
  scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'a', topic: 'settings' });
  assert.throws(() => scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'b' }), /--topic \(settings\)/);
  const { file } = scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'b', topic: 'settings' });
  assert.equal(path.basename(file), 'chef-setup.settings.json');
  assert.deepEqual(lintRoot(root), []);
});

test('refuses an existing id, unknown skill, bad slug and bad suite', () => {
  const root = sandboxRoot();
  scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'dup' });
  assert.throws(() => scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'dup' }), /already exists/);
  assert.throws(() => scaffold({ root, suite: 'tier1', skill: 'chef-nope', slug: 'x' }), /unknown skill/);
  assert.throws(() => scaffold({ root, suite: 'tier1', skill: 'chef-setup', slug: 'Bad_Slug' }), /kebab-case/);
  assert.throws(() => scaffold({ root, suite: 'other', skill: 'chef-setup', slug: 'x' }), /tier1 or agentic/);
});
