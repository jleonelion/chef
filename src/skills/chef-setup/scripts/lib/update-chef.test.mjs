import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { updateChef } from './update-chef.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-update-'));
const runGit = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function commit(cwd, message) {
  runGit(cwd, 'add', '-A');
  runGit(cwd, '-c', 'user.name=chef-test', '-c', 'user.email=chef-test@example.com', 'commit', '-q', '-m', message);
}

function releaseRepository() {
  const parent = tmp();
  const source = path.join(parent, 'source');
  const origin = path.join(parent, 'origin.git');
  const clone = path.join(parent, 'clone');
  fs.mkdirSync(source);
  runGit(source, 'init', '-q', '-b', 'main');

  const skills = path.join(source, 'plugins', 'chef', 'skills');
  fs.mkdirSync(path.join(skills, 'chef-setup'), { recursive: true });
  fs.mkdirSync(path.join(skills, 'chef-dropped'), { recursive: true });
  fs.writeFileSync(path.join(skills, 'chef-setup', 'release.txt'), 'v1.0.0\n');
  fs.writeFileSync(path.join(skills, 'chef-dropped', 'release.txt'), 'v1.0.0\n');
  commit(source, 'release 1.0.0');
  runGit(source, 'tag', 'v1.0.0');

  fs.rmSync(path.join(skills, 'chef-dropped'), { recursive: true });
  fs.mkdirSync(path.join(skills, 'chef-added'));
  fs.writeFileSync(path.join(skills, 'chef-setup', 'release.txt'), 'v1.1.0\n');
  fs.writeFileSync(path.join(skills, 'chef-added', 'release.txt'), 'v1.1.0\n');
  commit(source, 'release 1.1.0');
  runGit(source, 'tag', 'v1.1.0');

  execFileSync('git', ['clone', '--bare', source, origin], { stdio: 'ignore' });
  execFileSync('git', ['clone', '-q', origin, clone]);
  runGit(clone, 'checkout', '-q', 'v1.0.0');
  return clone;
}

function dataRoot() {
  const root = tmp();
  runGit(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, '.gitignore'), 'settings.json\n');
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":0}\n');
  fs.writeFileSync(path.join(root, 'settings.json'), '{"settings_version":0,"old_units":"metric"}\n');
  fs.writeFileSync(path.join(root, 'user-data.txt'), 'keep me\n');
  commit(root, 'fixture');
  fs.writeFileSync(path.join(root, 'user-data.txt'), 'keep all of this\n');
  return root;
}

function install() {
  const skillsDir = path.join(tmp(), 'custom-skills');
  fs.mkdirSync(path.join(skillsDir, 'chef_setup'), { recursive: true });
  fs.mkdirSync(path.join(skillsDir, 'chef_dropped'), { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'chef_setup', 'release.txt'), 'v1.0.0\n');
  fs.writeFileSync(path.join(skillsDir, 'chef_dropped', 'release.txt'), 'v1.0.0\n');
  return skillsDir;
}

function fixture() {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":1}\n');
  return root;
}

const migrations = {
  0: (root) => fs.writeFileSync(path.join(root, 'migration-ran.txt'), 'yes\n'),
};
const settingsMigrations = {
  0: (stored) => ({ settings_version: 1, units: stored.old_units }),
};

test('installs the latest tagged skills but waits for confirmation before migrating', () => {
  const repository = releaseRepository();
  const root = dataRoot();
  const skillsDir = install();
  const adapter = { updateInstall: () => ({ repository, skillsDir, nameForSkill: 'underscores' }) };

  const result = updateChef(root, {
    adapter,
    skillDir: path.join(skillsDir, 'chef_setup'),
    fixture: fixture(),
    migrations,
    settingsMigrations,
  });

  assert.equal(result.status, 'confirmation-required');
  assert.equal(result.release, 'v1.1.0');
  assert.deepEqual(result.changes.skills, { added: ['chef_added'], replaced: ['chef_setup'], removed: ['chef_dropped'] });
  assert.deepEqual(result.changes.migrations, { data_root: [0], settings: [0] });
  assert.equal(runGit(root, 'log', '-1', '--pretty=%s'), 'Before Chef update');
  assert.equal(fs.readFileSync(path.join(root, 'user-data.txt'), 'utf8'), 'keep all of this\n');
  assert.equal(fs.existsSync(path.join(root, 'migration-ran.txt')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'schema-version.json'))).schema_version, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'))).settings_version, 0);
  assert.deepEqual(fs.readdirSync(skillsDir).sort(), ['chef_added', 'chef_setup']);
  assert.equal(fs.readFileSync(path.join(skillsDir, 'chef_setup', 'release.txt'), 'utf8'), 'v1.1.0\n');
});

test('confirmed update migrates data and settings, then verifies the installed fixture', () => {
  const repository = releaseRepository();
  const root = dataRoot();
  const skillsDir = install();
  const adapter = { updateInstall: () => ({ repository, skillsDir, nameForSkill: 'underscores' }) };

  const result = updateChef(root, {
    adapter,
    skillDir: path.join(skillsDir, 'chef_setup'),
    fixture: fixture(),
    migrations,
    settingsMigrations,
    confirm: true,
  });

  assert.equal(result.status, 'updated');
  assert.equal(result.verify.status, 'pass', JSON.stringify(result.verify));
  assert.equal(fs.readFileSync(path.join(root, 'migration-ran.txt'), 'utf8'), 'yes\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'))), { settings_version: 1, units: 'metric' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'schema-version.json'))).schema_version, 1);
  assert.equal(fs.readFileSync(path.join(root, 'user-data.txt'), 'utf8'), 'keep all of this\n');
});
