// Pure parts of the agentic suite: check a rep's Trajectory data and data root,
// and aggregate reps into the release result. Deterministic behavior checks and opt-in LLM judging are reported separately.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertCase } from '../tier1/assertions.mjs';
import { scanReply } from './deny-list.mjs';
import { sha256Tree } from './provenance.mjs';
import { parsePage } from '../../src/lib/frontmatter.mjs';

export function behaviorCheck(check, evaluate) {
  try {
    return evaluate();
  } catch (error) {
    if (error?.check) throw error;
    const failure = new Error(error instanceof Error ? error.message : String(error), { cause: error });
    failure.name = 'BehaviorFailure';
    failure.check = check;
    throw failure;
  }
}

export async function recordBehaviorFailure(failures, evaluate) {
  try {
    await evaluate();
  } catch (error) {
    if (!error?.check) throw error;
    failures.push({ check: error.check, message: error.message });
  }
}

export function checkSkills(fired, { skills = [], forbidSkills = [] }) {
  return behaviorCheck('skills', () => {
    for (const skill of skills) assert(fired.includes(skill), `${skill} did not fire (fired: ${fired.join(', ') || 'none'})`);
    for (const skill of forbidSkills) assert(!fired.includes(skill), `${skill} fired`);
  });
}

// scriptRuns: [{script, args}] over every turn of a rep. `required` and `forbidden` list
// skill-relative paths (scripts/<name>), `max` caps calls per path.
export function assertScriptPaths({ required = [], forbidden = [], max = {}, requiredCalls = [], forbiddenCalls = [] } = {}) {
  const scripts = [...required, ...forbidden, ...Object.keys(max), ...requiredCalls.map((call) => call.script), ...forbiddenCalls.map((call) => call.script)];
  for (const script of scripts) assert(/^scripts\/[^/]+$/.test(script), `script must be a skill-relative path like scripts/<name>: ${script}`);
}

function flagValues(args, flag) {
  return args.flatMap((arg, index) => arg === flag ? [args[index + 1]] : arg.startsWith(`${flag}=`) ? [arg.slice(flag.length + 1)] : []);
}

const matchesCall = (run, call) => run.script === call.script
  && call.args.every((arg, index) => run.args[index] === arg)
  && Object.entries(call.flags ?? {}).every(([flag, expected]) => {
    const values = flagValues(run.args, flag);
    return values.length === expected.length && values.every((value, index) => value === expected[index]);
  });
const callName = (call) => [call.script, ...call.args, ...Object.entries(call.flags ?? {}).map(([flag, values]) => `${flag}=${values.join(',')}`)].join(' ');

export function checkScripts(scriptRuns, { required = [], forbidden = [], max = {}, requiredCalls = [], forbiddenCalls = [], forbiddenFlags = [], allowedFlagValues = {} } = {}) {
  return behaviorCheck('scripts', () => {
    const counts = new Map();
    for (const { script } of scriptRuns) counts.set(script, (counts.get(script) ?? 0) + 1);
    const ran = [...counts.keys()].join(', ') || 'none';
    for (const script of required) assert(counts.has(script), `${script} did not run (ran: ${ran})`);
    for (const script of forbidden) assert(!counts.has(script), `${script} ran ${counts.get(script)} time(s)`);
    for (const [script, limit] of Object.entries(max)) assert((counts.get(script) ?? 0) <= limit, `${script} ran ${counts.get(script)} times, max ${limit}`);
    for (const call of requiredCalls) assert(scriptRuns.some((run) => matchesCall(run, call)), `${callName(call)} did not run`);
    for (const call of forbiddenCalls) assert(!scriptRuns.some((run) => matchesCall(run, call)), `${callName(call)} ran`);
    for (const flag of forbiddenFlags) {
      for (const run of scriptRuns) {
        assert(!run.args.some((arg) => arg === flag || arg.startsWith(`${flag}=`)), `${run.script} used forbidden flag ${flag}`);
      }
    }
    for (const [flag, allowed] of Object.entries(allowedFlagValues)) {
      for (const run of scriptRuns) {
        for (const value of flagValues(run.args, flag)) {
          assert(allowed.includes(value), `${run.script} used unauthorized ${flag} value ${JSON.stringify(value)}`);
        }
      }
    }
  });
}

export function checkTools(toolCalls, { forbidden = [] } = {}) {
  return behaviorCheck('tools', () => {
    const called = new Set(toolCalls.map(({ name }) => name));
    for (const tool of forbidden) assert(!called.has(tool), `${tool} was called`);
  });
}

export function checkResponse(response, assertions = []) {
  return behaviorCheck('response', () => {
    for (const assertion of assertions) assertCase({ content: response }, assertion);
  });
}

