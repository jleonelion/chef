import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { initDataRoot } from './init-data-root.mjs';
import { PROFILE_PATH, writeProfile } from './write-profile.mjs';

test('writes a household roster through the guarded wiki writer', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-profile-')), 'root');
  initDataRoot(root);

  const result = writeProfile(root, ['Alex Example', 'Sam Example'], { date: '2026-11-07' });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.members, ['Alex Example', 'Sam Example']);
  const page = parsePage(fs.readFileSync(path.join(root, PROFILE_PATH), 'utf8'));
  assert.deepEqual(page.frontmatter.members, [{ name: 'Alex Example' }, { name: 'Sam Example' }]);
});

test('clears a household roster through the guarded wiki writer', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-profile-')), 'root');
  initDataRoot(root);
  writeProfile(root, ['Alex Example'], { date: '2026-11-07' });

  const result = writeProfile(root, [], { date: '2026-11-08', clear: true });

  assert.equal(result.status, 'saved');
  assert.deepEqual(result.members, []);
  const page = parsePage(fs.readFileSync(path.join(root, PROFILE_PATH), 'utf8'));
  assert.equal(page.frontmatter.members, undefined);
});
