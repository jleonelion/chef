import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aggregate, checkFiles, checkSkills, readStream } from './report.mjs';

const stream = [
  { type: 'system', subtype: 'init', model: 'claude-test-1', session_id: 's1' },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'chef:chef-add-recipe' } }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } },
  { type: 'result', subtype: 'success', total_cost_usd: 0.25, is_error: false },
]
  .map((event) => JSON.stringify(event))
  .join('\n');

test('readStream reports the model, skills fired and cost of one turn', () => {
  assert.deepEqual(readStream(`${stream}\nnot json\n`), { model: 'claude-test-1', skills: ['chef-add-recipe'], cost_usd: 0.25, error: false });
});

test('readStream marks a turn with no result event as an error', () => {
  assert.equal(readStream('').error, true);
});

test('checkSkills requires every expected skill and forbids listed ones', () => {
  checkSkills(['chef-recipe-search', 'chef-add-recipe'], { skills: ['chef-add-recipe'], forbidSkills: ['chef-meal-planning'] });
  assert.throws(() => checkSkills(['chef-recipe-search'], { skills: ['chef-add-recipe'] }), /chef-add-recipe did not fire/);
  assert.throws(() => checkSkills(['chef-meal-planning'], { forbidSkills: ['chef-meal-planning'] }), /chef-meal-planning fired/);
});

function dataRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-agentic-test-'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data', 'store.json'), '{"items":[{"id":"a"}]}');
  fs.writeFileSync(path.join(root, 'page.md'), '# Page\n');
  return root;
}

test('checkFiles asserts present, absent and parsed file contents', () => {
  const root = dataRoot();
  checkFiles(root, [
    { path: 'page.md', assertions: [{ path: '$.content', includes: '# Page' }] },
    { path: 'data/store.json', parse: 'json', assertions: [{ path: '$.items[0].id', equals: 'a' }] },
    { path: 'missing.md', absent: true },
  ]);
  assert.throws(() => checkFiles(root, [{ path: 'missing.md' }]), /expected file was not written: missing.md/);
  assert.throws(() => checkFiles(root, [{ path: 'page.md', absent: true }]), /file must not be written: page.md/);
});

test('checkFiles counts the files in a folder', () => {
  const root = dataRoot();
  checkFiles(root, [{ path: 'data', count: 1 }, { path: 'nowhere', count: 0 }]);
  assert.throws(() => checkFiles(root, [{ path: 'data', count: 2 }]), /data: expected 2 files, found 1/);
});

test('aggregate counts passes per row and passes only when every row passed every rep', () => {
  const result = aggregate({
    meta: { commit: 'abc', plugin_version: '0.1.0', date: '2026-01-19' },
    reps: 3,
    rows: [{ id: 'a', flow: 'core' }, { id: 'b', flow: 'should-not-act' }],
    runs: [
      { row: 'a', rep: 1, pass: true, model: 'm1', cost_usd: 1 },
      { row: 'a', rep: 2, pass: true, model: 'm1', cost_usd: 1 },
      { row: 'a', rep: 3, pass: true, model: 'm1', cost_usd: 1 },
      { row: 'b', rep: 1, pass: true, model: 'm1', cost_usd: 0.5 },
      { row: 'b', rep: 2, pass: false, model: 'm1', error: 'boom', cost_usd: 0.5 },
      { row: 'b', rep: 3, pass: true, model: 'm1', cost_usd: 0.5 },
    ],
  });
  assert.equal(result.passed, false);
  assert.deepEqual(result.models, ['m1']);
  assert.equal(result.cost_usd, 4.5);
  assert.deepEqual(
    result.rows.map(({ id, passes, pass }) => ({ id, passes, pass })),
    [
      { id: 'a', passes: '3/3', pass: true },
      { id: 'b', passes: '2/3', pass: false },
    ],
  );
  assert.deepEqual(result.rows[1].failures, [{ rep: 2, error: 'boom' }]);
  assert.equal(result.commit, 'abc');
});

test('aggregate passes a fully green run', () => {
  const result = aggregate({ meta: {}, reps: 1, rows: [{ id: 'a', flow: 'core' }], runs: [{ row: 'a', rep: 1, pass: true, model: 'm1', cost_usd: 0 }] });
  assert.equal(result.passed, true);
});
