// Pure parts of the agentic suite: read one headless Claude Code turn, check a rep's data root,
// and aggregate reps into the release result. Deterministic checks only; no LLM judging.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertCase } from '../tier1/assertions.mjs';

function events(text) {
  return text.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

// One `claude -p --output-format stream-json` turn → model, chef skills fired, cost, error.
export function readStream(text) {
  const all = events(text);
  const result = all.find((event) => event.type === 'result');
  const skills = all
    .filter((event) => event.type === 'assistant')
    .flatMap((event) => event.message?.content ?? [])
    .filter((block) => block.type === 'tool_use' && block.name === 'Skill')
    .map((block) => String(block.input?.skill ?? '').replace(/^[^:]*:/, ''));
  return {
    model: all.find((event) => event.type === 'system' && event.subtype === 'init')?.model,
    skills,
    cost_usd: result?.total_cost_usd ?? 0,
    error: !result || result.is_error === true,
  };
}

export function checkSkills(fired, { skills = [], forbidSkills = [] }) {
  for (const skill of skills) assert(fired.includes(skill), `${skill} did not fire (fired: ${fired.join(', ') || 'none'})`);
  for (const skill of forbidSkills) assert(!fired.includes(skill), `${skill} fired`);
}

function countFiles(abs) {
  if (!fs.existsSync(abs)) return 0;
  return fs.readdirSync(abs, { recursive: true }).filter((name) => fs.statSync(path.join(abs, name)).isFile()).length;
}

// Each check is {path} (must exist), {path, absent: true}, or {path, count: n} (files under a folder);
// `assertions` run against {content} or, with parse: 'json', the parsed file (see tier1 assertions).
export function checkFiles(dataRoot, checks) {
  for (const check of checks ?? []) {
    const abs = path.join(dataRoot, check.path);
    if (Object.hasOwn(check, 'count')) {
      const found = countFiles(abs);
      assert.equal(found, check.count, `${check.path}: expected ${check.count} files, found ${found}`);
      continue;
    }
    if (check.absent) {
      assert(!fs.existsSync(abs), `file must not be written: ${check.path}`);
      continue;
    }
    assert(fs.existsSync(abs), `expected file was not written: ${check.path}`);
    const content = fs.readFileSync(abs, 'utf8');
    const value = check.parse === 'json' ? JSON.parse(content) : { content };
    for (const assertion of check.assertions ?? []) assertCase(value, assertion);
  }
}

// runs: [{row, rep, pass, model, cost_usd, error?}] → the result file attached to a release.
export function aggregate({ meta, reps, rows, runs }) {
  const summaries = rows.map((row) => {
    const mine = runs.filter((run) => run.row === row.id);
    const passes = mine.filter((run) => run.pass).length;
    return {
      id: row.id,
      flow: row.flow,
      passes: `${passes}/${reps}`,
      pass: passes === reps,
      failures: mine.filter((run) => !run.pass).map(({ rep, error }) => ({ rep, error })),
    };
  });
  return {
    suite: 'chef-agentic',
    format: 1,
    ...meta,
    models: [...new Set(runs.map((run) => run.model).filter(Boolean))],
    reps,
    passed: summaries.every((row) => row.pass),
    cost_usd: Math.round(runs.reduce((sum, run) => sum + (run.cost_usd ?? 0), 0) * 100) / 100,
    rows: summaries,
  };
}
