// The one dietary gate. Hard constraints fail closed: a recipe is left out when it is flagged
// for a constraint, its ingredient text matches it, or Chef can't check it. Avoidances are
// only reported. Overrides lift one member's constraint for one call and are never stored.
import { dietaryFlags } from './dietary-flags.mjs';
import { flagFor } from './dietary-ruleset.mjs';
import { ingredientLines } from './recipes.mjs';

// Decision (spec 17 #5): enrichment's `dietary_flags` (including []) count as checked for
// flag-set constraints. Set false to require a `verified_by_user` date for every one instead.
export const AUTO_FLAGS_COUNT_AS_CHECKED = true;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordMatch = (term) => new RegExp(`(?<![a-z])${escape(term)}(?:s|es)?(?![a-z])`);

// Conflicts the recipe itself shows for one constraint: its stored flag, or a matching ingredient line.
export function constraintConflicts(recipe, constraint) {
  const lines = ingredientLines(recipe.body);
  const flag = flagFor(constraint);
  const flags = recipe.frontmatter.dietary_flags;
  const conflicts = [];
  if (flag && Array.isArray(flags) && flags.includes(flag)) conflicts.push({ why: 'flagged', detail: flag });
  const matches = flag ? (line) => dietaryFlags([line]).includes(flag) : (line) => wordMatch(constraint).test(line.toLowerCase());
  const line = lines.find(matches);
  if (line) conflicts.push({ why: 'ingredient-text', detail: line });
  return conflicts;
}

const isVerified = (recipe, constraint) => /^\d{4}-\d{2}-\d{2}$/.test(String(recipe.frontmatter.verified_by_user?.[constraint] ?? ''));

// Why Chef can't vouch for a recipe that shows no conflict, or null when it can.
function uncheckedReason(recipe, constraint, autoFlagsCount) {
  if (isVerified(recipe, constraint)) return null;
  if (!ingredientLines(recipe.body).length) return 'no-ingredients';
  if (!flagFor(constraint)) return null;
  if (!Array.isArray(recipe.frontmatter.dietary_flags)) return 'not-checked';
  return autoFlagsCount ? null : 'unverified';
}

function hardReasons(recipe, { member, constraint }, autoFlagsCount) {
  const conflicts = constraintConflicts(recipe, constraint);
  const unchecked = conflicts.length ? null : uncheckedReason(recipe, constraint, autoFlagsCount);
  const found = unchecked ? [{ why: unchecked }] : conflicts;
  return found.map((c) => ({ member, constraint, ...c }));
}

function avoidanceMatches(recipe, { member, avoidance }) {
  const line = ingredientLines(recipe.body).find((l) => wordMatch(avoidance).test(l.toLowerCase()));
  return line ? [{ member, avoidance, detail: line }] : [];
}

export function gateRecipe(recipe, ruleset, { overrides = [], autoFlagsCount = AUTO_FLAGS_COUNT_AS_CHECKED } = {}) {
  if (ruleset.status === 'unreadable') return { excluded: true, reasons: [{ why: 'ruleset-unreadable' }], overridden: [], avoidances: [] };
  const all = ruleset.hard.flatMap((rule) => hardReasons(recipe, rule, autoFlagsCount));
  const lifted = (r) => overrides.some((o) => o.member === r.member && o.constraint === r.constraint);
  const reasons = all.filter((r) => !lifted(r));
  const avoidances = ruleset.avoid.flatMap((rule) => avoidanceMatches(recipe, rule));
  return { excluded: reasons.length > 0, reasons, overridden: all.filter(lifted), avoidances };
}
