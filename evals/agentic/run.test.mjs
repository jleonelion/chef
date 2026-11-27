import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aggregate } from './report.mjs';
import { pool, runRep } from './run.mjs';
import { validateResult } from './result-schema.mjs';

test('fail-fast stops serial scheduling on behavior, invalid or judge failures and retains missing reps', async () => {
  for (const failure of [
    { outcome: 'failed', failure: { check: 'response', message: 'wrong reply' } },
    { outcome: 'invalid', invalid: { kind: 'process', message: 'host stopped' } },
    { outcome: 'pass', judge_failure: { message: 'judge rejected reply' } },
  ]) {
    let started = 0;
    const jobs = Array.from({ length: 3 }, (_, index) => async () => {
      started++;
      return { row: 'row', rep: index + 1, ...failure };
    });
    const runs = await pool(jobs, 1, { failFast: true });
    assert.equal(started, 1);
    const result = aggregate({ meta: {}, rows: [{ id: 'row', flow: 'core' }], reps: 3, runs });
    assert.equal(result.rows[0].pass, false);
    assert.match(result.rows[0].runs[1].invalid.message, /no result/);
    assert.match(result.rows[0].runs[2].invalid.message, /no result/);
  }
});

test('normal scheduling and successful fail-fast jobs still complete every repetition', async () => {
  for (const options of [{}, { failFast: true }]) {
    const runs = await pool(Array.from({ length: 3 }, () => async () => ({ outcome: 'pass' })), 1, options);
    assert.equal(runs.length, 3);
  }
});

test('runner preserves the full failed judge verdict locally before reporting the repetition', async (t) => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-run-evidence-'));
  t.after(() => fs.rmSync(logDir, { recursive: true, force: true }));
  let sandbox;
  const harness = {
    prepare({ env, pluginDir, workdir }) {
      sandbox = workdir;
      const skillsDir = path.join(workdir, 'skills');
      fs.cpSync(path.join(pluginDir, 'skills'), skillsDir, { recursive: true });
      return {
        env, skillsDir,
        async runTurn() {
          return {
            transcript: '{}', ext: 'json', exitCode: 0, stderr: '', timedOut: false, signal: null,
          };
        },
      };
    },
    project() {
      return { response: 'Saved soup.', skills: [], scriptRuns: [], toolCalls: [] };
    },
  };
  const verdict = {
    score: 0.6, passes: false, reasoning: 'missing enrichment',
    missing_critical_details: ['nutrition status'], unexpected_problems: [], confidence: 1,
  };
  const row = { id: 'saved-recipe', flow: 'core', gate: false, turns: ['Save soup.'], judge: { expected: 'Reports enrichment.', threshold: 0.7 } };
  const run = await runRep(row, 1, { harness, logDir, judgeCall: async () => JSON.stringify(verdict) });
  assert.equal(fs.existsSync(sandbox), false);
  const saved = JSON.parse(fs.readFileSync(path.join(logDir, 'saved-recipe-1.result.json'), 'utf8'));
  assert.deepEqual(saved.judge.verdict, verdict);
  assert.deepEqual(saved, run);
  const summary = aggregate({ meta: {}, rows: [row], reps: 3, runs: [saved] });
  assert.equal(summary.rows[0].pass, false);
  assert.equal(summary.rows[0].invalid_reps, 2);
});

test('fail-fast CLI archives an honest partial summary and exits nonzero for ungated invalid rows', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-fail-fast-cli-'));
  const basename = path.basename(tmp);
  const logDir = path.resolve(import.meta.dirname, 'results/logs', basename);
  t.after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(logDir, { recursive: true, force: true });
  });
  const binary = path.join(tmp, 'codex');
  fs.writeFileSync(binary, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo fixture-codex; else exit 99; fi\n', { mode: 0o755 });
  const out = path.join(tmp, `${basename}.json`);
  const result = spawnSync(process.execPath, [
    path.join(import.meta.dirname, 'run.mjs'), '--harness', 'codex',
    '--rows', 'chef-setup-receipt-intake,chef-setup-household-recipients',
    '--reps', '3', '--concurrency', '1', '--fail-fast', '--out', out,
  ], {
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: tmp, PATH: `${tmp}${path.delimiter}${process.env.PATH}` },
  });
  assert.equal(result.status, 2, result.stderr);
  assert.equal((result.stdout.match(/^INVALID - /gm) ?? []).length, 1);
  const summary = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(validateResult(summary), []);
  assert.equal(summary.rows.length, 2);
  assert.ok(summary.rows.every((row) => row.gate === false && !row.pass && row.invalid_reps === 3));
  assert.match(summary.rows[0].runs[0].invalid.message, /not logged in/);
  assert.match(summary.rows[0].runs[1].invalid.message, /no result/);
  assert.ok(summary.rows[1].runs.every((run) => /no result/.test(run.invalid.message)));
});
