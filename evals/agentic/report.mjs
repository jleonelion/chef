// Pure parts of the agentic suite: check a rep's Trajectory data and data root,
// and aggregate reps into the release result. Deterministic checks only; no LLM judging.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertCase } from '../tier1/assertions.mjs';

export function checkSkills(fired, { skills = [], forbidSkills = [] }) {
  for (const skill of skills) assert(fired.includes(skill), `${skill} did not fire (fired: ${fired.join(', ') || 'none'})`);
  for (const skill of forbidSkills) assert(!fired.includes(skill), `${skill} fired`);
}

// scriptRuns: [{script, args}] over every turn of a rep. `required` and `forbidden` list
// skill-relative paths (scripts/<name>), `max` caps calls per path.
export function assertScriptPaths({ required = [], forbidden = [], max = {} } = {}) {
  for (const script of [...required, ...forbidden, ...Object.keys(max)]) assert(/^scripts\/[^/]+$/.test(script), `script must be a skill-relative path like scripts/<name>: ${script}`);
}

export function checkScripts(scriptRuns, { required = [], forbidden = [], max = {} } = {}) {
  const counts = new Map();
  for (const { script } of scriptRuns) counts.set(script, (counts.get(script) ?? 0) + 1);
  const ran = [...counts.keys()].join(', ') || 'none';
  for (const script of required) assert(counts.has(script), `${script} did not run (ran: ${ran})`);
  for (const script of forbidden) assert(!counts.has(script), `${script} ran ${counts.get(script)} time(s)`);
  for (const [script, limit] of Object.entries(max)) assert((counts.get(script) ?? 0) <= limit, `${script} ran ${counts.get(script)} times, max ${limit}`);
}

export function checkResponse(response, assertions = []) {
  for (const assertion of assertions) assertCase({ content: response }, assertion);
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
// A known_failure row passes while it still fails at least one rep (reproduced) and fails once
// every rep passes, so a fix can't land without dropping its marker.
export function aggregate({ meta, reps, rows, runs }) {
  const summaries = rows.map((row) => {
    const mine = runs.filter((run) => run.row === row.id);
    const passes = mine.filter((run) => run.pass).length;
    return {
      id: row.id,
      flow: row.flow,
      passes: `${passes}/${reps}`,
      pass: row.known_failure ? passes < reps : passes === reps,
      ...(row.known_failure && { known_failure: row.known_failure }),
      failures: mine.filter((run) => !run.pass).map(({ rep, error }) => ({ rep, error })),
      runs: mine
        .sort((a, b) => a.rep - b.rep)
        .map((run) => ({ rep: run.rep, pass: run.pass, skills: [...new Set(run.skills ?? [])].sort(), error: run.error ?? null })),
    };
  });
  return {
    suite: 'chef-agentic',
    format: 2,
    ...meta,
    models: [...new Set(runs.map((run) => run.model).filter(Boolean))],
    reps,
    passed: summaries.every((row) => row.pass),
    cost_usd: Math.round(runs.reduce((sum, run) => sum + (run.cost_usd ?? 0), 0) * 100) / 100,
    rows: summaries,
  };
}
