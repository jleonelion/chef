// Reproduction-case lint: each evals/repro/<case_id>.json validates against
// schemas/feedback/reproduction-case.v1.json and links both ways with its test row.
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { scanPii } from '../../src/lib/pii-scan.mjs';

export const KNOWN_FAILURE_MAX_DAYS = 60;
const repo = path.resolve(import.meta.dirname, '..', '..');
const schema = JSON.parse(fs.readFileSync(path.join(repo, 'schemas', 'feedback', 'reproduction-case.v1.json'), 'utf8'));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

const schemaErrors = (label, data) =>
  validate(data) ? [] : validate.errors.map((e) => `${label}: ${e.instancePath || '/'} ${e.message}${e.params?.missingProperty ? ` (${e.params.missingProperty})` : ''}`);

// "tier1:<row id>" → {suite: 'tier1', ref: '<row id>'}; "docs:<path>" → {suite: 'docs', ref: '<path>'}.
const parseTestRef = (test) => ({ suite: test.slice(0, test.indexOf(':')), ref: test.slice(test.indexOf(':') + 1) });

// Case → test: the pointer resolves and the row carries repro: <case_id>.
function caseLinkErrors(label, data, suites, exists) {
  const errors = [];
  const { fixture, test } = data.scenario;
  if (!exists(`fixtures/${fixture}`)) errors.push(`${label}: fixture fixtures/${fixture} not found`);
  if (!test) return errors;
  const { suite, ref } = parseTestRef(test);
  if (suite === 'docs') return exists(ref) ? errors : [...errors, `${label}: doc ${ref} not found`];
  if (!suites[suite]) return [...errors, `${label}: ${suite} suite not found`];
  const row = suites[suite].find((r) => r.id === ref);
  if (!row) return [...errors, `${label}: ${suite} row ${ref} not found`];
  if (row.repro !== data.case_id) errors.push(`${label}: ${suite} row ${ref} must carry repro: ${data.case_id}`);
  const rowFixture = suite === 'tier1' ? (row.fixture ?? 'data-root') : 'data-root';
  if (rowFixture !== fixture) errors.push(`${label}: fixture ${fixture} does not match ${suite} row fixture ${rowFixture}`);
  return errors;
}

const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

// A known_failure marker names the row's own case and lapses KNOWN_FAILURE_MAX_DAYS after it was written.
function knownFailureErrors(label, row, byId, today) {
  if (row.known_failure === undefined) return [];
  if (row.known_failure !== row.repro) return [`${label}: known_failure ${row.known_failure} must equal repro ${row.repro}`];
  const found = byId.get(row.repro);
  const age = found ? daysBetween(found.created_on, today) : 0;
  return age > KNOWN_FAILURE_MAX_DAYS ? [`${label}: known_failure ${row.known_failure} is ${age} days old (max ${KNOWN_FAILURE_MAX_DAYS}); fix it or drop the case`] : [];
}

const piiErrors = (label, text) => scanPii(text).map((f) => `${label}line ${f.line}: ${f.rule}`);

// Seeds are synthetic overlays on the shared fixture; their paths and content must hold no personal details.
function seedErrors(label, row) {
  return [...(row.seed ?? []), ...(row.afterCommitSeed ?? [])].flatMap((file) => [
    ...scanPii(file.path).map((f) => `${label}: seed path: ${f.rule}`),
    ...piiErrors(`${label}: seed ${file.path} `, typeof file.content === 'string' ? file.content : JSON.stringify(file.content)),
  ]);
}

// Test → case: a row's repro names a case that points back at that row.
function rowLinkErrors(suite, row, byId) {
  if (row.repro === undefined) return [];
  const label = `${suite} row ${row.id}`;
  const found = byId.get(row.repro);
  if (!found) return [`${label}: repro case ${row.repro} not found in evals/repro`];
  const test = found.scenario.test;
  return test === `${suite}:${row.id}` ? [] : [`${label}: repro case ${row.repro} points at ${test ?? 'no test'}`];
}

// cases: [{file, data}]; suites: {tier1: rows, agentic: rows}; today: YYYY-MM-DD;
// exists(repoPath) says whether a repo-relative path exists.
export function lintRepro({ cases, suites, today, exists }) {
  const errors = [];
  const byId = new Map();
  for (const { file, data, text } of cases) {
    const label = `evals/repro/${file}`;
    errors.push(...piiErrors(`${label}: `, text));
    const found = schemaErrors(label, data);
    errors.push(...found);
    if (found.length) continue;
    if (file !== `${data.case_id}.json`) errors.push(`${label}: file name must be ${data.case_id}.json`);
    byId.set(data.case_id, data);
    errors.push(...caseLinkErrors(label, data, suites, exists));
  }
  for (const [suite, rows] of Object.entries(suites)) {
    for (const row of rows) {
      const label = `${suite} row ${row.id}`;
      errors.push(...rowLinkErrors(suite, row, byId), ...knownFailureErrors(label, row, byId, today), ...seedErrors(label, row));
    }
  }
  return errors;
}
