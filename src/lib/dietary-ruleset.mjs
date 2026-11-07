// The dietary ruleset: one data-root page of per-member hard constraints and avoidances.
// Three states: never asked (no page), none declared (page, no rules), declared.
// A page Chef cannot read is `unreadable`, and the gate then leaves every recipe out.
import fs from 'node:fs';
import path from 'node:path';
import { DIETARY_FLAGS } from './dietary-flags.mjs';
import { parsePage } from './frontmatter.mjs';
import { GUARANTEE_LINE, NEVER_ASKED_NUDGE, textOnlyCaveat } from './safety-text.mjs';
import { wikiPath } from './wiki.mjs';

export const RULESET_TYPE = 'dietary-ruleset';
export const RULESET_SLUG = 'dietary-ruleset';
export const RULESET_PATH = wikiPath(RULESET_TYPE, RULESET_SLUG);

const ALIASES = {
  milk: ['dairy'], lactose: ['dairy'], eggs: ['egg'], peanut: ['peanuts'], 'tree nut': ['tree-nuts'], 'tree nuts': ['tree-nuts'],
  nuts: ['peanuts', 'tree-nuts'], nut: ['peanuts', 'tree-nuts'], celiac: ['gluten'], coeliac: ['gluten'], crustacean: ['shellfish'],
  crustaceans: ['shellfish'], soya: ['soy'],
};

// Lowercase names; flag-set members by their flag suffix (gluten, tree-nuts), others as written.
export function normalizeConstraints(names) {
  const out = names.flatMap((raw) => {
    const name = String(raw).trim().toLowerCase().replace(/^contains-/, '');
    return ALIASES[name] ?? (name ? [name] : []);
  });
  return [...new Set(out)].sort();
}

export const flagFor = (constraint) => (DIETARY_FLAGS.includes(`contains-${constraint}`) ? `contains-${constraint}` : null);

const textList = (value) => value === undefined || (Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim()));

function membersProblem(members) {
  if (members === undefined) return null;
  if (!Array.isArray(members)) return 'members must be a list';
  const bad = members.find((m) => typeof m?.name !== 'string' || !m.name.trim() || !textList(m.hard_constraints) || !textList(m.avoidances));
  return bad ? 'every member needs a name, and constraints must be lists of text' : null;
}

export function rulesetFromPage(frontmatter) {
  const problem = frontmatter.type !== RULESET_TYPE ? `page type is not ${RULESET_TYPE}` : membersProblem(frontmatter.members);
  if (problem) return { status: 'unreadable', reason: problem, members: [], hard: [], avoid: [] };
  const members = frontmatter.members ?? [];
  const hard = members.flatMap((m) => normalizeConstraints(m.hard_constraints ?? []).map((constraint) => ({ member: m.name, constraint })));
  const avoid = members.flatMap((m) => (m.avoidances ?? []).map((a) => ({ member: m.name, avoidance: a.trim().toLowerCase() })));
  return { status: hard.length || avoid.length ? 'declared' : 'none-declared', members, hard, avoid };
}

export function readRuleset(root) {
  const file = path.join(root, RULESET_PATH);
  if (!fs.existsSync(file)) return { status: 'never-asked', members: [], hard: [], avoid: [] };
  try {
    return rulesetFromPage(parsePage(fs.readFileSync(file, 'utf8')).frontmatter);
  } catch (error) {
    return { status: 'unreadable', reason: error.message, members: [], hard: [], avoid: [] };
  }
}

// What a plan or list must say about the ruleset: the never-asked nudge, or the check-labels footer.
export function dietaryNotes(ruleset) {
  const notes = { status: ruleset.status };
  if (ruleset.status === 'never-asked') notes.nudge = NEVER_ASKED_NUDGE;
  if (ruleset.status === 'unreadable') notes.problem = `The dietary ruleset can't be read (${ruleset.reason}), so Chef left every recipe out. Fix it with chef-setup.`;
  if (ruleset.hard.length || ruleset.status === 'unreadable') notes.footer = GUARANTEE_LINE;
  const textOnly = [...new Set(ruleset.hard.map((h) => h.constraint).filter((c) => !flagFor(c)))];
  if (textOnly.length) notes.caveats = textOnly.map(textOnlyCaveat);
  return notes;
}
