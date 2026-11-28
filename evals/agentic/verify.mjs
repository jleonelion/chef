#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { currentProvenance, relevantChangesSince, verifyProvenance } from './provenance.mjs';
import { validateResult } from './result-schema.mjs';
import { formatAttemptTable, mergeHostRuns } from './evidence-merge.mjs';
import { verifyReleaseEvidence } from './release-check.mjs';
import { selectRows } from './selection.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    reps: { type: 'string', default: '3' },
    rows: { type: 'string' },
    'known-failures': { type: 'boolean' },
    'gates-only': { type: 'boolean' },
    candidates: { type: 'boolean' },
    harness: { type: 'string' },
    release: { type: 'boolean' },
    'exception-file': { type: 'string' },
    'allow-cli-drift': { type: 'boolean' },
    report: { type: 'boolean' },
  },
});
if (positionals.length < 1) throw new Error('usage: bun run agentic:verify <result.json> [<result.json> ...] [--release] [--reps N] [--rows id,id] [--known-failures] [--gates-only] [--candidates] [--harness name] [--exception-file <json>] [--allow-cli-drift] [--report]');

const allRows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'));

if (values.release) {
  const runs = positionals.map((file) => ({ file: path.basename(file), result: JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) }));
  // The exception file is a host-exception array, or {exceptions, acknowledged} when it also acknowledges earlier behavioral failures.
  const exceptionFile = values['exception-file']
    ? JSON.parse(fs.readFileSync(path.resolve(values['exception-file']), 'utf8'))
    : [];
  const exceptions = Array.isArray(exceptionFile) ? exceptionFile : (exceptionFile.exceptions ?? []);
  const acknowledged = Array.isArray(exceptionFile) ? [] : (exceptionFile.acknowledged ?? []).filter((entry) => entry.approved_by && entry.reason);
  if (Number(values.reps) !== 3) throw new Error('release verification requires exactly 3 repetitions');
  const exceptionHosts = new Set(exceptions.map((entry) => entry.host));
  const evidenceHosts = new Set(runs.map(({ result }) => result.harness?.name));
  const missingHosts = ['codex', 'claude', 'copilot'].filter((host) => !evidenceHosts.has(host));
  if (!exceptions.length && missingHosts.length) throw new Error(`release verification requires evidence for ${missingHosts.join(', ')}`);
  for (const host of missingHosts) {
    if (!exceptionHosts.has(host)) throw new Error(`release evidence for ${host} is missing and has no approved exception`);
  }
  const requiredRows = allRows.map((row) => row.id);
  const requiredJudgeRows = allRows.filter((row) => row.judge).map((row) => row.id);
  const current = { ...currentProvenance(repo), rows_total: allRows.length };
  const reps = Number(values.reps);
  const provenanceProblems = runs.flatMap(({ file, result }) => [
    ...validateResult(result).map((problem) => `${file}: schema: ${problem}`),
    ...(validateResult(result).length ? [] : verifyProvenance({
      result,
      current,
      // Partial runs are evidence for their own rows; coverage of the whole dataset is checked after the merge.
      expectedRows: result.selected_rows,
      expectedReps: reps,
      expectedHarness: result.harness?.name,
      changesSince: result.tree_sha ? [] : relevantChangesSince(repo, result.commit),
    }).map((problem) => `${file}: ${problem}`)),
  ]);
  const mergeProblems = [];
  const notes = [];
  const tables = [];
  const evidence = [];
  if (!provenanceProblems.length) {
    for (const host of evidenceHosts) {
      const merge = mergeHostRuns(host, runs.filter(({ result }) => result.harness?.name === host), {
        requiredRows,
        reps,
        acknowledged,
        allowCliDrift: values['allow-cli-drift'],
      });
      evidence.push(merge.merged);
      mergeProblems.push(...merge.problems);
      notes.push(...merge.notes);
      if (values.report) tables.push(...formatAttemptTable(host, merge.table));
    }
  }
  const checked = verifyReleaseEvidence({
    evidence,
    requiredHosts: ['codex', 'claude', 'copilot'],
    requiredRows,
    requiredJudgeRows,
    reps,
    exceptions,
  });
  if (values.report) console.log(['host | row | run | attempt | status', ...tables].join('\n'));
  for (const note of notes) console.log(`note: ${note}`);
  for (const failure of checked.failures) console.error(`error: ${failure}`);
  for (const problem of [...provenanceProblems, ...mergeProblems]) console.error(`error: ${problem}`);
  const passed = checked.passed && provenanceProblems.length === 0 && mergeProblems.length === 0;
  if (!passed) {
    console.error(`release check: ${checked.status}`);
    process.exitCode = 1;
  } else {
    console.log(`release evidence verified: ${requiredRows.length} rows, 3/3 on codex, claude and copilot`);
  }
} else {
if (positionals.length !== 1) throw new Error('normal verification accepts exactly one result file');

const resultFile = path.resolve(positionals[0]);
const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
const requested = values.rows?.split(',');
if (requested) {
  const unknown = requested.filter((id) => !allRows.some((row) => row.id === id));
  if (unknown.length) throw new Error(`unknown row id(s): ${unknown.join(', ')}`);
}
const expectedRows = selectRows(allRows, {
  requestedRows: requested,
  knownFailures: values['known-failures'],
  gatesOnly: values['gates-only'],
  candidates: values.candidates,
}).map((row) => row.id);
const current = { ...currentProvenance(repo), rows_total: allRows.length };
const problems = [
  ...validateResult(result).map((problem) => `schema: ${problem}`),
  ...verifyProvenance({
    result,
    current,
    expectedRows,
    expectedReps: Number(values.reps),
    expectedHarness: values.harness,
    changesSince: result.tree_sha ? [] : relevantChangesSince(repo, result.commit),
  }),
];
if (problems.length) {
  for (const problem of problems) console.error(`error: ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`verified ${path.relative(repo, resultFile)}: ${expectedRows.length}/${allRows.length} rows, ${values.reps} rep(s)`);
}
}
