import fs from 'node:fs';
import path from 'node:path';
import { HOUSEHOLD_PROFILE_PATH } from '../../../../lib/household-profile.mjs';
import { readRuleset } from '../../../../lib/dietary-ruleset.mjs';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';

const DEFAULT_BODY = '# Household profile\n';

function inputProblems(members) {
  if (!Array.isArray(members) || members.some((name) => typeof name !== 'string' || !name.trim())) {
    return ['every household member needs a name'];
  }
  const names = members.map((name) => name.trim());
  return new Set(names).size === names.length ? [] : ['household member names must be unique'];
}

export function writeHouseholdProfile(root, { members, date, rewrite = false }) {
  const problems = inputProblems(members);
  if (problems.length) return { status: 'invalid-input', data_root: root, problems };
  const refusal = writeRefusal(root);
  if (refusal) return refusal;

  const file = path.join(root, HOUSEHOLD_PROFILE_PATH);
  let page = { frontmatter: {}, body: DEFAULT_BODY };
  if (fs.existsSync(file)) {
    try {
      page = parsePage(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      if (!rewrite) return { status: 'refused', data_root: root, reason: `the household profile can't be read (${error.message})`, content: fs.readFileSync(file, 'utf8') };
    }
  }

  const roster = members.map((name) => ({ name: name.trim() }));
  if (roster.length) {
    const names = new Set(roster.map(({ name }) => name));
    const unknown = readRuleset(root).members.find(({ name }) => !names.has(name));
    if (unknown) return { status: 'invalid-input', data_root: root, problems: [`members: dietary rules name unknown household member ${JSON.stringify(unknown.name)}`] };
  }
  const frontmatter = {
    ...page.frontmatter,
    type: 'household-profile',
    title: page.frontmatter.title ?? 'Household profile',
    members: roster,
    updated: date,
  };
  const written = writeWiki(root, {
    pages: [{ slug: 'profile', frontmatter, body: page.body || DEFAULT_BODY }],
    message: 'chef-setup: update household roster',
  });
  return written.status === 'written'
    ? { status: 'saved', data_root: root, path: written.pages[0], members: roster }
    : written;
}
