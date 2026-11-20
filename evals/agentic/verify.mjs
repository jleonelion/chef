#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { currentProvenance, relevantChangesSince, verifyProvenance } from './provenance.mjs';
import { validateResult } from './result-schema.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    reps: { type: 'string', default: '3' },
    rows: { type: 'string' },
    'known-failures': { type: 'boolean' },
    'gates-only': { type: 'boolean' },
    harness: { type: 'string' },
  },
});
if (positionals.length !== 1) throw new Error('usage: bun run agentic:verify <result.json> [--reps N] [--rows id,id] [--known-failures] [--gates-only] [--harness name]');

const resultFile = path.resolve(positionals[0]);
const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
const allRows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'));
const requested = values.rows?.split(',');
if (requested) {
  const unknown = requested.filter((id) => !allRows.some((row) => row.id === id));
  if (unknown.length) throw new Error(`unknown row id(s): ${unknown.join(', ')}`);
}
const expectedRows = allRows
  .filter((row) => !requested || requested.includes(row.id))
  .filter((row) => !values['known-failures'] || row.known_failure)
  .filter((row) => !values['gates-only'] || row.gate === true)
  .map((row) => row.id);
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
