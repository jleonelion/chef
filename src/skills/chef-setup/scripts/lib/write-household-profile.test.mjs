import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readHouseholdProfile, HOUSEHOLD_PROFILE_PATH } from '../../../../lib/household-profile.mjs';
import { parsePage, serializePage } from '../../../../lib/frontmatter.mjs';
import { initDataRoot } from './init-data-root.mjs';
import { writeHouseholdProfile } from './write-household-profile.mjs';

const root = () => {
  const dataRoot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-household-')), 'chef');
  initDataRoot(dataRoot);
  return dataRoot;
};

test('records a names-only roster while preserving household portions', () => {
  const dataRoot = root();
  const file = path.join(dataRoot, HOUSEHOLD_PROFILE_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializePage(
    { type: 'household-profile', title: 'Household profile', portions_per_meal: 4, updated: '2026-01-10' },
    '# Household profile\n\nExisting notes.\n',
  ));

  const result = writeHouseholdProfile(dataRoot, { members: [' Alex Example ', 'Sam Example'], date: '2026-01-20' });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.members, [{ name: 'Alex Example' }, { name: 'Sam Example' }]);
  const page = parsePage(fs.readFileSync(file, 'utf8'));
  assert.equal(page.frontmatter.portions_per_meal, 4);
  assert.equal(page.frontmatter.updated, '2026-01-20');
  assert.deepEqual(page.frontmatter.members, result.members);
  assert.match(page.body, /Existing notes/);
  assert.equal(readHouseholdProfile(dataRoot).servings_source, 'roster');
});

test('rejects blank or duplicate member names without writing', () => {
  for (const [members, problem] of [
    [['Alex Example', '  '], 'every household member needs a name'],
    [['Alex Example', 'Alex Example'], 'household member names must be unique'],
  ]) {
    const dataRoot = root();
    const result = writeHouseholdProfile(dataRoot, { members, date: '2026-01-20' });
    assert.equal(result.status, 'invalid-input');
    assert.deepEqual(result.problems, [problem]);
    assert.equal(fs.existsSync(path.join(dataRoot, HOUSEHOLD_PROFILE_PATH)), false);
  }
});
