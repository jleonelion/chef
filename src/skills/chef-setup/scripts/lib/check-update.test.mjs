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

function installedAt(version, { newer } = {}) {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-check-update-'));
  git(repository, 'init', '-q', '-b', 'main');
  release(repository, version);
  if (newer) {
    release(repository, newer);
    git(repository, 'checkout', '-q', '--detach', `v${version}`);
  }
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

test('a repository without release tags is refused', () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-check-update-none-'));
  git(repository, 'init', '-q', '-b', 'main');
  const result = checkUpdate({ adapter: { updateInstall: () => ({ repository }) } });
  assert.equal(result.status, 'refused');
});
