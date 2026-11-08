#!/usr/bin/env node
// Agentic suite: headless Claude Code (`claude -p`) with the built plugin, one fresh copy of the
// synthetic fixture data root per rep, deterministic checks only (skills fired, files written or
// not, script output, git state). Every row must pass every rep; nothing is retried.
// Local only: it spends real Claude usage, so it never runs in CI. Rows are in rows.json:
//   seed (files written before the fixture commit; ../ lands beside the data root), setup (scripts
//   run before the first turn), turns (prompts; later turns resume the session), skills, files
//   (see report.mjs checkFiles), git ({headUnchanged, clean}), after (scripts run last, with asserts).
//   bun run agentic [--reps 3] [--rows id,id] [--model <id>] [--concurrency 4] [--out <file>]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { assertCase, assertGitState } from '../tier1/assertions.mjs';
import { aggregate, checkFiles, checkSkills, readStream } from './report.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');
const TURN_TIMEOUT_MS = 10 * 60 * 1000;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function prepare(row) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `chef-agentic-${row.id}-`));
  const dataRoot = path.join(tmp, 'data-root');
  fs.cpSync(path.join(repo, 'fixtures', 'data-root'), dataRoot, { recursive: true });
  for (const file of row.seed ?? []) {
    fs.mkdirSync(path.dirname(path.join(dataRoot, file.path)), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, file.path), file.content);
  }
  git(dataRoot, 'init', '-q', '-b', 'main');
  git(dataRoot, 'add', '-A');
  git(dataRoot, '-c', 'user.name=agentic', '-c', 'user.email=agentic@example.com', 'commit', '-q', '-m', 'fixture');
  const plugin = path.join(tmp, 'plugin');
  fs.cpSync(path.join(repo, 'plugins', 'chef'), plugin, { recursive: true });
  const env = { ...process.env, CHEF_DATA_ROOT: dataRoot, CHEF_USDA_FDC_KEY: '' };
  const expand = (text) => text.replaceAll('{skills}', path.join(plugin, 'skills')).replaceAll('{data_root}', dataRoot).replaceAll('{tmp}', tmp);
  return { tmp, dataRoot, plugin, env, expand };
}

function script(rep, step) {
  const [cmd, ...args] = step.command.map(rep.expand);
  const result = spawnSync(cmd, args, { cwd: rep.tmp, env: rep.env, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(`${step.command.slice(0, 3).join(' ')} exited ${result.status}\n${result.stdout}${result.stderr}`);
  return JSON.parse(result.stdout);
}

function claude(rep, prompt, { session, resume, model }) {
  const args = ['-p', rep.expand(prompt), '--output-format', 'stream-json', '--verbose', '--plugin-dir', rep.plugin];
  args.push('--strict-mcp-config', '--setting-sources', 'project', '--permission-mode', 'dontAsk');
  args.push('--allowedTools', 'Bash Read Write Edit Glob Grep Skill');
  args.push(...(resume ? ['--resume', session] : ['--session-id', session]), ...(model ? ['--model', model] : []));
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd: rep.tmp, env: rep.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (out += chunk));
    const timer = setTimeout(() => child.kill('SIGTERM'), TURN_TIMEOUT_MS);
    child.on('close', () => {
      clearTimeout(timer);
      resolve(out);
    });
  });
}

async function runRep(row, number, { model, logDir }) {
  const rep = prepare(row);
  const run = { row: row.id, rep: number, pass: false, cost_usd: 0, skills: [] };
  try {
    for (const step of row.setup ?? []) script(rep, step);
    const beforeHead = git(rep.dataRoot, 'rev-parse', 'HEAD');
    const session = randomUUID();
    for (const [index, prompt] of row.turns.entries()) {
      const stream = await claude(rep, prompt, { session, resume: index > 0, model });
      fs.writeFileSync(path.join(logDir, `${row.id}-${number}-${index + 1}.jsonl`), stream);
      const turn = readStream(stream);
      Object.assign(run, { model: run.model ?? turn.model, cost_usd: run.cost_usd + turn.cost_usd });
      run.skills.push(...turn.skills);
      if (turn.error) throw new Error(`turn ${index + 1} did not finish (see ${row.id}-${number}-${index + 1}.jsonl)`);
    }
    checkSkills(run.skills, row);
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

function meta() {
  const plugin = JSON.parse(fs.readFileSync(path.join(repo, 'plugins', 'chef', '.claude-plugin', 'plugin.json'), 'utf8'));
  return {
    date: new Date().toISOString(),
    commit: git(repo, 'rev-parse', 'HEAD'),
    commit_dirty: git(repo, 'status', '--porcelain', '--', 'plugins', 'evals/agentic', 'fixtures') !== '',
    plugin_version: plugin.version,
    claude_code_version: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
  };
}

const { values } = parseArgs({
  options: {
    reps: { type: 'string', default: '3' },
    rows: { type: 'string' },
    model: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    out: { type: 'string' },
  },
});
const reps = Number(values.reps);
const allRows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'));
const rows = values.rows ? allRows.filter((row) => values.rows.split(',').includes(row.id)) : allRows;
const info = meta();
const out = path.resolve(values.out ?? path.join(repo, 'evals', 'agentic', 'results', `agentic-${info.commit.slice(0, 12)}.json`));
const logDir = path.join(path.dirname(out), 'logs', path.basename(out, '.json'));
fs.mkdirSync(logDir, { recursive: true });
const jobs = rows.flatMap((row) => Array.from({ length: reps }, (_, index) => () => runRep(row, index + 1, { model: values.model, logDir })));
const runs = await pool(jobs, Number(values.concurrency));
const result = aggregate({ meta: info, reps, rows, runs });
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
for (const row of result.rows) console.log(`${row.pass ? 'pass' : 'FAIL'} ${row.passes} ${row.id}`);
console.log(`Agentic suite ${result.passed ? 'passed' : 'FAILED'} (model ${result.models.join(', ') || 'unknown'}, $${result.cost_usd}). Result: ${path.relative(repo, out)}`);
process.exitCode = result.passed ? 0 : 1;
