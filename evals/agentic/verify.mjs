#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { currentProvenance, relevantChangesSince, verifyProvenance } from './provenance.mjs';
import { validateResult } from './result-schema.mjs';
import { verifyReleaseEvidence } from './release-check.mjs';

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
  },
});
if (positionals.length < 1) throw new Error('usage: bun run agentic:verify <result.json> [<result.json> ...] [--release] [--reps N] [--rows id,id] [--known-failures] [--gates-only] [--candidates] [--harness name] [--exception-file <json>]');

const allRows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'));

if (values.release) {
  if (positionals.length !== 3) throw new Error('release verification requires exactly one evidence file for codex, claude and copilot');
  const evidence = positionals.map((file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')));
  const exceptions = values['exception-file']
    ? JSON.parse(fs.readFileSync(path.resolve(values['exception-file']), 'utf8'))
    : [];
  const requiredRows = allRows.filter((row) => !row.known_failure).map((row) => row.id);
  const current = { ...currentProvenance(repo), rows_total: allRows.length };
  const provenanceProblems = evidence.flatMap((result) => [
    ...validateResult(result).map((problem) => `schema: ${problem}`),
    ...verifyProvenance({
      result,
      current,
      expectedRows: requiredRows,
      expectedReps: Number(values.reps),
      expectedHarness: result.harness?.name,
      changesSince: relevantChangesSince(repo, result.commit),
    }),
  ]);
  const checked = verifyReleaseEvidence({
    evidence,
    requiredHosts: ['codex', 'claude', 'copilot'],
    requiredRows,
    reps: Number(values.reps),
    exceptions,
  });
  for (const failure of checked.failures) console.error(`error: ${failure}`);
  for (const problem of provenanceProblems) console.error(`error: ${problem}`);
  const passed = checked.passed && provenanceProblems.length === 0;
  if (!passed) {
    console.error(`release check: ${checked.status}`);
    process.exitCode = 1;
  } else {
    console.log(`release evidence verified: ${requiredRows.length} rows, 3/3 on codex, claude and copilot`);
  }
}

if (positionals.length !== 1) throw new Error('normal verification accepts exactly one result file');

const resultFile = path.resolve(positionals[0]);
const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
const requested = values.rows?.split(',');
if (requested) {
  const unknown = requested.filter((id) => !allRows.some((row) => row.id === id));
  if (unknown.length) throw new Error(`unknown row id(s): ${unknown.join(', ')}`);
}
import { selectRows } from './selection.mjs';

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
    changesSince: relevantChangesSince(repo, result.commit),
  }),
];
if (problems.length) {
  for (const problem of problems) console.error(`error: ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`verified ${path.relative(repo, resultFile)}: ${expectedRows.length}/${allRows.length} rows, ${values.reps} rep(s)`);
}
