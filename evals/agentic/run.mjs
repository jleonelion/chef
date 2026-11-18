#!/usr/bin/env node
// Agentic suite: a headless agent harness (see harnesses/, projected into a Trajectory; see trajectory.mjs)
// with the built plugin, one fresh copy of the synthetic fixture data root per rep, deterministic checks only (skills fired, files written or
// not, script output, git state). Every row must pass every rep; nothing is retried.
// Local only: it spends real harness usage, so it never runs in CI. Rows are in rows.json:
//   seed (files written before the fixture commit; ../ lands beside the data root), setup (scripts
//   run before the first turn; `stdin` is piped, a non-string value as JSON), turns (prompts, each a string or {turnFile: evals/agentic/inputs/...};
//   later turns resume the session), responses (assertions against each turn's final reply), skills,
//   scripts ({required, forbidden, max}: skill-relative paths like scripts/<name>, max is a per-path
//   call cap, checked over all turns of a rep), files (see report.mjs checkFiles), git ({headUnchanged, clean}), after (scripts run last, with asserts).
//   Turns, commands and stdin expand {skills}, {data_root} and {tmp}; rows must not depend on the wall-clock date (the lint rejects {today}).
//   repro / known_failure (see evals/repro/README.md): a known_failure row passes while it still fails
//   a rep, and fails once every rep passes. --known-failures runs only rows with that marker.
//   bun run agentic [--reps 3] [--rows id,id] [--known-failures] [--harness claude] [--model <id>] [--concurrency 4] [--out <file>]
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readInput } from '../lib/load-cases.mjs';
import { prepareSandbox, sandboxEnv } from '../lib/sandbox.mjs';
import { assertCase, assertGitState } from '../tier1/assertions.mjs';
import { aggregate, assertScriptPaths, checkFiles, checkResponse, checkScripts, checkSkills } from './report.mjs';
import { loadHarness } from './harnesses/index.mjs';
import { currentProvenance, resultFilename } from './provenance.mjs';
import { validateResult } from './result-schema.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');
const TURN_TIMEOUT_MS = 10 * 60 * 1000;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function prepare(row, harness) {
  const { tmp, dataRoot } = prepareSandbox({ prefix: 'chef-agentic', id: row.id, fixture: path.join(repo, 'fixtures', 'data-root'), author: 'agentic', seed: row.seed });
  const launcher = harness.prepare({ pluginDir: path.join(repo, 'plugins', 'chef'), workdir: tmp, env: sandboxEnv(dataRoot, { CHEF_USDA_FDC_KEY: '' }) });
  const { env, skillsDir } = launcher;
  const expand = (text) => text.replaceAll('{skills}', skillsDir).replaceAll('{data_root}', dataRoot).replaceAll('{tmp}', tmp);
  return { tmp, dataRoot, env, expand, runTurn: launcher.runTurn };
}

