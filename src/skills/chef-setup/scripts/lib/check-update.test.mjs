import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkUpdate } from './check-update.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function release(repository, version) {
  const manifest = path.join(repository, 'plugins', 'chef', '.claude-plugin', 'plugin.json');
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, `${JSON.stringify({ name: 'chef', version })}\n`);
  git(repository, 'add', '-A');
  git(repository, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', version);
  git(repository, 'tag', `v${version}`);
}

// A clone of a Chef origin that has released `version` (and `newer`, published after the clone).
function installedAt(version, { newer, origin = true } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-check-update-'));
  const upstream = path.join(parent, 'upstream');
  const repository = path.join(parent, 'clone');
  fs.mkdirSync(upstream);
  git(upstream, 'init', '-q', '-b', 'main');
  release(upstream, version);
  execFileSync('git', ['clone', '-q', upstream, repository]);
  if (newer) release(upstream, newer);
  if (!origin) git(repository, 'remote', 'remove', 'origin');
  return { repository, adapter: { updateInstall: () => ({ repository }) } };
}

test('reports a newer release tag without installing it', () => {
  const { repository, adapter } = installedAt('0.1.0', { newer: '0.2.0' });
  const head = git(repository, 'rev-parse', 'HEAD');
  assert.deepEqual(checkUpdate({ adapter }), { status: 'update-available', installed: '0.1.0', latest: 'v0.2.0' });
  assert.equal(git(repository, 'rev-parse', 'HEAD'), head);
});

test('reports current when the installed version is the newest tag', () => {
  const { adapter } = installedAt('0.2.0');
  assert.deepEqual(checkUpdate({ adapter }), { status: 'current', installed: '0.2.0', latest: 'v0.2.0' });
});

test('a clone without an origin remote is refused, never reported current', () => {
  const { adapter } = installedAt('0.2.0', { origin: false });
  assert.deepEqual(checkUpdate({ adapter }), {
    status: 'refused',
    reason: 'no remote to check for releases: add the Chef repository as the origin remote',
  });
});

test('a clone whose origin has no release tags is refused', () => {
  const { repository, adapter } = installedAt('0.2.0');
  git(repository, 'tag', '--delete', 'v0.2.0');
  git(path.join(repository, '..', 'upstream'), 'tag', '--delete', 'v0.2.0');
  assert.deepEqual(checkUpdate({ adapter }), { status: 'refused', reason: 'Chef repository has no semver release tags' });
});