export function checkReplyDenyList(response) {
  return behaviorCheck('response', () => {
    const matches = scanReply(response);
    assert(matches.length === 0, `reply leaked internal vocabulary: ${matches.join(', ')}`);
  });
}

function listFiles(abs, pattern) {
  if (!fs.existsSync(abs)) return [];
  const matcher = pattern === undefined ? null : new RegExp(pattern);
  return fs.readdirSync(abs, { recursive: true })
    .filter((name) => fs.statSync(path.join(abs, name)).isFile() && (!matcher || matcher.test(name)));
}

function fileState(file) {
  if (!fs.existsSync(file)) return null;
  return fs.statSync(file).isDirectory() ? Buffer.from(sha256Tree(file)) : fs.readFileSync(file);
}

export function snapshotFiles(dataRoot, checks = []) {
  return new Map(checks.filter((check) => check.unchanged).map(({ path: file }) =>
    [file, fileState(path.join(dataRoot, file))]));
}

// Each check is {path} (must exist), {path, absent: true}, {path, unchanged: true}, or {path, count: n|{baseline,delta}}.
// Count checks may filter relative file names with `pattern` and assert each matched file's text.
// `assertions` run against text, parsed JSON, or parsed PDF data (see tier1 assertions).
export async function checkFiles(dataRoot, checks, baseline = new Map()) {
  try {
    for (const check of checks ?? []) {
      const abs = path.join(dataRoot, check.path);
      if (check.unchanged) {
        assert(baseline.has(check.path), `${check.path}: missing post-setup baseline`);
        const before = baseline.get(check.path);
        const after = fileState(abs);
        assert(before === null ? after === null : after !== null && before.equals(after), `${check.path}: file changed since setup`);
        continue;
      }
      if (Object.hasOwn(check, 'count')) {
        const files = listFiles(abs, check.pattern);
        const expected = typeof check.count === 'object' ? check.count.baseline + check.count.delta : check.count;
        assert.equal(files.length, expected, `${check.path}: expected ${expected} files, found ${files.length}`);
        if (check.assertions?.length) {
          for (const file of files) {
            const content = fs.readFileSync(path.join(abs, file), 'utf8');
            for (const assertion of check.assertions) assertCase({ content }, assertion);
          }
        }
        continue;
      }
      if (check.absent) {
        assert(!fs.existsSync(abs), `file must not be written: ${check.path}`);
        continue;
      }
      assert(fs.existsSync(abs), `expected file was not written: ${check.path}`);
      if (check.parse === 'pdf') {
        const { readPdf } = await import('../tier1/pdf.mjs');
        const value = await readPdf(fs.readFileSync(abs));
        for (const assertion of check.assertions ?? []) assertCase(value, assertion);
        continue;
      }
      const content = fs.readFileSync(abs, 'utf8');
      const value = check.parse === 'json' ? JSON.parse(content)
        : check.parse === 'frontmatter' ? { ...parsePage(content), content } : { content };
      for (const assertion of check.assertions ?? []) assertCase(value, assertion);
    }
  } catch (error) {
    if (error?.check) throw error;
    const failure = new Error(error instanceof Error ? error.message : String(error), { cause: error });
    failure.name = 'BehaviorFailure';
    failure.check = 'files';
    throw failure;
  }
}

function behavior(validRuns, passes) {
  if (validRuns === 0) return null;
  if (passes === validRuns) return 'passing';
  if (passes === 0) return 'broken';
  return 'flaky';
}

function completeRuns(rows, reps, runs) {
  return rows.flatMap((row) =>
    Array.from({ length: reps }, (_, index) => {
      const rep = index + 1;
      const matches = runs.filter((run) => run.row === row.id && run.rep === rep);
      if (matches.length === 1) return matches[0];
      const message = matches.length ? `rep produced ${matches.length} results` : 'rep produced no result';
      return { row: row.id, rep, outcome: 'invalid', cost_usd: 0, skills: [], invalid: { kind: 'harness', message } };
    }),
  );
}

