#!/usr/bin/env node
// chef-recipe-decisions entry point. Modes: propose, decide, publish, list, retire, restore,
// rules, rule-add, rule-remove. An accept (by the user or a standing rule) is committed first,
// then published as its own step, so a failed publication never loses the decision.
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { usdaClient } from '../../../lib/fdc.mjs';
import { today } from '../../../lib/recipes.mjs';
import { readSchemaVersion } from '../../../lib/schema.mjs';
import { decide } from './lib/decide.mjs';
import { retireRecipe, restoreRecipe } from './lib/lifecycle.mjs';
import { propose } from './lib/propose.mjs';
import { publishAndEnrich } from './lib/publish.mjs';
import { addRule, removeRule } from './lib/rules.mjs';
import { proposalState, readProposals, readRules, summary } from './lib/store.mjs';

const many = { type: 'string', multiple: true };
const { values, positionals } = parseArgs({
  options: {
    'data-root': { type: 'string' },
    draft: { type: 'string' },
    url: { type: 'string' },
    note: { type: 'string' },
    id: many,
    outcome: { type: 'string' },
    reason: { type: 'string' },
    state: { type: 'string' },
    slug: { type: 'string' },
    action: { type: 'string' },
    confirm: { type: 'boolean' },
    title: many,
    text: many,
  },
  allowPositionals: true,
});
const root = resolveDataRoot({ flag: values['data-root'] });
const date = today();
const invalid = (...problems) => ({ status: 'invalid-input', data_root: root, problems });

function readDraft() {
  if (values.draft === undefined) return {};
  try {
    return { draft: JSON.parse(fs.readFileSync(values.draft, 'utf8')) };
  } catch (error) {
    return { problem: invalid(`--draft must be a readable JSON file: ${error.message}`) };
  }
}

const publish = (ids) => publishAndEnrich(root, { ids, date, fdc: usdaClient({ root }), confirm: values.confirm });
const withPublication = async (result, id) => ({ ...result, publication: await publish([id]) });

async function proposeMode() {
  const { draft, problem } = readDraft();
  if (problem) return problem;
  if (!draft) return invalid('--draft is required');
  const result = propose(root, { draft, url: values.url, note: values.note, date });
  return result.status === 'auto-accepted' ? withPublication(result, result.id) : result;
}

async function decideMode() {
  const { draft, problem } = readDraft();
  if (problem) return problem;
  const id = values.id?.[0];
  const result = decide(root, { id, outcome: values.outcome, reason: values.reason, draft, date });
  const accepted = values.outcome === 'accept' && ['decided', 'unchanged'].includes(result.status);
  return accepted ? withPublication(result, id) : result;
}

const STATES = ['open', 'accepted', 'rejected', 'all'];
function list() {
  const wanted = values.state ?? 'open';
  if (!STATES.includes(wanted)) return invalid(`--state must be one of ${STATES.join(', ')}`);
  const records = Object.values(readProposals(root).proposals).filter((r) => wanted === 'all' || proposalState(r) === wanted);
  return { status: 'ok', data_root: root, filter: wanted, count: records.length, proposals: records.map(summary) };
}

const MODES = {
  propose: proposeMode,
  decide: decideMode,
  publish: () => publish(values.id),
  list,
  retire: () => retireRecipe(root, { slug: values.slug, reason: values.reason, date }),
  restore: () => restoreRecipe(root, { slug: values.slug, date }),
  rules: () => ({ status: 'ok', data_root: root, ...readRules(root) }),
  'rule-add': () => addRule(root, { action: values.action, id: values.id?.[0], reason: values.reason, title: values.title, text: values.text, date }),
  'rule-remove': () => removeRule(root, { id: values.id?.[0] }),
};
const mode = positionals[0];
if (!Object.hasOwn(MODES, mode)) {
  console.error(`Unknown mode "${mode}". Supported: ${Object.keys(MODES).join(', ')}`);
  process.exit(64);
}

const result = readSchemaVersion(root) === null ? { status: 'refused', data_root: root, reason: 'not a Chef data root; run chef-setup first' } : await MODES[mode]();
console.log(JSON.stringify(result));
if (['refused', 'invalid-input', 'not-found'].includes(result.status)) process.exitCode = 2;
