import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { prepare } from './codex.mjs';

const threadId = '11111111-1111-4111-8111-111111111111';
const rollout = `sessions/2001/01/01/rollout-2001-01-01T00-00-00-${threadId}.jsonl`;

const fakeCodex = `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
const threadId = process.env.FAKE_CODEX_THREAD_ID ?? '${threadId}';
const file = path.join(process.env.CODEX_HOME, '${rollout}'.replace('${threadId}', threadId));
const resumed = process.argv.includes('resume');
const scenario = process.env.FAKE_CODEX_SCENARIO;
if (process.argv.includes('-m') || process.argv.includes('--model')) process.exit(90);
if (resumed && !process.argv.includes('${threadId}')) process.exit(91);
fs.mkdirSync(path.dirname(file), { recursive: true });
const rows = fs.existsSync(file) ? [] : [{ type: 'session_meta', payload: { id: scenario === 'wrong-session' ? 'different-thread' : threadId, base_instructions: 'PRIVATE_FIXTURE' } }];
if (!process.env.FAKE_CODEX_NO_CONTEXT) {
  const context = { type: 'turn_context', payload: { turn_id: resumed ? 'turn-2' : 'turn-1', model: scenario === 'missing-model' ? null : process.env.FAKE_CODEX_MODEL ?? 'observed-default' } };
  rows.push(context, context);
  if (scenario === 'conflicting-model') rows.push({ type: 'turn_context', payload: { ...context.payload, model: 'another-model' } });
  if (scenario === 'multiple-turns') rows.push({ type: 'turn_context', payload: { ...context.payload, turn_id: 'unexpected-turn' } });
}
if (!['missing-rollout', 'process-failure'].includes(scenario)) {
  fs.appendFileSync(file, rows.map(row => JSON.stringify(row)).join('\\n') + '\\n');
}
if (scenario === 'malformed-json') fs.appendFileSync(file, 'PRIVATE_FIXTURE malformed JSON\\n');
if (scenario === 'duplicate-rollout') fs.copyFileSync(file, file.replace('T00-00-00', 'T00-00-01'));
const childId = '22222222-2222-4222-8222-222222222222';
fs.writeFileSync(file.replace(threadId, childId), [
  { type: 'session_meta', payload: { id: childId } },
  { type: 'turn_context', payload: { turn_id: 'child-turn', model: 'child-model' } },
].map(row => JSON.stringify(row)).join('\\n') + '\\n');
process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: threadId }).replaceAll('":', '": ') + '\\n');
process.stdout.write('{"type":"turn.completed"}\\n');
if (scenario === 'process-failure') {
  process.stderr.write('synthetic process failure');
  process.exitCode = 7;
}
`;

function launcher(t) {
  const root = fs.mkdtempSync(path.join(import.meta.dirname, '.codex-model-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const authHome = path.join(root, 'synthetic-auth');
  const bin = path.join(root, 'bin');
  const pluginDir = path.join(root, 'plugin');
  const workdir = path.join(root, 'rep');
  fs.mkdirSync(authHome);
  fs.writeFileSync(path.join(authHome, 'auth.json'), '{}');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'codex'), fakeCodex, { mode: 0o755 });
  fs.mkdirSync(path.join(pluginDir, 'skills'), { recursive: true });
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = authHome;
  t.after(() => {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
  });
  return prepare({ pluginDir, workdir, env: { PATH: bin } });
}

test('Codex reports the observed default model after its process closes', async (t) => {
  const { runTurn } = launcher(t);
  const turn = await runTurn({ prompt: 'synthetic prompt', timeoutMs: 5000 });
  assert.equal(turn.exitCode, 0);
  assert.equal(turn.model, 'observed-default');
  assert.deepEqual(turn.modelEvidence, {
    source: 'codex-rollout',
    threadId,
    turnId: 'turn-1',
    model: 'observed-default',
    rollout,
  });
});

