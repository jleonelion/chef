// Recipe Publication: add accepted proposals to the recipe book. Separate from the decision,
// idempotent and retryable: a published proposal is never written again, and a recipe page that
// already exists is linked instead of overwritten. Page, raw copy and store update share one
// commit; enrichment follows as its own commit.
import { checkRecipe } from '../../../../lib/dietary-gate.mjs';
import { dietaryFlags } from '../../../../lib/dietary-flags.mjs';
import { readRuleset } from '../../../../lib/dietary-ruleset.mjs';
import { listRecipes } from '../../../../lib/recipes.mjs';
import { wikiPath, writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';
import { rawName } from '../../../chef-add-recipe/scripts/lib/add.mjs';
import { recipePage } from '../../../chef-add-recipe/scripts/lib/draft.mjs';
import { enrichRecipes } from '../../../chef-add-recipe/scripts/lib/enrich.mjs';
import { PROPOSALS_FILE, proposalState, readProposals, storeFile } from './store.mjs';

function pick(store, ids) {
  const accepted = (r) => proposalState(r) === 'accepted' && !r.published;
  if (!ids?.length) return { chosen: Object.values(store.proposals).filter(accepted) };
  const unknown = ids.filter((id) => !Object.hasOwn(store.proposals, id));
  if (unknown.length) return { problem: { status: 'not-found', ids: unknown } };
  const notAccepted = ids.filter((id) => proposalState(store.proposals[id]) !== 'accepted');
  if (notAccepted.length) return { problem: { status: 'invalid-input', problems: notAccepted.map((id) => `${id} is not accepted, so it cannot be published`) } };
  return { chosen: ids.map((id) => store.proposals[id]).filter(accepted) };
}

function plan(root, record, date, slugsInBook) {
  const path = wikiPath('recipe', record.slug);
  if (slugsInBook.has(record.slug)) return { record, published: { date, path, linked: true } };
  const raw = rawName(root, `${date.replaceAll('-', '')}-${record.slug}`, '.json');
  const page = recipePage(record.draft, { sourceKind: 'proposal', sourceUrl: record.source_url, sourceRaw: [raw], date });
  return { record, published: { date, path }, page: { slug: record.slug, ...page }, raw: { path: raw, content: `${JSON.stringify(record.draft, null, 2)}\n` } };
}

function blockedByDietaryGate(root, records, date) {
  const ruleset = readRuleset(root);
  return records.flatMap((record) => {
    const page = recipePage(record.draft, { sourceKind: 'proposal', sourceRaw: [], date });
    page.frontmatter.dietary_flags = dietaryFlags(record.draft.ingredients);
    const verdict = checkRecipe(ruleset, { slug: record.slug, ...page });
    return verdict.allowed ? [] : [{ id: record.id, slug: record.slug, title: record.title, reasons: verdict.reasons }];
  });
}

export function publishProposals(root, { ids, date, confirm = false }) {
  const refusal = writeRefusal(root);
  if (refusal) return refusal;
  const store = readProposals(root);
  const { chosen, problem } = pick(store, ids);
  if (problem) return { data_root: root, ...problem };
  if (!chosen.length) return { status: 'unchanged', data_root: root, published: [] };
  const blocked = blockedByDietaryGate(root, chosen, date);
  const confirmedIds = new Set(confirm ? (ids ?? []) : []);
  const allBlockedNamed = blocked.every((record) => confirmedIds.has(record.id));
  if (blocked.length && !allBlockedNamed) {
    return {
      status: 'refused',
      data_root: root,
      reason: 'The dietary hard-constraint gate did not allow publication. Explicit confirmation is required for each blocked proposal named with --id.',
      blocked,
    };
  }
  if (blocked.length) {
    const blockedIds = new Set(blocked.map((record) => record.id));
    for (const record of chosen.filter((candidate) => blockedIds.has(candidate.id))) {
      record.decisions.push({
        outcome: 'accept',
        date,
        by: 'user',
        reason: 'Confirmed publication despite the dietary hard-constraint gate.',
      });
    }
  }

  const slugsInBook = new Set(listRecipes(root).recipes.map((r) => r.slug));
  const plans = chosen.map((record) => plan(root, record, date, slugsInBook));
  for (const p of plans) store.proposals[p.record.id] = { ...p.record, published: p.published };
  const written = writeWiki(root, {
    pages: plans.filter((p) => p.page).map((p) => p.page),
    raw: plans.filter((p) => p.raw).map((p) => p.raw),
    data: [storeFile(PROPOSALS_FILE, store)],
    message: `chef-recipe-decisions: publish ${plans.map((p) => p.record.id).join(', ')}`,
  });
  if (written.status !== 'written') return written;
  return { status: 'published', data_root: root, published: plans.map((p) => ({ id: p.record.id, slug: p.record.slug, ...p.published })) };
}

// Publish, then enrich the newly written pages the way chef-add-recipe does.
export async function publishAndEnrich(root, { ids, date, fdc, confirm = false }) {
  const result = publishProposals(root, { ids, date, confirm });
  const fresh = result.published?.filter((p) => !p.linked).map((p) => p.slug) ?? [];
  if (result.status !== 'published' || !fresh.length) return result;
  const { recipes, hint, status, reason } = await enrichRecipes(root, { slugs: fresh, fdc, date });
  return { ...result, enrichment: recipes ?? { status, reason }, ...(hint && { hint }) };
}
