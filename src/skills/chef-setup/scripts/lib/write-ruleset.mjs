// The dietary ruleset writer: onboarding's allergy question and later changes, one member at a time.
// The first hard constraint also records the one-time training-setting notice, in the same commit.
import fs from 'node:fs';
import path from 'node:path';
import { dietaryNotes, normalizeConstraints, readRuleset, rulesetFromPage, RULESET_PATH, RULESET_SLUG, RULESET_TYPE } from '../../../../lib/dietary-ruleset.mjs';
import { noticeToRecord } from '../../../../lib/notices.mjs';
import { TRAINING_NOTICE } from '../../../../lib/safety-text.mjs';
import { writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';

const line = (m) => {
  const parts = [m.hard_constraints?.length && `must never eat ${m.hard_constraints.join(', ')}`, m.avoidances?.length && `avoids ${m.avoidances.join(', ')}`];
  return `- ${m.name}: ${parts.filter(Boolean).join('; ')}.`;
};

function body(members) {
  const rules = members.length ? members.map(line) : ['- No dietary constraints declared.'];
  return `# Dietary ruleset\n\nHard constraints never appear in a suggestion. Avoidances are steered around.\n\n${rules.join('\n')}\n`;
}

function nextMembers(members, { member, hard, avoid }) {
  const current = members.find((m) => m.name === member) ?? { name: member };
  const updated = {
    name: member,
    hard_constraints: hard ? normalizeConstraints(hard) : current.hard_constraints ?? [],
    avoidances: avoid ? [...new Set(avoid.map((a) => a.trim().toLowerCase()).filter(Boolean))] : current.avoidances ?? [],
  };
  const others = members.filter((m) => m.name !== member);
  return updated.hard_constraints.length || updated.avoidances.length ? [...others, updated] : others;
}

function inputProblems({ none, member, hard, avoid }) {
  if (none) return member || hard || avoid ? ['--none cannot be combined with member rules'] : [];
  if (!member?.trim()) return ['give --member <name> (or --none)'];
  return hard || avoid ? [] : ['give --hard and/or --avoid for the member'];
}

export function writeRuleset(root, change, { date, rewrite = false }) {
  const problems = inputProblems(change);
  if (problems.length) return { status: 'invalid-input', data_root: root, problems };
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
    ...(caveats && { caveats }), ...(notice && { notice: TRAINING_NOTICE }), ...(removed.length && { removed_hard_constraints: removed }),
  };
}
