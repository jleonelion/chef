import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePage, serializePage } from './frontmatter.mjs';

test('parses frontmatter and body', () => {
  const page = parsePage('---\ntype: recipe\ntitle: Toast\nservings: 2\ntags: [bread, quick]\ncreated: 2026-01-15\n---\n\n# Toast\n');
  assert.deepEqual(page.frontmatter, { type: 'recipe', title: 'Toast', servings: 2, tags: ['bread', 'quick'], created: '2026-01-15' });
  assert.equal(page.body, '\n# Toast\n');
});

test('a file without frontmatter has empty frontmatter and the whole text as body', () => {
  assert.deepEqual(parsePage('# Just text\n'), { frontmatter: {}, body: '# Just text\n' });
});

test('round-trips values that would break naive YAML', () => {
  const frontmatter = {
    title: 'Mom\'s "best": pasta # 1\n---\nsneaky: true',
    source_url: 'https://example.com/a?b=c&d=e',
    tags: ['a, b', '[x]'],
    nested: { status: 'complete', values: [1, 2.5] },
    empty: null,
  };
  const text = serializePage(frontmatter, '# Body\n');
  assert.deepEqual(parsePage(text), { frontmatter, body: '# Body\n' });
});

test('serialized frontmatter starts the file and ends before the body', () => {
  const text = serializePage({ type: 'recipe' }, '# Body\n');
  assert.equal(text, '---\ntype: recipe\n---\n# Body\n');
});

test('rejects frontmatter that is not a mapping', () => {
  assert.throws(() => parsePage('---\n- a\n- b\n---\nbody'), /mapping/);
});

test('rejects malformed YAML', () => {
  assert.throws(() => parsePage('---\ntitle: [unclosed\n---\nbody'));
});
