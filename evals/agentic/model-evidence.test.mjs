import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runRep } from './run.mjs';
import { projectCodex } from './trajectory.mjs';

const modelEvidence = {
  source: 'codex-rollout',
  threadId: '11111111-1111-4111-8111-111111111111',
  turnId: 'turn-1',
  model: 'observed-default',
  rollout: 'sessions/2001/01/01/rollout-synthetic.jsonl',
};

async function replay(t, launched, options = {}) {
  const root = fs.mkdtempSync(path.join(import.meta.dirname, '.model-evidence-'));
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const logDir = path.join(root, 'logs');
  fs.mkdirSync(logDir);
  let repDirectory;
  const harness = {
    name: 'codex',
    project: projectCodex,
    prepare({ env, workdir, pluginDir }) {
      repDirectory = workdir;
      const skillsDir = path.join(workdir, 'skills');
      fs.cpSync(path.join(pluginDir, 'skills'), skillsDir, { recursive: true });
      return {
        env, skillsDir,
        async runTurn() {
          return {
            transcript: '{"type":"turn.completed"}\n',
            ext: 'jsonl', exitCode: 0, stderr: '', timedOut: false, signal: null,
            ...launched,
          };
        },
      };
    },
    ...options.harness,
  };
  const run = await runRep({ id: 'model-evidence', turns: ['synthetic prompt'] }, 1, {
    harness, logDir, model: 'requested-model',
  });
  assert.equal(fs.existsSync(repDirectory), false, 'runner removes the repetition directory');
  return { run, logDir };
}

test('runner retains launcher model evidence after repetition cleanup and prefers its observed model', async (t) => {
  const { run, logDir } = await replay(t, { model: 'observed-default', modelEvidence });
  assert.equal(run.outcome, 'pass', JSON.stringify(run.invalid));
  assert.equal(run.model, 'observed-default');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(logDir, 'model-evidence-1-1.model.json'), 'utf8')), modelEvidence);
});
test('runner invalidates a completed Codex turn without observed model evidence', async (t) => {
  for (const evidence of [undefined, { source: 'codex-rollout', error: 'missing new Codex turn_context model evidence' }]) {
    await t.test(evidence ? 'explicit metadata error' : 'no metadata', async (t) => {
      const { run, logDir } = await replay(t, { modelEvidence: evidence });
      assert.equal(run.outcome, 'invalid');
      assert.equal(run.invalid.kind, 'harness');
      assert.match(run.invalid.message, /turn 1.*Codex model evidence/);
      if (evidence) {
        assert.match(run.invalid.message, /missing new Codex turn_context/);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(logDir, 'model-evidence-1-1.model.json'), 'utf8')), evidence);
      }
    });

  }
});

test('runner preserves execution failure classifications before checking model evidence', async (t) => {
  for (const [kind, launch] of [
    ['process', { exitCode: 7, stderr: 'synthetic process failure' }],
    ['rate_limit', { exitCode: 1, transcript: '{"type":"turn.failed","error":{"message":"429 Too Many Requests"}}\n' }],
    ['timeout', { timedOut: true, exitCode: null, signal: 'SIGTERM' }],
  ]) {
    await t.test(kind, async (t) => {
      const evidence = { source: 'codex-rollout', error: 'model metadata unavailable' };
      const { run, logDir } = await replay(t, { ...launch, modelEvidence: evidence });
      assert.equal(run.outcome, 'invalid');
      assert.equal(run.invalid.kind, kind);
      assert.doesNotMatch(run.invalid.message, /model evidence/);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(logDir, 'model-evidence-1-1.model.json'), 'utf8')), evidence);
    });
  }
});

test('other hosts still accept projected models without launcher metadata', async (t) => {
  for (const name of ['claude', 'copilot']) {
    await t.test(name, async (t) => {
      const { run } = await replay(t, {}, {
        harness: {
          name,
          project: (text) => ({ ...projectCodex(text), model: 'projected-model' }),
        },
      });
      assert.equal(run.outcome, 'pass', JSON.stringify(run.invalid));
      assert.equal(run.model, 'projected-model');
    });
  }
});
