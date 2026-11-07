// The recipe-decisions store: proposals with their decision history and publication, and
// standing rules. Operational JSON under data/recipe-decisions/; only this skill writes it.
import fs from 'node:fs';
import path from 'node:path';

export const STORE_DIR = 'data/recipe-decisions';
export const PROPOSALS_FILE = `${STORE_DIR}/proposals.json`;
export const RULES_FILE = `${STORE_DIR}/standing-rules.json`;

function readJson(root, rel, empty) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : empty;
}

export const readProposals = (root) => readJson(root, PROPOSALS_FILE, { proposals: {} });
export const readRules = (root) => readJson(root, RULES_FILE, { auto_reject: [], auto_approve: [] });

// A data file for writeWiki.
export const storeFile = (rel, value) => ({ path: rel, content: `${JSON.stringify(value, null, 2)}\n` });

// open (no decision yet, deferred or revised), accepted or rejected: the latest decision wins.
export function proposalState(record) {
  const last = record.decisions.at(-1)?.outcome;
  if (last === 'accept') return 'accepted';
  if (last === 'reject') return 'rejected';
  return 'open';
}

export function summary(record) {
  const last = record.decisions.at(-1);
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    state: proposalState(record),
    proposed: record.proposed,
    ...(record.note && { note: record.note }),
    ...(record.gate_reasons && { reasons: record.gate_reasons }),
    ...(last && { decided: last.date, by: last.by, ...(last.reason && { reason: last.reason }) }),
    ...(record.published && { published: record.published }),
  };
}