test('Codex observes resumed turns without reusing stale model evidence', async (t) => {
  const { runTurn, env } = launcher(t);
  const first = await runTurn({ prompt: 'first', timeoutMs: 5000 });
  assert.equal(first.model, 'observed-default');
  env.FAKE_CODEX_MODEL = 'changed-default';
  const second = await runTurn({ prompt: 'second', resume: true, timeoutMs: 5000 });
  assert.equal(second.exitCode, 0);
  assert.equal(second.model, 'changed-default');
  assert.equal(second.modelEvidence.turnId, 'turn-2');
  env.FAKE_CODEX_NO_CONTEXT = '1';
  const third = await runTurn({ prompt: 'third', resume: true, timeoutMs: 5000 });
  assert.equal(third.exitCode, 0);
  assert.equal(third.model, undefined);
  assert.match(third.modelEvidence.error, /new.*turn_context/);
});

test('Codex refuses ambiguous model evidence instead of selecting the last context', async (t) => {
  for (const scenario of ['conflicting-model', 'multiple-turns']) {
    await t.test(scenario, async (t) => {
      const { runTurn, env } = launcher(t);
      env.FAKE_CODEX_SCENARIO = scenario;
      const turn = await runTurn({ prompt: 'synthetic prompt', timeoutMs: 5000 });
      assert.equal(turn.exitCode, 0);
      assert.equal(turn.model, undefined);
      assert.match(turn.modelEvidence.error, /conflicting|ambiguous/);
    });
  }
});

test('Codex reports missing or invalid model evidence without copying rollout contents', async (t) => {
  for (const [scenario, error] of [
    ['missing-rollout', /expected one.*rollout/],
    ['wrong-session', /session identity/],
    ['missing-model', /missing.*model/],
    ['malformed-json', /invalid.*rollout.*JSON/],
    ['duplicate-rollout', /expected one.*rollout/],
  ]) {
    await t.test(scenario, async (t) => {
      const { runTurn, env } = launcher(t);
      env.FAKE_CODEX_SCENARIO = scenario;
      const turn = await runTurn({ prompt: 'synthetic prompt', timeoutMs: 5000 });
      assert.equal(turn.exitCode, 0);
      assert.equal(turn.model, undefined);
      assert.match(turn.modelEvidence.error, error);
      assert.doesNotMatch(JSON.stringify(turn.modelEvidence), /PRIVATE_FIXTURE/);
    });
  }
});

test('Codex preserves process failure details when model evidence is missing', async (t) => {
  const { runTurn, env } = launcher(t);
  env.FAKE_CODEX_SCENARIO = 'process-failure';
  const turn = await runTurn({ prompt: 'synthetic prompt', timeoutMs: 5000 });
  assert.equal(turn.exitCode, 7);
  assert.equal(turn.stderr, 'synthetic process failure');
  assert.equal(turn.timedOut, false);
  assert.equal(turn.signal, null);
  assert.equal(turn.model, undefined);
  assert.match(turn.modelEvidence.error, /expected one.*rollout/);
  assert.match(turn.transcript, /turn.completed/);
});

test('Codex rejects replacement thread evidence during resume', async (t) => {
  const { runTurn, env } = launcher(t);
  assert.equal((await runTurn({ prompt: 'first', timeoutMs: 5000 })).model, 'observed-default');
  env.FAKE_CODEX_THREAD_ID = '33333333-3333-4333-8333-333333333333';
  const turn = await runTurn({ prompt: 'second', resume: true, timeoutMs: 5000 });
  assert.equal(turn.exitCode, 0);
  assert.equal(turn.model, undefined);
  assert.match(turn.modelEvidence.error, /thread identity changed/);
});

test('Codex preserves spawn errors when no thread starts', async (t) => {
  const { runTurn, env } = launcher(t);
  fs.unlinkSync(path.join(env.PATH, 'codex'));
  const turn = await runTurn({ prompt: 'synthetic prompt', timeoutMs: 5000 });
  assert.match(turn.spawnError, /ENOENT/);
  assert.notEqual(turn.exitCode, 0);
  assert.equal(turn.model, undefined);
  assert.match(turn.modelEvidence.error, /thread.started/);
});
