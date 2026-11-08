#!/usr/bin/env node
// Tier1 deterministic evals: run each case's built script against a throwaway data root,
// then assert on its output and on what it wrote. `seed` writes files into the data root
// first (the fixture is then committed to a fresh git repo); `afterCommitSeed` creates pending
// user changes. `updateInstall` creates a local tagged release checkout and custom-skills install.
// `env` overrides environment variables (e.g. a fixed LANG for locale defaults).
// Each assertion is {path, <check>}: `equals` (exact deep-equal), `includes` (string/array member),
// `min` (number >=), `absent` (true: key missing; false: key present). See assertions.mjs.
// File targets parse as `text` (default), `json`, or `pdf` ({valid, pages, title, text[]}; see pdf.mjs).
// `--skip-pdf-files` skips pdf targets: pdf.mjs needs pdf-lib from node_modules, which bundle smoke has none of.
// `git` optionally checks that HEAD is unchanged and/or the data-root worktree is clean.
//   node evals/tier1/run.mjs [--skills-dir <dir>] [--fixture <data root>]
//   (defaults: plugins/chef/skills, fixtures/data-root)
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertCase, assertGitState } from './assertions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
// A real data root is a git repo; skills commit every write. `seed` paths starting with ../
// land beside the data root (inputs such as receipt transcripts) and are not committed.
function commitFixture(dataRoot) {
  const git = (...args) => execFileSync('git', args, { cwd: dataRoot, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=tier1', '-c', 'user.email=tier1@example.com', 'commit', '-q', '-m', 'fixture');
}

function writeSeed(dataRoot, files) {
  for (const file of files ?? []) {
    const abs = path.join(dataRoot, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content);
  }
}

function prepareUpdateInstall(tmp, sourceSkills) {
  const skillsDir = path.join(tmp, 'custom-skills');
  const repository = path.join(tmp, 'chef-release');
  const releaseSkills = path.join(repository, 'plugins', 'chef', 'skills');
  fs.mkdirSync(skillsDir);
  fs.mkdirSync(releaseSkills, { recursive: true });
  for (const name of fs.readdirSync(sourceSkills)) {
    fs.cpSync(path.join(sourceSkills, name), path.join(releaseSkills, name), { recursive: true });
    fs.cpSync(path.join(sourceSkills, name), path.join(skillsDir, name.replaceAll('-', '_')), { recursive: true });
  }
  fs.mkdirSync(path.join(skillsDir, 'chef_dropped'));
  fs.writeFileSync(path.join(skillsDir, 'chef_dropped', 'old.txt'), 'removed by update\n');
  fs.mkdirSync(path.join(repository, 'plugins', 'chef', '.claude-plugin'));
  fs.writeFileSync(path.join(repository, 'plugins', 'chef', '.claude-plugin', 'plugin.json'), '{"name":"chef","version":"0.1.0"}\n');
  const git = (...args) => execFileSync('git', args, { cwd: repository, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=tier1', '-c', 'user.email=tier1@example.com', 'commit', '-q', '-m', 'release');
  git('tag', 'v0.1.0');
  return skillsDir;
}

function prepare(testCase, fixture, sourceSkills) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `chef-tier1-${testCase.id}-`));
  const dataRoot = path.join(tmp, 'data-root');
  const useFixture = (testCase.fixture ?? 'data-root') === 'data-root';
  if (useFixture) fs.cpSync(fixture, dataRoot, { recursive: true });
  writeSeed(dataRoot, testCase.seed);
  if (useFixture) commitFixture(dataRoot);
  writeSeed(dataRoot, testCase.afterCommitSeed);
  const caseSkills = testCase.updateInstall ? prepareUpdateInstall(tmp, sourceSkills) : sourceSkills;
  return { tmp, dataRoot, caseSkills };
}

function parseOutput(mode, result) {
  if (mode === 'json') return JSON.parse(result.stdout);
  if (mode === 'stdout') return { stdout: result.stdout, stderr: result.stderr, status: result.status };
  throw new Error(`Unknown parse mode: ${mode}`);
}

async function readTarget(dataRoot, target) {
  const abs = path.join(dataRoot, target.path);
  assert(fs.existsSync(abs), `expected file was not written: ${target.path}`);
  if (target.parse === 'pdf') return (await import('./pdf.mjs')).readPdf(fs.readFileSync(abs));
  const content = fs.readFileSync(abs, 'utf8');
  return (target.parse ?? 'text') === 'json' ? JSON.parse(content) : { content };
}

function gitOutput(dataRoot, ...args) {
  return execFileSync('git', args, { cwd: dataRoot, encoding: 'utf8' }).trimEnd();
}

async function runCase(testCase, skillsDir, fixture, { skipPdfFiles = false } = {}) {
  const { tmp, dataRoot, caseSkills } = prepare(testCase, fixture, skillsDir);
  try {
    const beforeHead = testCase.git?.headUnchanged ? gitOutput(dataRoot, 'rev-parse', 'HEAD') : undefined;
    const expand = (arg) => arg.replaceAll('{skills}', caseSkills).replaceAll('{data_root}', dataRoot);
    const run = (step) => {
      const [cmd, ...args] = step.command.map(expand);
      const result = spawnSync(cmd, args, {
        cwd: tmp,
        env: { ...process.env, CHEF_DATA_ROOT: dataRoot, ...testCase.env },
        encoding: 'utf8',
        timeout: 30000,
      });
      const expected = step.expectedStatus ?? 0;
      assert.equal(result.status, expected, `${testCase.id} exited ${result.status}, expected ${expected}\n${result.stdout}\n${result.stderr}`);
      return result;
    };
    // `steps` run first, in order, each expected to exit 0 unless it says otherwise.
    for (const step of testCase.steps ?? []) {
      const stepResult = run(step);
      const evaluation = parseOutput(step.parse ?? testCase.parse, stepResult);
      for (const assertion of step.assertions ?? []) assertCase(evaluation, assertion);
    }
    const result = run(testCase);
    const evaluation = parseOutput(testCase.parse, result);
    for (const assertion of testCase.assertions ?? []) assertCase(evaluation, assertion);
    for (const target of (testCase.files ?? []).filter((file) => !(skipPdfFiles && file.parse === 'pdf'))) {
      const written = await readTarget(dataRoot, target);
      for (const assertion of target.assertions ?? []) assertCase(written, assertion);
    }
    if (testCase.git) {
      assertGitState(
        {
          beforeHead,
          afterHead: testCase.git.headUnchanged ? gitOutput(dataRoot, 'rev-parse', 'HEAD') : undefined,
          status: testCase.git.clean ? gitOutput(dataRoot, 'status', '--porcelain') : undefined,
        },
        testCase.git,
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const { values } = parseArgs({ options: { 'skills-dir': { type: 'string' }, fixture: { type: 'string' }, 'skip-pdf-files': { type: 'boolean' } } });
const skillsDir = path.resolve(values['skills-dir'] ?? path.join(repo, 'plugins', 'chef', 'skills'));
const fixture = path.resolve(values.fixture ?? path.join(repo, 'fixtures', 'data-root'));
const cases = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));
for (const testCase of cases) {
  await runCase(testCase, skillsDir, fixture, { skipPdfFiles: values['skip-pdf-files'] });
  console.log(`ok - ${testCase.id}`);
}
console.log(`Tier 1 deterministic evals passed: ${cases.length}/${cases.length}`);