// runs: [{row, rep, outcome, failure?, invalid?, model, cost_usd}] → the release result.
export function aggregate({ meta, reps, rows, runs }) {
  const completedRuns = completeRuns(rows, reps, runs);
  const summaries = rows.map((row) => {
    const rowRuns = completedRuns.filter((run) => run.row === row.id);
    const valid = rowRuns.filter((run) => run.outcome !== 'invalid');
    const invalid = rowRuns.filter((run) => run.outcome === 'invalid');
    const failures = valid.filter((run) => run.outcome === 'failed');
    const passes = valid.filter((run) => run.outcome === 'pass').length;
    const rowBehavior = behavior(valid.length, passes);
    const failureEntries = failures.flatMap((run) => (run.failures ?? [run.failure]).map((failure) => ({ rep: run.rep, ...failure })));
    const judgeFailureEntries = rowRuns.flatMap((run) =>
      run.judge_failure ? [{ rep: run.rep, check: 'judge', message: run.judge_failure.message }] : [],
    );
    const judgeRuns = rowRuns.filter((run) => run.judge);
    const judgePasses = judgeRuns.filter((run) => run.judge.pass).length;
    const judgeStatus = judgeRuns.length === 0
      ? null
      : judgePasses === judgeRuns.length
        ? 'passing'
        : judgePasses === 0
          ? 'failed'
          : 'flaky';
    const expectedFailures = failureEntries.filter((failure) => failure.check === row.expect_failure);
    const unexpectedFailures = failureEntries.filter((failure) => failure.check !== row.expect_failure);
    const knownFailureReproduced = expectedFailures.length > 0;
    const pass = row.known_failure
      ? invalid.length === 0 && knownFailureReproduced && unexpectedFailures.length === 0 && judgeFailureEntries.length === 0
      : invalid.length === 0 && rowBehavior === 'passing' && judgeFailureEntries.length === 0;
    return {
      id: row.id,
      flow: row.flow,
      gate: row.gate === true,
      ...(row.candidate === true && { candidate: true }),
      passes: `${passes}/${valid.length}`,
      pass_rate: valid.length ? passes / valid.length : null,
      valid_reps: valid.length,
      invalid_reps: invalid.length,
      behavior: rowBehavior,
      classification: invalid.length ? 'invalid' : rowBehavior,
      flaky: rowBehavior === 'flaky',
      pass,
      ...(row.known_failure && {
        known_failure: row.known_failure,
        expect_failure: row.expect_failure,
        known_failure_reproduced: knownFailureReproduced,
      }),
      ...(row.judge && {
        judge: {
          status: judgeStatus,
          passes: `${judgePasses}/${judgeRuns.length}`,
        },
        judge_failures: judgeFailureEntries,
      }),
      failures: failureEntries,
      invalid: invalid.map(({ rep, invalid: cause }) => ({ rep, ...cause })),
      runs: rowRuns.map(({ rep, outcome, skills = [], failure, failures: runFailures, invalid: cause, judge, judge_failure }) => ({
        rep,
        outcome,
        skills: [...new Set(skills)].sort(),
        ...(failure && { failure }),
        ...(runFailures && { failures: runFailures }),
        ...(judge && { judge }),
        ...(judge_failure && { judge_failure }),
        ...(cause && { invalid: cause }),
      })),
    };
  });
  const gatedIndexes = rows.flatMap((row, index) => row.gate === true || row.gate === undefined ? [index] : []);
  return {
    suite: 'chef-agentic',
    format: 3,
    ...meta,
    models: [...new Set(completedRuns.map((run) => run.model).filter(Boolean))],
    reps,
    passed: rows.length > 0 && gatedIndexes.every((index) => summaries[index].pass),
    invalid: gatedIndexes.some((index) => summaries[index].invalid_reps > 0),
    cost_usd: Math.round(completedRuns.reduce((sum, run) => sum + (run.cost_usd ?? 0), 0) * 100) / 100,
    rows: summaries,
  };
}

export function exitCodeFor(result) {
  if (Array.isArray(result.rows)) {
    const gated = result.rows.filter((row) => row.gate);
    const hasGatedRows = result.rows.some((row) => row.gate);
    if (!hasGatedRows) return 0;
    if (gated.length) {
      if (gated.some((row) => row.invalid_reps > 0)) return 2;
      return gated.every((row) => row.pass) ? 0 : 1;
    }
  }
  if (result.invalid) return 2;
  return result.passed ? 0 : 1;
}

export function failureDigest(result) {
  return (result.rows ?? []).flatMap((row) => [
    ...(row.failures ?? []).map((failure) => `(${row.id}, ${failure.rep}, ${failure.check}, ${String(failure.message).replace(/\s+/g, ' ').trim()})`),
    ...(row.judge_failures ?? []).map((failure) => `(${row.id}, ${failure.rep}, judge, ${String(failure.message).replace(/\s+/g, ' ').trim()})`),
    ...(row.invalid ?? []).map((cause) => `(${row.id}, ${cause.rep}, ${cause.kind}, ${String(cause.message).replace(/\s+/g, ' ').trim()})`),
  ]);
}

export function repReport(run) {
  const status = run.outcome === 'invalid' ? 'INVALID' : run.outcome === 'failed' || run.judge_failure ? 'FAIL' : 'ok';
  const detail = [
    run.failure?.message ?? run.invalid?.message,
    run.judge_failure && `judge: ${run.judge_failure.message}`,
  ].filter(Boolean).map((message) => message.split('\n')[0]).join('; ');
  return `${status} - ${run.row} rep ${run.rep}${detail ? `: ${detail}` : ''}`;
}
