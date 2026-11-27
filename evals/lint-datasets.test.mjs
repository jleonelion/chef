import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { lintDatasets } from './lint-datasets.mjs';

const skillNames = new Set(['chef-setup', 'chef-add-recipe']);
const tier1 = (over = {}) => ({
  id: 'chef-setup-ok',
  description: 'd',
  command: ['node', '{skills}/chef-setup/scripts/setup.mjs'],
  parse: 'json',
  assertions: [{ path: '$.status', equals: 'ok' }],
  git: { clean: true },
  ...over,
});
const agentic = (over = {}) => ({
  id: 'chef-setup-ok',
  flow: 'core',
  description: 'd',
  turns: ['hi'],
  skills: ['chef-setup'],
  files: [],
  git: { clean: true },
  gate: false,
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

test('agentic scripts accepts skill-relative paths only', () => {
  assert.deepEqual(lint({ agentic: [agentic({ scripts: { required: ['scripts/setup.mjs'], forbidden: ['scripts/x.mjs'], max: { 'scripts/setup.mjs': 1 } } })] }), []);
  assert.deepEqual(
    lint({
      agentic: [
        agentic({
          turns: ['ask', 'yes'],
          scripts: {
            requiredCalls: [{ script: 'scripts/setup.mjs', args: ['set'] }],
            forbiddenCalls: [{ script: 'scripts/setup.mjs', args: ['rewrite'] }],
            allowedCalls: [{ script: 'scripts/setup.mjs', args: ['set'] }],
          },
          turnScripts: [{ forbidden: ['scripts/setup.mjs'] }, { required: ['scripts/setup.mjs'] }],
        }),
      ],
    }),
    [],
  );
  assert.ok(lint({ agentic: [agentic({ scripts: { forbidden: ['setup.mjs'] } })] }).length > 0);
  assert.match(lint({ agentic: [agentic({ scripts: { forbiden: [] } })] }).join('\n'), /forbiden/);
  assert.ok(lint({ agentic: [agentic({ scripts: { forbiddenCalls: [{ script: 'setup.mjs', args: ['set'] }] } })] }).length > 0);
  assert.ok(lint({ agentic: [agentic({ scripts: { allowedCalls: [{ script: 'setup.mjs', args: ['set'] }] } })] }).length > 0);
  assert.match(lint({ agentic: [agentic({ turns: ['ask', 'yes'], turnScripts: [{}, {}, {}] })] }).join('\n'), /turnScripts/);
});

test('agentic tools accepts forbidden tool names only', () => {
  assert.deepEqual(lint({ agentic: [agentic({ tools: { forbidden: ['gmail.send'] } })] }), []);
  assert.match(lint({ agentic: [agentic({ tools: { forbiden: ['gmail.send'] } })] }).join('\n'), /forbiden/);
  assert.ok(lint({ agentic: [agentic({ tools: { forbidden: [''] } })] }).length > 0);
});

test('consent boundary checks validate per-turn files, flag scope and judge turn selection', () => {
  const row = agentic({
    turns: ['ask', 'yes'],
    turnFiles: [[{ path: 'data', unchanged: true }], []],
    turnScripts: [
      { forbiddenFlags: ['--override'] },
      {
        requiredCalls: [{ script: 'scripts/setup.mjs', args: ['set'], flags: { '--override': ['Alex Example:dairy'] } }],
        allowedFlagValues: { '--override': ['Alex Example:dairy'] },
      },
    ],
    judge: { turn: 1, expected: 'Scoped consent request.', threshold: 0.9 },
  });
  assert.deepEqual(lint({ agentic: [row] }), []);
  for (const [key, value, message] of [
    ['turnFiles', [[]], /turnFiles/],
    ['turnFiles', [[{ path: 'data', unchangd: true }], []], /unchangd/],
    ['turnScripts', [{ forbiddenFlags: ['override'] }, {}], /pattern/],
    ['turnScripts', [{}, { allowedFlagValues: { override: ['Alex Example:dairy'] } }], /pattern/],
    ['judge', { ...row.judge, turn: 3 }, /judge.turn/],
    ['judge', { ...row.judge, turn: 0 }, /judge\/turn must be >= 1/],
  ]) assert.match(lint({ agentic: [{ ...row, [key]: value }] }).join('\n'), message);
});

test('duplicate ids fail', () => {
  assert.match(lint({ tier1: [tier1(), tier1()] }).join('\n'), /duplicate id/);
});

test('ids must be kebab-case', () => {
  assert.ok(lint({ tier1: [tier1({ id: 'Chef_Setup' })] }).length > 0);
  assert.ok(lint({ agentic: [agentic({ id: 'setup' })] }).length > 0);
});

test('ids must start with a skill the row evaluates', () => {
  assert.match(lint({ tier1: [tier1({ id: 'dietary-gate-x' })] }).join('\n'), /id must start with an evaluated skill \(chef-setup\)/);
  assert.match(lint({ agentic: [agentic({ id: 'setup-ok' })] }).join('\n'), /id must start with an evaluated skill/);
  assert.deepEqual(lint({ tier1: [tier1({ id: 'chef-add-recipe-x', steps: [{ command: ['node', '{skills}/chef-add-recipe/x.mjs'] }] })] }), []);
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

test('tier1 git is required; git: false needs a reason', () => {
  const { git, ...noGit } = tier1();
  assert.match(lint({ tier1: [noGit] }).join('\n'), /git/);
  assert.ok(lint({ tier1: [tier1({ git: false })] }).length > 0);
  assert.deepEqual(lint({ tier1: [tier1({ git: false, gitReason: 'no data root' })] }), []);
  assert.ok(lint({ tier1: [tier1({ gitReason: 'stray' })] }).length > 0);
});

test('seedFile and turnFile must be under evals/*/inputs/ and exist', () => {
  const seeded = tier1({ seed: [{ path: 'a.md', seedFile: 'evals/tier1/inputs/x/a.md' }] });
  assert.deepEqual(lint({ tier1: [seeded] }), []);
  const missing = lintDatasets({ suites: { tier1: [seeded], agentic: [agentic({ turns: [{ turnFile: 'evals/agentic/inputs/x/t.txt' }] })] }, skillNames, exists: () => false });
  assert.equal(missing.filter((e) => /input file not found/.test(e)).length, 2);
  assert.ok(lint({ tier1: [tier1({ seed: [{ path: 'a.md', seedFile: '../secrets.md' }] })] }).length > 0);
  assert.ok(lint({ tier1: [tier1({ seed: [{ path: 'a.md', content: 'x', seedFile: 'evals/tier1/inputs/a.md' }] })] }).length > 0);
});

test('{today} in an agentic row fails', () => {
  assert.match(lint({ agentic: [agentic({ turns: ['Log {today}'] })] })[0], /wall-clock/);
});

test('a flip pair is two agentic rows with identical turns', () => {
  const a = agentic({ id: 'chef-setup-a', pair: 'setup-flip' });
  const b = agentic({ id: 'chef-setup-b', pair: 'setup-flip', seed: [{ path: 'x.md', content: 'x' }] });
  assert.deepEqual(lint({ agentic: [a, b] }), []);
  assert.match(lint({ agentic: [a] }).join('\n'), /pair setup-flip: needs exactly 2 rows, found 1/);
  assert.match(lint({ agentic: [a, b, agentic({ id: 'chef-setup-c', pair: 'setup-flip' })] }).join('\n'), /found 3/);
  assert.match(lint({ agentic: [a, { ...b, turns: ['other'] }] }).join('\n'), /pair setup-flip: rows chef-setup-a and chef-setup-b must have identical turns/);
  assert.ok(lint({ agentic: [agentic({ pair: 'Bad_Id' })] }).length > 0);
});

test('agentic known failures require one stable behavioral check', () => {
  assert.deepEqual(lint({ agentic: [agentic({ known_failure: 'case-one', expect_failure: 'response' })] }), []);
  assert.deepEqual(lint({ agentic: [agentic({ known_failure: 'case-one', expect_failure: 'tools' })] }), []);
  assert.match(lint({ agentic: [agentic({ gate: true, known_failure: 'case-one', expect_failure: 'response' })] }).join('\n'), /known_failure rows cannot be gated/);
  assert.match(lint({ agentic: [agentic({ known_failure: 'case-one' })] }).join('\n'), /expect_failure/);
  assert.match(lint({ agentic: [agentic({ expect_failure: 'response' })] }).join('\n'), /expect_failure/);
  assert.match(lint({ agentic: [agentic({ known_failure: 'case-one', expect_failure: 'unknown' })] }).join('\n'), /expect_failure/);
});

test('agentic rows must carry an explicit gate flag', () => {
  assert.deepEqual(lint({ agentic: [agentic({ gate: false })] }), []);
  assert.deepEqual(lint({ agentic: [agentic({ gate: true })] }), []);
  const { gate, ...missingGate } = agentic();
  assert.match(lint({ agentic: [missingGate] }).join('\n'), /gate/);
  assert.match(lint({ agentic: [agentic({ gate: 'yes' })] }).join('\n'), /gate/);
});

test('agentic candidate rows are valid unless gated or known failures', () => {
  assert.deepEqual(lint({ agentic: [agentic({ candidate: true })] }), []);
  assert.match(lint({ agentic: [agentic({ candidate: true, gate: true })] }).join('\n'), /candidate rows cannot be gated/);
  assert.match(
    lint({ agentic: [agentic({ candidate: true, known_failure: 'case-one', expect_failure: 'response' })] }).join('\n'),
    /candidate rows cannot be known failures/,
  );
});

test('agentic dataset covers every skill and negative routing', () => {
  const repo = path.resolve(import.meta.dirname, '..');
  const rows = JSON.parse(fs.readFileSync(path.join(repo, 'evals', 'agentic', 'rows.json'), 'utf8'));
  const skills = new Set(fs.readdirSync(path.join(repo, 'src', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name));
  const required = new Set(rows.flatMap((row) => row.skills ?? []));
  assert.deepEqual([...skills].filter((skill) => !required.has(skill)), []);

  assert.ok(rows.filter((row) => (row.forbidSkills ?? []).length > 0).length >= 3);
  assert.ok(rows.filter((row) => row.flow === 'should-not-act' && (row.forbidSkills ?? []).length > 0).length >= 2);
  for (const skill of skills) {
    const natural = rows.some((row) => (row.skills ?? []).includes(skill)
      && (row.turns ?? []).some((turn) => typeof turn === 'string' && !/\bchef\b/i.test(turn)));
    assert.ok(natural, `${skill} needs a natural-phrasing prompt without the word Chef`);
  }
});
