// Skill-format rules: chef- prefix, valid Agent Skills frontmatter, no hardcoded home paths, v1 roster.
const NAME = /^chef-[a-z0-9]+(-[a-z0-9]+)*$/;
const HOME_PATH = /\/(Users|home)\/[A-Za-z0-9._-]+/;

export function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-z][\w-]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

export function skillErrors(dirName, skillMd) {
  const errors = [];
  if (!NAME.test(dirName) || dirName.length > 64) errors.push(`${dirName}: name must be chef-<kebab-case>, at most 64 chars`);
  const fm = parseFrontmatter(skillMd);
  if (!fm) return [...errors, `${dirName}: SKILL.md has no frontmatter block`];
  if (fm.name !== dirName) errors.push(`${dirName}: frontmatter name "${fm.name}" does not match folder`);
  if (!fm.description) errors.push(`${dirName}: frontmatter description is missing`);
  else if (fm.description.length > 1024) errors.push(`${dirName}: description exceeds 1024 chars`);
  if (/[<>]/.test(fm.description ?? '')) errors.push(`${dirName}: description must not contain < or >`);
  return errors;
}

export const hasHomePath = (text) => HOME_PATH.test(text);

// The 10 v1 skills (lionclaw-config wayfinder/chef-muse/SPEC.md, Package shape).
export const V1_SKILLS = Object.freeze([
  'chef-setup', 'chef-add-recipe', 'chef-recipe-search', 'chef-recipe-decisions', 'chef-meal-planning',
  'chef-meal-logging', 'chef-food-inventory', 'chef-shopping-lists', 'chef-batch-prep-planning', 'chef-health-goals',
]);

export const missingSkills = (names) => V1_SKILLS.filter((n) => !names.includes(n));

// Release mode: plugin version major >= 1, or an explicit --release.
export const isRelease = (version, flag) => flag || Number.parseInt(version, 10) >= 1;

// Unknown skills always fail; missing v1 skills fail only in release mode.
export function rosterErrors(names, release) {
  const errors = names.filter((n) => !V1_SKILLS.includes(n))
    .map((n) => `${n}: not a v1 skill (see V1_SKILLS in scripts/lib/skill-format.mjs)`);
  const missing = missingSkills(names);
  if (release && missing.length) errors.push(`${missing.length} v1 skill(s) missing before release: ${missing.join(', ')}`);
  return errors;
}
