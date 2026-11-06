// Skill-format rules: chef- prefix, valid Agent Skills frontmatter, no hardcoded home paths.
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
