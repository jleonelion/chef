import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { relevantChangesSince, relevantStatus, treeSha, verifyProvenance } from './provenance.mjs';

test('shared assertion changes invalidate agentic provenance while archived evidence does not', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-assertion-provenance-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const commit = () => git('-c', 'user.name=eval', '-c', 'user.email=eval@example.com', 'commit', '-qm', 'fixture');
  const helper = 'evals/tier1/assertions.mjs';
  const archive = 'evals/agentic/archive/result.json';
  fs.mkdirSync(path.join(repo, 'evals/tier1'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'evals/agentic/archive'), { recursive: true });
  fs.writeFileSync(path.join(repo, helper), 'original');
  git('init', '-q');
  git('add', helper);
  commit();
  const evaluated = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(repo, archive), '{}');
  assert.deepEqual(relevantStatus(repo), []);
  git('add', archive);
  commit();
  assert.deepEqual(relevantChangesSince(repo, evaluated), []);
  fs.writeFileSync(path.join(repo, helper), 'changed');
  assert.ok(relevantStatus(repo).some((entry) => entry.includes(helper)));
  git('add', helper);
  commit();
  assert.deepEqual(relevantChangesSince(repo, evaluated), [helper]);
});

test('tree_sha ignores archived evidence and unrelated files but tracks relevant changes', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-tree-sha-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const commit = (file) => {
    git('add', file);
    git('-c', 'user.name=eval', '-c', 'user.email=eval@example.com', 'commit', '-qm', 'fixture');
  };
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  };
  git('init', '-q');
  write('src/a.mjs', 'one');
  commit('src/a.mjs');
  const before = treeSha(repo);
  for (const file of ['evals/agentic/archive/r.json', 'docs/notes.md']) {
    write(file, 'x');
    commit(file);
  }
  assert.equal(treeSha(repo), before);
  write('src/a.mjs', 'two');
  commit('src/a.mjs');
  assert.notEqual(treeSha(repo), before);
});

test('a result with tree_sha is checked by tree, not by commit ancestry', () => {
  const tree = `sha256:${'a'.repeat(64)}`;
  const base = { result: { tree_sha: tree, selected_rows: ['one'], rows_selected: 1, rows_total: 1, reps: 3, harness: { name: 'codex' }, rows: [{ id: 'one' }] }, current: { tree_sha: tree, rows_total: 1 }, expectedRows: ['one'], expectedReps: 3, expectedHarness: 'codex' };
  assert.deepEqual(verifyProvenance({ ...base, changesSince: ['src/x.mjs'] }), []);
  assert.ok(verifyProvenance({ ...base, current: { ...base.current, tree_sha: `sha256:${'b'.repeat(64)}` } }).some((problem) => problem.startsWith('tree_sha')));
});
