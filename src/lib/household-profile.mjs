import fs from 'node:fs';
import path from 'node:path';
import { parsePage } from './frontmatter.mjs';
import { wikiPath } from './wiki.mjs';

export const HOUSEHOLD_PROFILE_PATH = wikiPath('household-profile', 'profile');

const namedMembers = (members) => Array.isArray(members)
  && members.every((member) => member && typeof member === 'object' && typeof member.name === 'string' && member.name.trim());

export function readHouseholdProfile(root) {
  const file = path.join(root, HOUSEHOLD_PROFILE_PATH);
  if (!fs.existsSync(file)) return { path: null, members: [], servings: 1, servings_source: 'default' };
  const { frontmatter } = parsePage(fs.readFileSync(file, 'utf8'));
  const members = namedMembers(frontmatter.members) ? frontmatter.members.map(({ name }) => ({ name: name.trim() })) : [];
  const portions = frontmatter.portions_per_meal;
  const fromProfile = Number.isInteger(portions) && portions > 0;
  return {
    path: HOUSEHOLD_PROFILE_PATH,
    members,
    servings: members.length || (fromProfile ? portions : 1),
    servings_source: members.length ? 'roster' : fromProfile ? 'profile' : 'default',
  };
}
