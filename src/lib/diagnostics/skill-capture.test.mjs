// Every Chef skill script records its runs through ChefCapture. Runs the real scripts against a
// copy of the synthetic data root and reads the trace they leave.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import FACTS from '../../../schemas/feedback/facts.v1.json' with { type: 'json' };
import { invocationTraceProblems } from './test-schemas.mjs';
import { readTrace } from './trace.mjs';

const srcDir = path.join(import.meta.dirname, '..', '..');
const fixture = path.join(srcDir, '..', 'fixtures', 'data-root');
const WEEK = '2026-01-05';

function fixtureRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-skill-capture-')), 'data-root');
  fs.cpSync(fixture, root, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  return root;
}

function run(root, skill, script, args, input) {
  const file = path.join(srcDir, 'skills', skill, 'scripts', `${script}.mjs`);
  return spawnSync(process.execPath, [file, ...args, '--data-root', root], { encoding: 'utf8', input, env: { ...process.env, CHEF_DATA_ROOT: '' } });
}

// One run of each skill script that touches no network: [skill, script, args, expected outcome, error code].
const RUNS = [
  ['chef-add-recipe', 'add-recipe', ['enrich', '--slug', 'no-such-recipe'], 'validation-error', 'recipe-not-found'],
  ['chef-batch-prep-planning', 'batch-prep', ['render', '--week-start', WEEK], 'validation-error', 'no-plan'],
  ['chef-food-inventory', 'inventory', ['view'], 'ok', null],
  ['chef-health-goals', 'health-goals', ['status'], 'ok', null],
  ['chef-meal-logging', 'meal-logging', ['delete', '--id', 'no-such-entry'], 'validation-error', 'record-not-found'],
  ['chef-meal-planning', 'meal-planning', ['today', '--date', WEEK], 'ok', null],
  ['chef-recipe-decisions', 'recipe-decisions', ['list'], 'ok', null],
  ['chef-recipe-search', 'recipe-search', ['search'], 'ok', null],
  ['chef-setup', 'setup', ['settings'], 'ok', null],
  ['chef-shopping-lists', 'shopping-lists', ['build', '--week-start', WEEK], 'validation-error', 'no-plan'],
];

test('every skill script records one schema-valid event with only registry-declared facts', () => {
  const skills = fs.readdirSync(path.join(srcDir, 'skills')).filter((name) => name.startsWith('chef-'));
  assert.deepEqual(RUNS.map(([skill]) => skill).sort(), skills.sort(), 'one run per skill');
  for (const [skill, script, args, outcome, code] of RUNS) {
    const root = fixtureRoot();
    run(root, skill, script, args);
    const trace = readTrace(root);
    assert.deepEqual(invocationTraceProblems(trace), [], skill);
    const { events } = trace;
    assert.equal(events.length, 1, `${skill} records one event`);
    const [event] = events;
    assert.deepEqual([event.skill_id, event.script_id, event.operation, event.outcome, event.error_code], [skill, script, args[0], outcome, code]);
    const declared = FACTS.scripts[`${skill}/${script}`].facts;
    for (const name of Object.keys(event.facts)) assert.ok(Object.hasOwn(declared, name), `${skill} fact ${name} is declared`);
  }
});

test('an operation outside the registry records nothing', () => {
  const root = fixtureRoot();
  run(root, 'chef-health-goals', 'health-goals', ['grandmas-tahini']);
  assert.deepEqual(readTrace(root).events, []);
});


test('household, recipe and dietary content in arguments and data never reaches the trace', () => {
  const root = fixtureRoot();
  const recipe = path.join(root, 'knowledge', 'wiki', 'recipes', 'lemon-garlic-pasta.md');
  fs.writeFileSync(recipe, fs.readFileSync(recipe, 'utf8').replaceAll('Lemon Garlic Pasta', 'Quince Paradox Pasta'));
  const profile = path.join(root, 'knowledge', 'wiki', 'household', 'profile.md');
  fs.writeFileSync(profile, fs.readFileSync(profile, 'utf8').replace('Alex Example', 'Marisol Planted'));
  const runs = [
    ['chef-setup', 'setup', ['set-dietary', '--member', 'Marisol Planted', '--avoid', 'zaatarplanted']],
    ['chef-recipe-search', 'recipe-search', ['search', '--query', 'quince paradox', '--ingredient', 'zaatarplanted']],
    ['chef-recipe-search', 'recipe-search', ['show', '--slug', 'lemon-garlic-pasta']],
    ['chef-meal-logging', 'meal-logging', ['log', '--date', WEEK, '--slot', 'dinner', '--food', 'quince paradox toast', '--servings', '1']],
    ['chef-health-goals', 'health-goals', ['set', '--goal', 'Marisol wants less zaatarplanted']],
    ['chef-food-inventory', 'inventory', ['check-sender', '--from', 'marisol.planted@example.com']],
  ];
  for (const [skill, script, args] of runs) run(root, skill, script, args);
  const trace = readTrace(root);
  assert.equal(trace.events.length, runs.length);
  assert.doesNotMatch(JSON.stringify(trace), /quince|paradox|marisol|planted|zaatar|example\.com|lemon|garlic|dinner|toast/i);
});

test('an unexpected throw is recorded as internal-error without its message', () => {
  const root = fixtureRoot();
  fs.writeFileSync(path.join(root, 'data', 'food-inventory', 'current.json'), '{"quince paradox');
  assert.notEqual(run(root, 'chef-food-inventory', 'inventory', ['view']).status, 0);
  const [event] = readTrace(root).events;
  assert.deepEqual([event.outcome, event.error_code], ['internal-error', 'unclassified']);
  assert.doesNotMatch(JSON.stringify(event), /quince|JSON|position/i);
});
