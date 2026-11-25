import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RELEVANT_PATHS = ['package.json', 'bun.lock', 'src', 'plugins', 'evals/agentic', 'evals/tier1/assertions.mjs', 'schemas', 'fixtures', 'scripts/build.mjs'];
const EVIDENCE_PATHS = ['evals/agentic/archive/', 'evals/agentic/results/'];

const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

function evidencePath(file) {
  return EVIDENCE_PATHS.some((prefix) => file.startsWith(prefix));
}

function changedFiles(repo, args) {
  const output = git(repo, ...args, '--', ...RELEVANT_PATHS);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !evidencePath(file));
}

export function relevantStatus(repo) {
  const output = git(repo, 'status', '--porcelain=v1', '--untracked-files=all', '--', ...RELEVANT_PATHS);
  return output
    .split('\n')
    .filter(Boolean)
    .filter((line) => {
      const file = line.slice(3).split(' -> ').at(-1);
      return !evidencePath(file);
    });
}

export function relevantChangesSince(repo, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) return [`${JSON.stringify(commit)} is not a valid commit`];
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: repo });
  if (ancestor.status !== 0) return [`${commit} is not an ancestor of HEAD`];
  return changedFiles(repo, ['diff', '--name-only', `${commit}..HEAD`]);
}

export function sha256File(file) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

export function sha256Tree(root) {
  const hash = createHash('sha256');
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) hash.update(relative).update('\0').update(fs.readFileSync(absolute)).update('\0');
      else throw new Error(`fixture contains unsupported entry: ${relative}`);
    }
  };
  visit(root);
  return `sha256:${hash.digest('hex')}`;
}

export function currentProvenance(repo) {
  const plugin = JSON.parse(fs.readFileSync(path.join(repo, 'plugins', 'chef', '.claude-plugin', 'plugin.json'), 'utf8'));
  return {
    commit: git(repo, 'rev-parse', 'HEAD'),
    commit_dirty: relevantStatus(repo).length > 0,
    plugin_version: plugin.version,
    dataset_sha: sha256File(path.join(repo, 'evals', 'agentic', 'rows.json')),
    fixture_sha: sha256Tree(path.join(repo, 'fixtures', 'data-root')),
  };
}

export function resultFilename({ harness, commit, date = new Date(), nonce = randomUUID() }) {
  const timestamp = date.toISOString().replaceAll(/[-:.]/g, '');
  return `${harness}-${commit.slice(0, 12)}-${timestamp}-${nonce.slice(0, 8)}.json`;
}

export function verifyProvenance({ result, current, expectedRows, expectedReps, expectedHarness, changesSince = [] }) {
  const problems = [];
  const mismatch = (name, found, expected) => problems.push(`${name}: result has ${JSON.stringify(found)}, expected ${JSON.stringify(expected)}`);
  if (result.commit_dirty) problems.push('commit_dirty: result was produced from a dirty relevant tree');
  if (current.commit_dirty) problems.push('working tree: relevant files have uncommitted changes');
  if (changesSince.length) problems.push(`evaluated commit: relevant files changed since ${result.commit}: ${changesSince.join(', ')}`);
  for (const key of ['plugin_version', 'dataset_sha', 'fixture_sha']) if (result[key] !== current[key]) mismatch(key, result[key], current[key]);
  if (JSON.stringify(result.selected_rows) !== JSON.stringify(expectedRows)) mismatch('selected_rows', result.selected_rows, expectedRows);
  if (result.rows_selected !== expectedRows.length) mismatch('rows_selected', result.rows_selected, expectedRows.length);
  if (result.rows_total !== current.rows_total) mismatch('rows_total', result.rows_total, current.rows_total);
  if (result.reps !== expectedReps) mismatch('reps', result.reps, expectedReps);
  if (expectedHarness && result.harness?.name !== expectedHarness) mismatch('harness.name', result.harness?.name, expectedHarness);
  const summaryRows = result.rows?.map((row) => row.id);
  if (JSON.stringify(summaryRows) !== JSON.stringify(expectedRows)) mismatch('result row ids', summaryRows, expectedRows);
  return problems;
}
