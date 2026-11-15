import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { commit, git } from '../git.mjs';
import { buildEvent } from './capture.mjs';
import { invocationTraceProblems } from './test-schemas.mjs';
import { appendEvent, clearTrace, readTrace, TRACE_FILE } from './trace.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-15T12:00:00.000Z');
const newRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-trace-'));
const adapter = { name: 'muse', adapterVersion: 1, isMuse: () => false };
const event = (results, startedAt = NOW) =>
  buildEvent({ skill: 'chef-recipe-search', script: 'recipe-search', operation: 'search', outcome: 'ok', facts: { results }, startedAt, durationMs: 5, adapter });
const resultsIn = (trace) => trace.events.map((e) => e.facts.results);
const mode = (file) => fs.statSync(file).mode & 0o777;

test('an appended event reads back as a schema-valid trace', () => {
  const root = newRoot();
  appendEvent(root, event(1), { now: NOW });
  const trace = readTrace(root, { now: NOW });
  assert.deepEqual(invocationTraceProblems(trace), []);
  assert.deepEqual(resultsIn(trace), [1]);
});

test('the diagnostics folder is private: dir 0700, files 0600', () => {
  const root = newRoot();
  appendEvent(root, event(1), { now: NOW });
  assert.equal(mode(path.join(root, 'diagnostics')), 0o700);
  assert.equal(mode(path.join(root, TRACE_FILE)), 0o600);
  assert.equal(mode(path.join(root, 'diagnostics', '.gitignore')), 0o600);
});

test('a missing trace reads as empty', () => {
  assert.deepEqual(readTrace(newRoot(), { now: NOW }), { schema_version: 1, events: [] });
});

test('writing past 200 events evicts the oldest', () => {
  const root = newRoot();
  for (let i = 0; i < 205; i += 1) appendEvent(root, event(i), { now: NOW });
  const results = resultsIn(readTrace(root, { now: NOW }));
  assert.equal(results.length, 200);
  assert.equal(results[0], 5);
  assert.equal(results.at(-1), 204);
});

test('writing past the byte bound evicts the oldest', () => {
  const root = newRoot();
  const lineBytes = Buffer.byteLength(`${JSON.stringify(event(1))}\n`);
  const bounds = { maxEvents: 200, maxBytes: lineBytes * 3, maxAgeMs: 14 * DAY };
  for (let i = 1; i <= 5; i += 1) appendEvent(root, event(i), { now: NOW, bounds });
  assert.deepEqual(resultsIn(readTrace(root, { now: NOW, bounds })), [3, 4, 5]);
  assert.ok(fs.statSync(path.join(root, TRACE_FILE)).size <= lineBytes * 3);
});

test('events older than 14 days expire on read and the file shrinks', () => {
  const root = newRoot();
  appendEvent(root, event(1, new Date(NOW - 15 * DAY)), { now: new Date(NOW - 15 * DAY) });
  appendEvent(root, event(2, new Date(NOW - 13 * DAY)), { now: new Date(NOW - 13 * DAY) });
  assert.deepEqual(resultsIn(readTrace(root, { now: NOW })), [2]);
  assert.equal(fs.readFileSync(path.join(root, TRACE_FILE), 'utf8').trim().split('\n').length, 1);
});

test('expired events are also dropped on write', () => {
  const root = newRoot();
  appendEvent(root, event(1, new Date(NOW - 20 * DAY)), { now: new Date(NOW - 20 * DAY) });
  appendEvent(root, event(2), { now: NOW });
  const lines = fs.readFileSync(path.join(root, TRACE_FILE), 'utf8').trim().split('\n');
  assert.deepEqual(lines.map((line) => JSON.parse(line).facts.results), [2]);
});

test('an expired event out of order does not evict newer ones', () => {
  const root = newRoot();
  appendEvent(root, event(1), { now: NOW });
  appendEvent(root, event(2, new Date(NOW - 20 * DAY)), { now: NOW });
  appendEvent(root, event(3), { now: NOW });
  assert.deepEqual(resultsIn(readTrace(root, { now: NOW })), [1, 3]);
});

test('clear trace deletes it locally', () => {
  const root = newRoot();
  appendEvent(root, event(1), { now: NOW });
  assert.equal(clearTrace(root), true);
  assert.equal(fs.existsSync(path.join(root, TRACE_FILE)), false);
  assert.deepEqual(readTrace(root, { now: NOW }).events, []);
  assert.equal(clearTrace(root), false);
});

function committedPaths(root) {
  git(root, ['add', '-A']);
  if (git(root, ['status', '--short'])) commit(root, 'commit everything');
  return git(root, ['log', '--all', '--name-only', '--format=']).split('\n').filter(Boolean);
}

test('an existing data root with its own .gitignore never commits diagnostics', () => {
  const root = newRoot();
  git(root, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'settings.json\n');
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":1}\n');
  committedPaths(root);
  appendEvent(root, event(1), { now: NOW });
  assert.deepEqual(committedPaths(root).filter((p) => p.startsWith('diagnostics')), []);
  assert.equal(git(root, ['status', '--short', '--ignored=no']), '');
});
