import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintDatasets } from './lint-datasets.mjs';

const skillNames = new Set(['chef-setup', 'chef-add-recipe']);
const tier1 = (over = {}) => ({
  id: 'chef-setup-ok',
  description: 'd',
  command: ['node', '{skills}/chef-setup/scripts/setup.mjs'],
  parse: 'json',
  assertions: [{ path: '$.status', equals: 'ok' }],
  ...over,
});
const agentic = (over = {}) => ({
  id: 'setup-ok',
  flow: 'core',
  description: 'd',
  turns: ['hi'],
  skills: ['chef-setup'],
  files: [],
  git: { clean: true },
  ...over,
});
const lint = (suites) => lintDatasets({ suites: { tier1: [], agentic: [], ...suites }, skillNames });

test('valid rows pass', () => {
  assert.deepEqual(lint({ tier1: [tier1()], agentic: [agentic()] }), []);
});

test('typo\'d assertion key fails', () => {
  assert.match(lint({ tier1: [tier1({ assertions: [{ path: '$.a', includs: 'x' }] })] })[0], /tier1 chef-setup-ok/);
  assert.ok(lint({ agentic: [agentic({ responses: [[{ path: '$.content', contain: 'x' }]] })] }).length > 0);
});

test('typo\'d row key fails', () => {
  assert.match(lint({ agentic: [agentic({ forbidSkill: ['chef-setup'] })] }).join('\n'), /forbidSkill/);
  assert.match(lint({ agentic: [agentic({ response: [] })] }).join('\n'), /response/);
  assert.match(lint({ tier1: [tier1({ expectStatus: 2 })] }).join('\n'), /expectStatus/);
});

test('duplicate ids fail', () => {
  assert.match(lint({ tier1: [tier1(), tier1()] }).join('\n'), /duplicate id/);
});

test('ids must be kebab-case with a skill/scenario shape', () => {
  assert.ok(lint({ tier1: [tier1({ id: 'Chef_Setup' })] }).length > 0);
  assert.ok(lint({ agentic: [agentic({ id: 'setup' })] }).length > 0);
});

test('unknown skills fail in skills, forbidSkills and commands', () => {
  assert.match(lint({ agentic: [agentic({ skills: ['chef-nope'] })] }).join('\n'), /unknown skill chef-nope/);
  assert.match(lint({ agentic: [agentic({ forbidSkills: ['chef-ghost'] })] }).join('\n'), /unknown skill chef-ghost/);
  assert.match(lint({ tier1: [tier1({ command: ['node', '{skills}/chef-gone/x.mjs'] })] }).join('\n'), /unknown skill chef-gone/);
  assert.match(lint({ tier1: [tier1({ steps: [{ command: ['node', '{skills}/chef-gone/x.mjs'] }] })] }).join('\n'), /unknown skill chef-gone/);
});

test('updateInstall underscore dir names resolve to real skills', () => {
  assert.deepEqual(lint({ tier1: [tier1({ command: ['node', '{skills}/chef_setup/scripts/setup.mjs'] })] }), []);
});
