// The only frontmatter reader and writer: Markdown pages with a leading YAML block.
// YAML 1.2 core schema, so dates such as 2026-01-15 stay strings.
import { parse, stringify } from 'yaml';

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parsePage(text) {
  const match = text.match(BLOCK);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter = parse(match[1], { schema: 'core' }) ?? {};
  if (typeof frontmatter !== 'object' || Array.isArray(frontmatter)) throw new Error('frontmatter must be a YAML mapping');
  return { frontmatter, body: text.slice(match[0].length) };
}

export function serializePage(frontmatter, body) {
  const yaml = stringify(frontmatter, { schema: 'core', lineWidth: 0, flowCollectionPadding: false });
  return `---\n${yaml}---\n${body}`;
}
