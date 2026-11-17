import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { generic } from '../../runtime/generic.mjs';
import { muse } from '../../runtime/muse.mjs';
import { buildEvent, chefCapture } from './capture.mjs';
import { LOCAL_NOTICES_PATH, takeLocalNotice } from '../notices.mjs';
import { invocationEventProblems } from './test-schemas.mjs';
import { TRACE_NOTICE, TRACE_NOTICE_KEY } from './trace-notice.mjs';
import { appendEvent, readTrace, TRACE_FILE } from './trace.mjs';

const run = (overrides = {}) => ({
  skill: 'chef-recipe-search',
  script: 'recipe-search',
  operation: 'search',
  outcome: 'ok',
  error_code: null,
  facts: { results: 3 },
  startedAt: new Date('2026-11-15T10:00:00.000Z'),
  durationMs: 42,
  adapter: generic,
  ...overrides,
});

test('a recipe search becomes a schema-valid invocation event', () => {
  const event = buildEvent(run());
  assert.deepEqual(invocationEventProblems(event), []);
  assert.equal(event.started_at, '2026-11-15T10:00:00.000Z');
  assert.equal(event.runtime, 'unknown');
  assert.deepEqual(event.facts, { results: 3 });
});

test('a failed run carries its registered error code', () => {
  const event = buildEvent(run({ outcome: 'validation-error', error_code: 'not-a-data-root', facts: {} }));
  assert.deepEqual(invocationEventProblems(event), []);
  assert.equal(event.error_code, 'not-a-data-root');
});

test('on Muse the runtime is muse', () => {
  assert.equal(buildEvent(run({ adapter: muse })).runtime, 'muse');
});

test('an undeclared fact is rejected', () => {
  assert.throws(() => buildEvent(run({ facts: { query: 'chicken' } })), /undeclared fact "query"/);
});

test('a declared fact outside its bounds is rejected', () => {
  assert.throws(() => buildEvent(run({ facts: { results: -1 } })), /fact "results"/);
  assert.throws(() => buildEvent(run({ facts: { results: 'many' } })), /fact "results"/);
});

test('an undeclared error code is rejected', () => {
  assert.throws(() => buildEvent(run({ outcome: 'internal-error', error_code: 'disk-on-fire' })), /undeclared error code "disk-on-fire"/);
});

test('an error code must belong to the outcome', () => {
  assert.throws(() => buildEvent(run({ outcome: 'internal-error', error_code: 'not-a-data-root' })), /belongs to validation-error/);
  assert.throws(() => buildEvent(run({ outcome: 'ok', error_code: 'invalid-input' })), /ok runs carry no error code/);
});

test('an undeclared script or operation is rejected', () => {
  assert.throws(() => buildEvent(run({ operation: 'chicken' })), /undeclared operation "chicken"/);
  assert.throws(() => buildEvent(run({ script: 'meal-planning' })), /undeclared script/);
});

function dataRoot(settings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-capture-'));
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":1}\n');
  if (settings) fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify(settings));
  return root;
}
// A data root on a machine that already showed the one-time trace notice.
function seenRoot() {
  const root = dataRoot();
  takeLocalNotice(root, TRACE_NOTICE_KEY, '2026-11-16');
  return root;
}
const searchRun = (root, classify = (result) => ({ outcome: 'ok', facts: { results: result.count } })) =>
  ({ root, skill: 'chef-recipe-search', script: 'recipe-search', operation: 'search', classify, adapter: generic });
const traced = (root) => readTrace(root).events;

test('a captured run returns its result and appends one event classified from it', async () => {
  const root = seenRoot();
  const result = await chefCapture(searchRun(root), () => ({ count: 2, recipes: ['secret recipe'] }));
  assert.deepEqual(result, { count: 2, recipes: ['secret recipe'] });
  const [event] = traced(root);
  assert.deepEqual(invocationEventProblems(event), []);
  assert.equal(event.outcome, 'ok');
  assert.deepEqual(event.facts, { results: 2 });
  assert.doesNotMatch(fs.readFileSync(path.join(root, TRACE_FILE), 'utf8'), /secret/);
});

test('a throw is recorded as internal-error + unclassified, without its message, and returned as an internal-error result', async () => {
  const root = dataRoot();
  let result;
  try {
    result = await chefCapture(searchRun(root), () => { throw new Error('boom at /home/someone/recipes'); });
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = 0;
  }
  assert.equal(result.status, 'internal-error');
  assert.doesNotMatch(JSON.stringify(result), /boom|someone/);
  const [event] = traced(root);
  assert.equal(event.outcome, 'internal-error');
  assert.equal(event.error_code, 'unclassified');
  assert.doesNotMatch(fs.readFileSync(path.join(root, TRACE_FILE), 'utf8'), /boom|someone/);
});

test('with the trace off nothing is written', async () => {
  const root = dataRoot({ settings_version: 2, diagnostics: { trace: 'off' } });
  await chefCapture(searchRun(root), () => ({ count: 1 }));
  assert.equal(fs.existsSync(path.join(root, 'diagnostics')), false);
});

test('settings Chef cannot read fail closed: nothing is written', async () => {
  for (const settings of [{ settings_version: 2, units: 'furlongs' }, { settings_version: 99 }]) {
    const root = dataRoot(settings);
    await chefCapture(searchRun(root), () => ({ count: 1 }));
    assert.equal(fs.existsSync(path.join(root, 'diagnostics')), false);
  }
});

test('a folder that is not a data root gets no diagnostics folder', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-capture-'));
  await chefCapture(searchRun(root), () => ({ count: 1 }));
  assert.deepEqual(fs.readdirSync(root), []);
});

test('an event the registry rejects is dropped and the script still gets its result', async () => {
  const root = seenRoot();
  const leaky = () => ({ outcome: 'ok', facts: { query: 'chicken' } });
  assert.deepEqual(await chefCapture(searchRun(root, leaky), () => ({ count: 1 })), { count: 1 });
  assert.deepEqual(traced(root), []);
});

const noticeOf = async (root) => (await chefCapture(searchRun(root), () => ({ count: 1 }))).trace_notice;

test('the trace notice shows on the first captured run and never again, on v1.2.x and older installs', async () => {
  const v12 = dataRoot({ settings_version: 2, diagnostics: { trace: 'on' } });
  appendEvent(v12, buildEvent(run()), { now: new Date('2026-11-15T10:00:01.000Z') }); // trace on since v1.2.0
  const older = dataRoot({ settings_version: 1 });
  for (const root of [v12, older]) {
    assert.equal((await noticeOf(root))?.text, TRACE_NOTICE);
    assert.equal(await noticeOf(root), undefined);
    assert.equal(await noticeOf(root), undefined);
    assert.equal(fs.statSync(path.join(root, LOCAL_NOTICES_PATH)).mode & 0o777, 0o600);
  }
  assert.doesNotMatch(TRACE_NOTICE, /\b(now|new|starting|started)\b/i);
});

test('the trace notice also comes with a run that throws', async () => {
  const root = dataRoot();
  try {
    const result = await chefCapture(searchRun(root), () => { throw new Error('boom'); });
    assert.equal(result.trace_notice.text, TRACE_NOTICE);
  } finally {
    process.exitCode = 0;
  }
});

test('with the trace off, or outside a data root, there is no trace notice and nothing is recorded', async () => {
  const off = dataRoot({ settings_version: 2, diagnostics: { trace: 'off' } });
  const notRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-capture-'));
  for (const root of [off, notRoot]) {
    assert.equal(await noticeOf(root), undefined);
    assert.equal(fs.existsSync(path.join(root, 'diagnostics')), false);
  }
});
