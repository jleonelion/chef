// Recipe Decision: the user's answer to a proposal in chat, kept as history on the proposal.
// accept and reject close it; defer leaves it open; revise replaces the recipe and leaves it open
// for the user to see again. The decision is committed before any publication is attempted.
import { writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';
import { checkProposal } from './propose.mjs';
import { PROPOSALS_FILE, proposalState, readProposals, storeFile, summary } from './store.mjs';

export const OUTCOMES = ['accept', 'reject', 'defer', 'revise'];
const invalid = (root, ...problems) => ({ status: 'invalid-input', data_root: root, problems });

function revised(root, record, draft) {
  if (!draft) return { problem: invalid(root, 'revise needs --draft with the changed recipe') };
  const { record: next, problem } = checkProposal(root, { draft, url: record.source_url });
  return problem ? { problem } : { changes: { slug: next.slug, title: next.title, draft: next.draft } };
}

export function decide(root, { id, outcome, reason, draft, date }) {
  if (!OUTCOMES.includes(outcome)) return invalid(root, `--outcome must be one of ${OUTCOMES.join(', ')}`);
  const refusal = writeRefusal(root);
  if (refusal) return refusal;
  const store = readProposals(root);
  const record = store.proposals[id];
  if (!record) return { status: 'not-found', data_root: root, id: id ?? null };
  if (record.published && outcome !== 'accept') return invalid(root, `${id} is already in the recipe book; retire the recipe instead`);
  const current = proposalState(record);
  if ((outcome === 'accept' && current === 'accepted') || (outcome === 'reject' && current === 'rejected')) {
    return { status: 'unchanged', data_root: root, ...summary(record) };
  }

  const { changes, problem } = outcome === 'revise' ? revised(root, record, draft) : {};
  if (problem) return problem;
  const decision = { outcome, date, by: 'user', ...(reason?.trim() && { reason: reason.trim() }) };
  const next = { ...record, ...changes, decisions: [...record.decisions, decision] };
  store.proposals[id] = next;
  const written = writeWiki(root, { data: [storeFile(PROPOSALS_FILE, store)], message: `chef-recipe-decisions: ${outcome} ${id}` });
  if (written.status !== 'written') return written;
  return { status: 'decided', data_root: root, outcome, ...summary(next), ...(changes && { draft: next.draft }) };
}
