import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { adoptDataRoot, sourceProblem } from './adopt-data-root.mjs';
import { initDataRoot } from './init-data-root.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-adopt-'));

// A bare repo holding a data root, like the import tool's throwaway hand-off repo.
function bareSource({ schema } = {}) {
  const dir = tmp();
  const work = path.join(dir, 'work');
  initDataRoot(work);
  fs.mkdirSync(path.join(work, 'wiki'));
  fs.writeFileSync(path.join(work, 'wiki', 'note.md'), '# Note\n');
  if (schema !== undefined) fs.writeFileSync(path.join(work, 'schema-version.json'), JSON.stringify(schema));
  git(work, 'add', '-A');
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'seed');
  git(dir, 'clone', '-q', '--bare', 'work', 'source.git');
  return path.join(dir, 'source.git');
}

test('clones the source into the data root and removes the remote', () => {
  const target = path.join(tmp(), 'chef');
  const result = adoptDataRoot(target, bareSource());
  assert.equal(result.status, 'adopted');
  assert.equal(result.schema_version, 1);
  assert.deepEqual(result.removed_remotes, ['origin']);
  assert.equal(git(target, 'remote'), '');
  assert.equal(fs.readFileSync(path.join(target, 'wiki', 'note.md'), 'utf8'), '# Note\n');
  assert.match(git(target, 'log', '--oneline'), /seed/);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['chef']);
});

test('adopts into an existing empty folder', () => {
  const target = tmp();
  assert.equal(adoptDataRoot(target, bareSource()).status, 'adopted');
});

test('refuses a non-empty folder and leaves it untouched', () => {
  const target = tmp();
  fs.writeFileSync(path.join(target, 'mine.txt'), 'keep');
  const result = adoptDataRoot(target, bareSource());
  assert.equal(result.status, 'refused');
  assert.deepEqual(fs.readdirSync(target), ['mine.txt']);
});

test('refuses when a data root already exists there', () => {
  const target = path.join(tmp(), 'chef');
  initDataRoot(target);
  assert.match(adoptDataRoot(target, bareSource()).reason, /already a Chef data root/);
});

test('refuses a source that is not a data root and leaves nothing behind', () => {
  const dir = tmp();
  git(dir, 'init', '-q', '--bare', 'empty.git');
  const target = path.join(tmp(), 'chef');
  const result = adoptDataRoot(target, path.join(dir, 'empty.git'));
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /not a Chef data root/);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), []);
});

test('refuses a source on another schema with an update pointer', () => {
  const target = path.join(tmp(), 'chef');
  const result = adoptDataRoot(target, bareSource({ schema: { schema_version: 2 } }));
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /update Chef/);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), []);
});

test('reports a clone failure without creating the data root', () => {
  const target = path.join(tmp(), 'chef');
  const result = adoptDataRoot(target, path.join(tmp(), 'nope'));
  assert.equal(result.status, 'invalid-input');
  assert.equal(fs.existsSync(target), false);
});

test('a source that is not a git repo fails the clone cleanly', () => {
  const target = path.join(tmp(), 'chef');
  const result = adoptDataRoot(target, tmp());
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /clone failed/);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), []);
});

test('accepts only git URLs and existing folders', () => {
  for (const ok of ['https://github.com/example/chef-data.git', 'ssh://git@example.com/chef.git', 'git@github.com:example/chef-data.git', 'file:///srv/chef.git']) {
    assert.equal(sourceProblem(ok), null, ok);
  }
  for (const bad of ['', '-uevil', '--upload-pack=touch /tmp/x', 'ext::sh -c touch% /tmp/x', 'http://example.com/a.git', 'fd::3']) {
    assert.ok(sourceProblem(bad), bad);
  }
});
