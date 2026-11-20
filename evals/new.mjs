#!/usr/bin/env node
// Scaffolds a lint-clean eval row: tier1 -> evals/tier1/cases/<skill>.json, agentic -> evals/agentic/rows.json.
// The id is <skill>-<slug>. --from-repro <case_id> links the row to evals/repro/<case_id>.json and
// marks it known_failure (see evals/repro/README.md). Agentic repros also require the stable check
// they expect to fail. Fill in the TODOs, then run `bun run evals:lint`.
//   node evals/new.mjs <tier1|agentic> <skill> <slug> [--topic <topic>] [--from-repro <case_id>] [--expect-failure <check>]
// A skill split into cases/<skill>.<topic>.json files needs --topic.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadCases, repoRoot } from './lib/load-cases.mjs';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const AGENTIC_CHECKS = ['response', 'skills', 'scripts', 'tools', 'files', 'git-state', 'post-run'];

const skeletons = {
  tier1: (id, skill) => ({
    id,
    description: 'TODO: what this case proves.',
    command: ['node', `{skills}/${skill}/scripts/TODO.mjs`],
    parse: 'json',
    assertions: [{ path: '$.TODO', equals: 'TODO' }],
    git: { headUnchanged: true, clean: true },
  }),
  agentic: (id, skill) => ({
    id,
    flow: 'core',
    description: 'TODO: what this row proves.',
    turns: ['TODO: the prompt.'],
    skills: [skill],
    files: [],
    git: { headUnchanged: true, clean: true },
    gate: false,
  }),
};

function target(root, suite, skill, topic) {
  if (suite === 'agentic') return path.join(root, 'evals', 'agentic', 'rows.json');
  const dir = path.join(root, 'evals', 'tier1', 'cases');
  const topics = fs.existsSync(dir) ? fs.readdirSync(dir).flatMap((name) => name.match(new RegExp(`^${skill}\\.(.+)\\.json$`))?.[1] ?? []) : [];
  if (topics.length && !topic) throw new Error(`${skill} is split by topic; pass --topic (${topics.join(', ')})`);
  return path.join(dir, `${skill}${topic ? `.${topic}` : ''}.json`);
}

// Appends one row without reformatting the rest of the file.
function appendRow(file, row) {
  const body = JSON.stringify(row, null, 2).replace(/^/gm, '  ');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trimEnd() : '[]';
  const head = existing.slice(0, -1).trimEnd();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${head}${head.endsWith('[') ? '\n' : ',\n'}${body}\n]\n`);
}

// Returns {file, id}; throws on bad input or an id that already exists.
export function scaffold({ root = repoRoot, suite, skill, slug, topic, fromRepro, expectFailure }) {
  if (!skeletons[suite]) throw new Error(`suite must be tier1 or agentic, got ${suite}`);
  if (!fs.existsSync(path.join(root, 'src', 'skills', skill ?? ''))) throw new Error(`unknown skill ${skill}; use a folder name from src/skills`);
  if (!KEBAB.test(slug ?? '')) throw new Error(`slug must be lowercase kebab-case, got ${slug}`);
  const id = `${skill}-${slug}`;
  const dataset = suite === 'tier1' ? path.join(root, 'evals', 'tier1', 'cases') : path.join(root, 'evals', 'agentic', 'rows.json');
  if (fs.existsSync(dataset) && loadCases(dataset).some((row) => row.id === id)) throw new Error(`${suite} id ${id} already exists`);
  if (fromRepro !== undefined && !fs.existsSync(path.join(root, 'evals', 'repro', `${fromRepro}.json`))) throw new Error(`repro case ${fromRepro} not found in evals/repro`);
  if (suite === 'agentic' && fromRepro !== undefined && expectFailure === undefined) throw new Error('agentic --from-repro requires --expect-failure');
  if (expectFailure !== undefined && (suite !== 'agentic' || fromRepro === undefined)) throw new Error('--expect-failure is only valid for an agentic --from-repro row');
  if (expectFailure !== undefined && !AGENTIC_CHECKS.includes(expectFailure)) throw new Error(`--expect-failure must be ${AGENTIC_CHECKS.join('|')}`);
  const file = target(root, suite, skill, topic);
  const row = skeletons[suite](id, skill);
  if (fromRepro !== undefined) Object.assign(row, { repro: fromRepro, known_failure: fromRepro });
  if (expectFailure !== undefined) row.expect_failure = expectFailure;
  appendRow(file, row);
  return { file, id };
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'from-repro': { type: 'string' }, 'expect-failure': { type: 'string' }, topic: { type: 'string' } },
  });
  const [suite, skill, slug] = positionals;
  try {
    const { file, id } = scaffold({ suite, skill, slug, topic: values.topic, fromRepro: values['from-repro'], expectFailure: values['expect-failure'] });
    console.log(`added ${id} to ${path.relative(repoRoot, file)}; fill in the TODOs, then run bun run evals:lint`);
  } catch (error) {
    console.error(`error: ${error.message}\nusage: bun run evals:new <tier1|agentic> <skill> <slug> [--topic <topic>] [--from-repro <case_id>] [--expect-failure <check>]`);
    process.exit(1);
  }
}
