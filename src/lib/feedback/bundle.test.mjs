import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { generic } from '../../runtime/generic.mjs';
import { diagnosticBundleProblems } from '../diagnostics/test-schemas.mjs';
import { buildBundle, installedSkills, selectEvents } from './bundle.mjs';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const event = (i, startedAt, extra = {}) => ({
  schema_version: 1,
  invocation_id: ids[i],
  started_at: startedAt,
  duration_ms: 40,
  chef_version: '1.1.0',
  skill_id: 'chef-recipe-search',
  script_id: 'recipe-search',
  operation: 'search',
  outcome: 'ok',
  error_code: null,
  runtime: 'unknown',
  adapter_version: 1,
  facts: { results: 2 },
  ...extra,
});
const trace = [
  event(0, '2026-11-15T09:58:00.250Z'),
  event(1, '2026-11-15T10:01:00.000Z', { parent_id: ids[0], outcome: 'internal-error', error_code: 'unclassified', facts: {} }),
  event(2, '2026-11-15T10:02:00.000Z', { parent_id: '44444444-4444-4444-8444-444444444444' }),
];
const env = { adapter: generic, traceOn: true, skills: [{ id: 'chef-recipe-search', version: '1.1.0' }], engine: { name: 'node', version: '22.21.1' }, platform: 'darwin' };

test('a bundle re-keys events, keeps parent links inside it and anchors times to one UTC hour', () => {
  const bundle = buildBundle({ ...env, events: trace });
  assert.deepEqual(diagnosticBundleProblems(bundle), []);
  assert.equal(bundle.anchor_hour, '2026-11-15T09:00:00Z');
  assert.deepEqual(bundle.events.map((e) => [e.invocation_id, e.parent_id, e.offset_ms]), [
    ['inv-1', undefined, 3480250],
    ['inv-2', 'inv-1', 3660000],
    ['inv-3', undefined, 3720000],
  ]);
  const text = JSON.stringify(bundle);
  for (const id of [...ids, '44444444-4444-4444-8444-444444444444']) assert.ok(!text.includes(id), 'no trace ID leaves in a bundle');
  assert.ok(!text.includes('started_at'));
});

test('a bundle records the environment and what the runtime can do now', () => {
  const { environment } = buildBundle({ ...env, events: trace });
  assert.deepEqual(environment, {
    chef_version: environment.chef_version,
    runtime: { name: 'unknown', adapter_version: 1, adapter_contract_version: 1, capabilities: [] },
    skills: [{ id: 'chef-recipe-search', version: '1.1.0' }],
    js_engine: { name: 'node', version: '22.21.1' },
    os_family: 'macos',
  });
});

test('what Chef cannot observe becomes evidence gaps', () => {
  assert.deepEqual(buildBundle({ ...env, events: trace }).evidence_gaps, [
    'pre_launch_unobserved',
    'host_action_unconfirmed',
    'post_return_unobserved',
    'runtime_extension_unavailable',
    'correlation_unavailable',
  ]);
  const off = buildBundle({ ...env, traceOn: false, events: [] });
  assert.ok(off.evidence_gaps.includes('trace_unavailable'));
  assert.deepEqual(diagnosticBundleProblems(off), []);
});

const idsOf = ({ events }) => events.map((e) => e.invocation_id);
const at = (started_at, skill_id = 'chef-recipe-search') => ({ ...trace[2], started_at, skill_id });

test('selection keeps runs of the named skill from the last 60 minutes, newest 50', () => {
  const now = new Date('2026-11-15T10:59:00.000Z');
  assert.deepEqual(selectEvents(trace, { now }), { events: [trace[1], trace[2]], fallback: false });
  assert.deepEqual(idsOf(selectEvents(trace, { now, skill: 'chef-recipe-search' })), [ids[1], ids[2]]);
  const many = Array.from({ length: 60 }, (_, i) => at(`2026-11-15T10:${String(i).padStart(2, '0')}:00.000Z`));
  const { events } = selectEvents(many, { now });
  assert.equal(events.length, 50);
  assert.equal(events.at(-1).started_at, '2026-11-15T10:59:00.000Z');
});

test('with no runs of the skill in the window, selection falls back to the last 10 runs of any skill', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');
  const old = Array.from({ length: 12 }, (_, i) => at(`2026-11-15T08:${String(i).padStart(2, '0')}:00.000Z`, 'chef-meal-planning'));
  const recent = [at('2026-11-15T11:30:00.000Z', 'chef-shopping-lists')];
  const { events, fallback } = selectEvents([...old, ...recent], { now, skill: 'chef-recipe-search' });
  assert.equal(fallback, true);
  assert.deepEqual(events, [...old.slice(-9), ...recent]);
  assert.deepEqual(selectEvents([], { now, skill: 'chef-recipe-search' }), { events: [], fallback: false });
});

test('widened selection keeps runs of every skill in the window', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');
  const runs = [at('2026-11-15T10:30:00.000Z'), at('2026-11-15T11:10:00.000Z', 'chef-meal-planning'), at('2026-11-15T11:20:00.000Z')];
  assert.deepEqual(selectEvents(runs, { now, skill: 'chef-recipe-search', wide: true }), { events: runs.slice(1), fallback: false });
});

test('installed skills are the chef skills next to this one, with hyphenated IDs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-skills-'));
  for (const name of ['chef_setup', 'chef-recipe-search', 'other-skill']) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'SKILL.md'), '');
  }
  fs.mkdirSync(path.join(dir, 'chef-empty'));
  assert.deepEqual(installedSkills(dir, '1.1.0'), [
    { id: 'chef-recipe-search', version: '1.1.0' },
    { id: 'chef-setup', version: '1.1.0' },
  ]);
});
