// The dietary ruleset writer: onboarding's allergy question and later changes, one member at a time.
// The first hard constraint also records the one-time training-setting notice, in the same commit.
import fs from 'node:fs';
import path from 'node:path';
import { constraintReadings, dietaryNotes, normalizeConstraints, readRuleset, rulesetFromPage, RULESET_PATH, RULESET_SLUG, RULESET_TYPE } from '../../../../lib/dietary-ruleset.mjs';
import { readHouseholdProfile } from '../../../../lib/household-profile.mjs';
import { noticeToRecord } from '../../../../lib/notices.mjs';
import { TRAINING_NOTICE } from '../../../../lib/safety-text.mjs';
import { writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';
import { mergeList } from '../../../../lib/list-edits.mjs';

const line = (m) => {
  const parts = [m.hard_constraints?.length && `must never eat ${m.hard_constraints.join(', ')}`, m.avoidances?.length && `avoids ${m.avoidances.join(', ')}`];
  return `- ${m.name}: ${parts.filter(Boolean).join('; ')}.`;
};

function body(members) {
  const rules = members.length ? members.map(line) : ['- No dietary constraints declared.'];
  return `# Dietary ruleset\n\nHard constraints never appear in a suggestion. Avoidances are steered around.\n\n${rules.join('\n')}\n`;
}

function nextMembers(members, { member, hard, avoid, addHard, removeHard, addAvoid, removeAvoid }) {
  const current = members.find((m) => m.name === member) ?? { name: member };
  const normalizedAddHard = normalizeConstraints(addHard ?? []);
  const normalizedRemoveHard = normalizeConstraints(removeHard ?? []);
  const normalizedAddAvoid = (addAvoid ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const normalizedRemoveAvoid = (removeAvoid ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const hardMerge = mergeList(
    current.hard_constraints ?? [],
    hard ? { replace: hard } : { add: normalizedAddHard, remove: normalizedRemoveHard },
  );
  const avoidMerge = mergeList(
    current.avoidances ?? [],
    avoid ? { replace: avoid } : { add: normalizedAddAvoid, remove: normalizedRemoveAvoid },
  );
  const updated = {
    name: member,
    hard_constraints: hard ? normalizeConstraints(hard) : normalizeConstraints(hardMerge.value),
    avoidances: avoid ? [...new Set(avoid.map((a) => a.trim().toLowerCase()).filter(Boolean))] : avoidMerge.value,
  };
  const index = members.findIndex((m) => m.name === member);
  if (index === -1) {
    return updated.hard_constraints.length || updated.avoidances.length ? [...members, updated] : members;
  }
  if (!updated.hard_constraints.length && !updated.avoidances.length) {
    return members.filter((_, memberIndex) => memberIndex !== index);
  }
  return members.map((existing, memberIndex) => (memberIndex === index ? updated : existing));
}

function inputProblems({ none, member, hard, avoid, addHard, removeHard, addAvoid, removeAvoid }) {
  if (none) return member || hard || avoid || addHard || removeHard || addAvoid || removeAvoid ? ['--none cannot be combined with member rules'] : [];
  if (!member?.trim()) return ['give --member <name> (or --none)'];
  if (hard && (addHard?.length || removeHard?.length)) return ['--hard cannot be combined with --add-hard or --remove-hard'];
  if (avoid && (addAvoid?.length || removeAvoid?.length)) return ['--avoid cannot be combined with --add-avoid or --remove-avoid'];
  return hard || avoid || addHard?.length || removeHard?.length || addAvoid?.length || removeAvoid?.length ? [] : ['give --hard, --avoid, or an add/remove flag for the member'];
}

export function writeRuleset(root, change, { date, rewrite = false }) {
  const problems = inputProblems(change);
  if (problems.length) return { status: 'invalid-input', data_root: root, problems };
  const roster = readHouseholdProfile(root).members;
  if (change.member && roster.length && !roster.some(({ name }) => name === change.member.trim())) {
    return { status: 'invalid-input', data_root: root, problems: [`--member: unknown household member ${JSON.stringify(change.member.trim())}`] };
  }
  const refusal = writeRefusal(root);
  if (refusal) return refusal;
  const current = readRuleset(root);
  if (current.status === 'unreadable' && !rewrite) {
    return { status: 'refused', data_root: root, reason: `the dietary ruleset can't be read (${current.reason})`, content: fs.readFileSync(path.join(root, RULESET_PATH), 'utf8') };
  }
  if (change.none && current.status === 'declared') {
    return { status: 'refused', data_root: root, reason: 'dietary constraints are declared; remove them one member at a time instead' };
  }

  const members = change.none ? [] : nextMembers(current.members, { ...change, member: change.member.trim() });
  if (!change.none && JSON.stringify(members) === JSON.stringify(current.members)) {
    return { status: 'unchanged', data_root: root, ruleset: { status: current.status, members } };
  }
  const frontmatter = { type: RULESET_TYPE, title: 'Dietary ruleset', members, updated: date };
  const saved = rulesetFromPage(frontmatter);
  const notice = saved.hard.length ? noticeToRecord(root, 'training-setting', date) : null;
  const written = writeWiki(root, {
    pages: [{ slug: RULESET_SLUG, frontmatter, body: body(members) }],
    data: notice ? [notice] : [],
    message: 'chef-setup: update dietary ruleset',
  });
  if (written.status !== 'written') return written;

  const removed = current.hard.filter((h) => !saved.hard.some((s) => s.member === h.member && s.constraint === h.constraint)).map((h) => h.constraint);
  const { status, caveats } = dietaryNotes(saved);
  return {
    status: 'saved', data_root: root, ruleset: { status, members },
    ...(change.hard?.length && { read_as: constraintReadings(change.hard) }), ...(caveats && { caveats }), ...(notice && { notice: TRAINING_NOTICE }), ...(removed.length && { removed_hard_constraints: removed }),
  };
}
