import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasHomePath, skillErrors } from './skill-format.mjs';

const md = (name, description = 'Does a thing.') => `---\nname: ${name}\ndescription: ${description}\n---\n\n# x\n`;

test('accepts a well-formed chef- skill', () => {
  assert.deepEqual(skillErrors('chef-setup', md('chef-setup')), []);
});

test('rejects a missing chef- prefix', () => {
  assert.equal(skillErrors('setup', md('setup')).length, 1);
});

test('rejects mismatched name, missing description and missing frontmatter', () => {
  assert.match(skillErrors('chef-a', md('chef-b'))[0], /does not match/);
  assert.match(skillErrors('chef-a', md('chef-a', ''))[0], /description is missing/);
  assert.match(skillErrors('chef-a', '# no frontmatter')[0], /no frontmatter/);
});

test('flags hardcoded home paths', () => {
  assert.equal(hasHomePath('cd /Users/someone/x'), true);
  assert.equal(hasHomePath('~/workspace/chef'), false);
});
