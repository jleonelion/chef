import fs from 'node:fs';
import path from 'node:path';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { wikiPath, writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';

export const PROFILE_PATH = wikiPath('household-profile', 'profile');

export function writeProfile(root, names, { date, clear = false } = {}) {
  if (clear && names?.length) return { status: 'invalid-input', data_root: root, problems: ['household members: cannot combine clear with names'] };
  if (!clear && (!Array.isArray(names) || names.length === 0)) {
    return { status: 'invalid-input', data_root: root, problems: ['household members: give at least one --household-member name or --clear-household-members'] };
  }
  const refusal = writeRefusal(root);
  if (refusal) return refusal;

  const file = path.join(root, PROFILE_PATH);
  let current = {};
  let body = '# Household profile\n';
  if (fs.existsSync(file)) {
    try {
      const page = parsePage(fs.readFileSync(file, 'utf8'));
      current = page.frontmatter;
      body = page.body;
    } catch (error) {
      return { status: 'refused', data_root: root, reason: 'the household profile cannot be read', content: fs.readFileSync(file, 'utf8') };
    }
  }
  const members = clear ? [] : [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (!members.length && !clear) return { status: 'invalid-input', data_root: root, problems: ['household members: names must not be empty'] };

  const frontmatter = {
    type: 'household-profile',
    title: current.title ?? 'Household profile',
    ...(current.portions_per_meal !== undefined && { portions_per_meal: current.portions_per_meal }),
    ...(members.length && { members: members.map((name) => ({ name })) }),
    updated: date,
  };
  const written = writeWiki(root, {
    pages: [{ slug: 'profile', frontmatter, body }],
    message: 'chef-setup: update household roster',
  });
  if (written.status !== 'written') return written;
  return { status: 'saved', data_root: root, members };
}
