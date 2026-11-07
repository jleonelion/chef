// Recipe Proposal: record a recipe Chef wants to suggest, unless the user already decided on it
// or a standing rule decides it. Proposals are keyed by recipe slug, so a rejected recipe (same
// title or source address) is never proposed again.
import { checkRecipe } from '../../../../lib/dietary-gate.mjs';
import { readRuleset } from '../../../../lib/dietary-ruleset.mjs';
import { listRecipes, normalizeUrl } from '../../../../lib/recipes.mjs';
import { slugify, writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';
import { checkDraft, recipePage } from '../../../chef-add-recipe/scripts/lib/draft.mjs';
import { matchRule } from './rules.mjs';
import { PROPOSALS_FILE, proposalState, readProposals, readRules, storeFile, summary } from './store.mjs';

const EARLIER = { rejected: 'already-rejected', accepted: 'already-accepted', open: 'already-proposed' };

function inBook(root, slug, url) {
  const wanted = url && normalizeUrl(url);
  return listRecipes(root).recipes.find((r) => r.slug === slug || (wanted && normalizeUrl(r.frontmatter.source_url ?? '') === wanted));
}

function earlier(store, slug, url) {
  const wanted = url && normalizeUrl(url);
  return Object.values(store.proposals).find((r) => r.id === slug || r.slug === slug || (wanted && r.source_url && normalizeUrl(r.source_url) === wanted));
}

export function checkProposal(root, { draft, url, note }) {
  const { recipe, problems } = checkDraft(draft);
  if (!problems.length && url && !normalizeUrl(url)?.match(/^https?:/)) problems.push('--url must be an http or https address');
  if (problems.length) return { problem: { status: 'invalid-input', data_root: root, problems } };
  const slug = slugify(recipe.title);
  if (!slug) return { problem: { status: 'invalid-input', data_root: root, problems: ['title: needs at least one letter or digit'] } };
  return { record: { id: slug, slug, title: recipe.title, ...(url && { source_url: url }), ...(note && { note }), draft: recipe, decisions: [] } };
}

// An auto-accepted proposal still needs publishing; the caller does that as a separate step.
export function propose(root, { draft, url, note, date }) {
  const { record, problem } = checkProposal(root, { draft, url, note });
  if (problem) return problem;
  const refusal = writeRefusal(root);
  if (refusal) return refusal;

  const existing = inBook(root, record.slug, url);
  if (existing) return { status: 'exists', data_root: root, slug: existing.slug, path: existing.path, lifecycle: existing.frontmatter.lifecycle ?? 'active' };
  const store = readProposals(root);
  const prior = earlier(store, record.slug, url);
  if (prior) return { status: EARLIER[proposalState(prior)], data_root: root, ...summary(prior) };

  let match = matchRule(readRules(root), record.draft);
  record.proposed = date;
  if (match?.action === 'approve') {
    const page = recipePage(record.draft, { sourceKind: 'proposal', sourceRaw: [], date });
    const verdict = checkRecipe(readRuleset(root), { slug: record.slug, ...page });
    if (!verdict.allowed) {
      record.gate_reasons = verdict.reasons;
      match = null;
    }
  }
  if (match) record.decisions.push({ outcome: match.action === 'reject' ? 'reject' : 'accept', date, by: `rule:${match.rule.id}`, reason: match.rule.reason });
  store.proposals[record.id] = record;
  const verb = match ? `auto-${match.action}` : 'propose';
  const written = writeWiki(root, { data: [storeFile(PROPOSALS_FILE, store)], message: `chef-recipe-decisions: ${verb} ${record.id}` });
  if (written.status !== 'written') return written;
  const status = match ? `auto-${match.action === 'reject' ? 'rejected' : 'accepted'}` : 'proposed';
  return {
    status,
    data_root: root,
    ...summary(record),
    ...(match && { rule: { id: match.rule.id, reason: match.rule.reason } }),
  };
}
