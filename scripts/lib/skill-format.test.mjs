import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasHomePath, isRelease, missingSkills, rosterErrors, skillErrors, tier1CoverageErrors, V1_SKILLS } from './skill-format.mjs';

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

test('V1_SKILLS has the 10 spec names, all chef- prefixed', () => {
  assert.equal(V1_SKILLS.length, 10);
  assert.ok(V1_SKILLS.includes('chef-add-recipe') && V1_SKILLS.includes('chef-recipe-search'));
  for (const name of V1_SKILLS) assert.deepEqual(skillErrors(name, md(name)), []);
});

test('rejects skill folders not in the v1 list', () => {
  assert.deepEqual(rosterErrors(['chef-setup', 'chef-recipe-serch'], false), [
    'chef-recipe-serch: not a v1 skill (see V1_SKILLS in scripts/lib/skill-format.mjs)',
  ]);
});

test('missing v1 skills are reported but only fail a release', () => {
  assert.deepEqual(rosterErrors(['chef-setup'], false), []);
  assert.match(rosterErrors(['chef-setup'], true)[0], /^9 v1 skill\(s\) missing before release: chef-add-recipe, /);
  assert.deepEqual(rosterErrors(V1_SKILLS, true), []);
  assert.equal(missingSkills(['chef-setup']).length, 9);
});

test('release mode applies at plugin major >= 1 or with --release', () => {
  assert.equal(isRelease('0.1.0', false), false);
  assert.equal(isRelease('0.9.3', true), true);
  assert.equal(isRelease('1.0.0', false), true);
  assert.equal(isRelease('12.0.0-rc.1', false), true);
});

test('every v1 skill must be exercised by a tier1 case command or step', () => {
  const cases = V1_SKILLS.map((name) => ({
    id: `${name}-case`,
    command: ['node', `{skills}/${name}/scripts/run.mjs`],
  }));
  cases[0] = {
    id: 'cross-skill-case',
    command: ['node', '{skills}/chef-recipe-search/scripts/run.mjs'],
    steps: [{ command: ['node', '{skills}/chef-setup/scripts/run.mjs'] }],
  };

  assert.deepEqual(tier1CoverageErrors(cases), []);
  assert.deepEqual(tier1CoverageErrors(cases.filter((entry) => entry.id !== 'chef-health-goals-case')), [
    'chef-health-goals: no tier1 case in evals/tier1/cases.json',
  ]);
});