function script(rep, step) {
  const [cmd, ...args] = step.command.map(rep.expand);
  const input = step.stdin === undefined ? undefined : rep.expand(typeof step.stdin === 'string' ? step.stdin : JSON.stringify(step.stdin));
  const result = spawnSync(cmd, args, { cwd: rep.tmp, env: rep.env, input, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(`${step.command.slice(0, 3).join(' ')} exited ${result.status}\n${result.stdout}${result.stderr}`);
  return JSON.parse(result.stdout);
}

async function runRep(row, number, { harness, model, logDir }) {
  const rep = prepare(row, harness);
  const run = { row: row.id, rep: number, pass: false, cost_usd: 0, skills: [], scriptRuns: [] };
  try {
    for (const step of row.setup ?? []) script(rep, step);
    const beforeHead = git(rep.dataRoot, 'rev-parse', 'HEAD');
    const session = randomUUID();
    for (const [index, entry] of row.turns.entries()) {
      const prompt = typeof entry === 'string' ? entry : readInput(entry.turnFile).toString('utf8');
      const { out: stream, err, ext } = await rep.runTurn({ prompt: rep.expand(prompt), session, resume: index > 0, model, timeoutMs: TURN_TIMEOUT_MS });
      fs.writeFileSync(path.join(logDir, `${row.id}-${number}-${index + 1}.${ext}`), stream);
      if (err) fs.writeFileSync(path.join(logDir, `${row.id}-${number}-${index + 1}.stderr.txt`), err);
      const turn = harness.project(stream);
      Object.assign(run, { model: run.model ?? turn.model ?? model ?? 'harness default', cost_usd: run.cost_usd + (turn.cost_usd ?? 0) });
      run.skills.push(...turn.skills);
      run.scriptRuns.push(...turn.scriptRuns);
      if (turn.error) throw new Error(`turn ${index + 1} unusable: ${turn.error} (see ${row.id}-${number}-${index + 1}.${ext})`);
      checkResponse(turn.response, row.responses?.[index]);
    }
    checkSkills(run.skills, row);
    checkScripts(run.scriptRuns, row.scripts);
    checkFiles(rep.dataRoot, row.files);
    assertGitState({ beforeHead, afterHead: git(rep.dataRoot, 'rev-parse', 'HEAD'), status: git(rep.dataRoot, 'status', '--porcelain') }, row.git ?? {});
    for (const step of row.after ?? []) {
      const output = script(rep, step);
      for (const assertion of step.assertions ?? []) assertCase(output, assertion);
    }
    run.pass = true;
  } catch (error) {
    run.error = error.message;
  } finally {
    fs.rmSync(rep.tmp, { recursive: true, force: true });
  }
  console.log(`${run.pass ? 'ok' : 'FAIL'} - ${row.id} rep ${number}${run.error ? `: ${run.error.split('\n')[0]}` : ''}`);
  return run;
}

async function pool(jobs, size) {
  const results = [];
  const queue = [...jobs];
  const worker = async () => {
    while (queue.length) results.push(await queue.shift()());
  };
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker));
  return results;
}

function meta(harness, rows, totalRows) {
  const cli = harness.detect();
  return {
    date: new Date().toISOString(),
    ...currentProvenance(repo),
    harness: { name: harness.name, launcherVersion: harness.launcherVersion, cliVersion: cli.version },
    selected_rows: rows.map((row) => row.id),
    rows_selected: rows.length,
    rows_total: totalRows,
  };
}

const { values } = parseArgs({
  options: {
    reps: { type: 'string', default: '3' },
    rows: { type: 'string' },
    'known-failures': { type: 'boolean' },
    harness: { type: 'string', default: 'claude' },
    model: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    out: { type: 'string' },
  },
});
const reps = Number(values.reps);
const allRows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'));
const requestedRows = values.rows?.split(',');
if (requestedRows) {
  const unknown = requestedRows.filter((id) => !allRows.some((row) => row.id === id));
  if (unknown.length) throw new Error(`unknown row id(s): ${unknown.join(', ')}`);
}
const rows = allRows
  .filter((row) => !requestedRows || requestedRows.includes(row.id))
  .filter((row) => !values['known-failures'] || row.known_failure);
for (const row of allRows) assertScriptPaths(row.scripts);
const harness = loadHarness(values.harness);
const info = meta(harness, rows, allRows.length);
const filename = resultFilename({ harness: harness.name, commit: info.commit, date: new Date(info.date) });
const out = path.resolve(values.out ?? path.join(repo, 'evals', 'agentic', 'archive', filename));
const logDir = path.join(repo, 'evals', 'agentic', 'results', 'logs', path.basename(out, '.json'));
fs.mkdirSync(logDir, { recursive: true });
const jobs = rows.flatMap((row) => Array.from({ length: reps }, (_, index) => () => runRep(row, index + 1, { harness, model: values.model, logDir })));
const runs = await pool(jobs, Number(values.concurrency));
const result = aggregate({ meta: info, reps, rows, runs });
const schemaErrors = validateResult(result);
if (schemaErrors.length) throw new Error(`result failed schema validation:\n${schemaErrors.join('\n')}`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
for (const row of result.rows) console.log(`${row.pass ? 'pass' : 'FAIL'} ${row.passes} ${row.id}${row.known_failure ? ` (known_failure ${row.known_failure})` : ''}`);
console.log(`Agentic suite ${result.passed ? 'passed' : 'FAILED'} (model ${result.models.join(', ') || 'unknown'}, $${result.cost_usd}). Result: ${path.relative(repo, out)}`);
process.exitCode = result.passed ? 0 : 1;
