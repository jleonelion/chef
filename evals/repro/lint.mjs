#!/usr/bin/env node
// Lints reproduction cases (evals/repro/*.json) against their tier1 and agentic rows, and runs the
// PII pattern scan over cases, seeds and fixtures/. Exits 1 on any error. See README.md.
//   node evals/repro/lint.mjs [--repro-dir <dir>] [--tier1 <cases.json>] [--agentic <rows.json>] [--today YYYY-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { scanPii } from '../../src/lib/pii-scan.mjs';
import { lintRepro } from './repro.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');
const { values } = parseArgs({
  options: { 'repro-dir': { type: 'string' }, tier1: { type: 'string' }, agentic: { type: 'string' }, today: { type: 'string' } },
});
const reproDir = path.resolve(values['repro-dir'] ?? import.meta.dirname);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const cases = fs
  .readdirSync(reproDir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => {
    const text = fs.readFileSync(path.join(reproDir, file), 'utf8');
    return { file, data: JSON.parse(text), text };
  });
const suites = {
  tier1: readJson(path.resolve(values.tier1 ?? path.join(repo, 'evals', 'tier1', 'cases.json'))),
  agentic: readJson(path.resolve(values.agentic ?? path.join(repo, 'evals', 'agentic', 'rows.json'))),
};
const today = values.today ?? new Date().toISOString().slice(0, 10);
const errors = lintRepro({ cases, suites, today, exists: (p) => fs.existsSync(path.join(repo, p)) });

const fixtures = path.join(repo, 'fixtures');
for (const file of fs.readdirSync(fixtures, { recursive: true }).map((f) => path.join(fixtures, f))) {
  if (!fs.statSync(file).isFile()) continue;
  for (const f of scanPii(fs.readFileSync(file, 'utf8'))) errors.push(`${path.relative(repo, file)}: line ${f.line}: ${f.rule}`);
}

for (const e of errors) console.error(`error: ${e}`);
if (errors.length) process.exit(1);
console.log(`repro lint passed: ${cases.length} case(s); cases, seeds and fixtures clean`);
