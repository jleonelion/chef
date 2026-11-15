import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { SETTINGS_MIGRATIONS } from '../../../../lib/settings.mjs';
import { muse } from '../../../../runtime/muse.mjs';
import { updateChef } from './update-chef.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-update-'));
const runGit = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function commit(cwd, message) {
  runGit(cwd, 'add', '-A');
  runGit(cwd, '-c', 'user.name=chef-test', '-c', 'user.email=chef-test@example.com', 'commit', '-q', '-m', message);
}

function recurringTasks(cwd, tasks) {
  const file = path.join(cwd, 'src', 'lib', 'recurring-tasks.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(tasks)}\n`);
}

function releaseRepository({ catalog = true, targetOnly = false, targetPrompt = 'build --upcoming' } = {}) {
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
  if (catalog) recurringTasks(source, [{ name: 'Chef shopping list', prompt: 'build the latest plan' }]);
  commit(source, 'release 1.0.0');
  runGit(source, 'tag', 'v1.0.0');

  fs.rmSync(path.join(skills, 'chef-dropped'), { recursive: true });
  fs.mkdirSync(path.join(skills, 'chef-added'));
  fs.writeFileSync(path.join(skills, 'chef-setup', 'release.txt'), 'v1.1.0\n');
  fs.writeFileSync(path.join(skills, 'chef-added', 'release.txt'), 'v1.1.0\n');
  if (catalog) {
    recurringTasks(source, [
      { name: 'Chef shopping list', prompt: targetPrompt },
      ...(targetOnly ? [{ name: 'Chef new task', prompt: 'new prompt' }] : []),
    ]);
  }
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
  fs.writeFileSync(path.join(skillsDir, 'chef_setup', 'local-only.txt'), 'must be removed\n');
  fs.writeFileSync(path.join(skillsDir, 'chef_dropped', 'release.txt'), 'v1.0.0\n');
  return skillsDir;
}

const adapterFor = (repository, skillsDir) => ({
  ...muse,
  updateInstall: () => ({ repository, skillsDir, nameForSkill: 'underscores' }),
});

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
  1: SETTINGS_MIGRATIONS[1],
};

test('installs the latest tagged skills but waits for confirmation before migrating', () => {
  const repository = releaseRepository();
  const root = dataRoot();
  const skillsDir = install();
  const adapter = adapterFor(repository, skillsDir);

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
  assert.deepEqual(result.changes.migrations, { data_root: [0], settings: [0, 1] });
  assert.deepEqual(result.changes.recurring_tasks, [
    { name: 'Chef shopping list', prompt: 'build --upcoming' },
  ]);
  assert.equal(runGit(root, 'log', '-1', '--pretty=%s'), 'Before Chef update');
  assert.equal(fs.readFileSync(path.join(root, 'user-data.txt'), 'utf8'), 'keep all of this\n');
  assert.equal(fs.existsSync(path.join(root, 'migration-ran.txt')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'schema-version.json'))).schema_version, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'))).settings_version, 0);
  assert.deepEqual(fs.readdirSync(skillsDir).sort(), ['chef_added', 'chef_setup']);
  assert.equal(fs.readFileSync(path.join(skillsDir, 'chef_setup', 'release.txt'), 'utf8'), 'v1.1.0\n');
  assert.equal(fs.existsSync(path.join(skillsDir, 'chef_setup', 'local-only.txt')), false);
});

test('confirmed update migrates data and settings, then verifies the installed fixture', () => {
  const repository = releaseRepository();
  const root = dataRoot();
  const skillsDir = install();
  const adapter = adapterFor(repository, skillsDir);

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
  assert.deepEqual(result.recurring_tasks.tasks, [
    { name: 'Chef shopping list', prompt: 'build --upcoming' },
  ]);
  assert.match(result.recurring_tasks.instruction, /already exists/);
  assert.match(result.recurring_tasks.instruction, /explicit approval/);
  assert.match(result.recurring_tasks.instruction, /chosen time/);
  assert.match(result.recurring_tasks.instruction, /Do not create/);
  assert.match(result.recurring_tasks.instruction, /list the tasks/);
  assert.equal(fs.readFileSync(path.join(root, 'migration-ran.txt'), 'utf8'), 'yes\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'settings.json'))), { settings_version: 2, units: 'metric', diagnostics: { trace: 'on' } });
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'schema-version.json'))).schema_version, 1);
  assert.equal(fs.readFileSync(path.join(root, 'user-data.txt'), 'utf8'), 'keep all of this\n');
});

test('confirmed update retains prompt changes found by an earlier preview', () => {
  const repository = releaseRepository();
  const root = dataRoot();
  const skillsDir = install();
  const options = {
    adapter: adapterFor(repository, skillsDir),
    skillDir: path.join(skillsDir, 'chef_setup'),
    fixture: fixture(),
    migrations,
    settingsMigrations,
  };

  const preview = updateChef(root, options);
  const confirmed = updateChef(root, { ...options, confirm: true });

  assert.equal(preview.status, 'confirmation-required');
  assert.deepEqual(confirmed.recurring_tasks.tasks, [
    { name: 'Chef shopping list', prompt: 'build --upcoming' },
  ]);
});

test('an unchanged recurring task prompt produces no change or re-create instruction', () => {
  const repository = releaseRepository({ targetPrompt: 'build the latest plan' });
  const root = dataRoot();
  const skillsDir = install();
  const result = updateChef(root, {
    adapter: adapterFor(repository, skillsDir),
    skillDir: path.join(skillsDir, 'chef_setup'),
    fixture: fixture(),
    migrations,
    settingsMigrations,
    confirm: true,
  });

  assert.deepEqual(result.changes.recurring_tasks, []);
  assert.equal(Object.hasOwn(result, 'recurring_tasks'), false);
});

test('a recurring task added only in the target release is not a prompt change', () => {
  const repository = releaseRepository({ targetOnly: true, targetPrompt: 'build the latest plan' });
  const root = dataRoot();
  const skillsDir = install();
  const result = updateChef(root, {
    adapter: adapterFor(repository, skillsDir),
    skillDir: path.join(skillsDir, 'chef_setup'),
    fixture: fixture(),
    migrations,
    settingsMigrations,
  });

  assert.deepEqual(result.changes.recurring_tasks, []);
});

test('updates releases created before the recurring task catalog existed', () => {
  const repository = releaseRepository({ catalog: false });
  const root = dataRoot();
  const skillsDir = install();
  const result = updateChef(root, {
    adapter: adapterFor(repository, skillsDir),
    skillDir: path.join(skillsDir, 'chef_setup'),
    fixture: fixture(),
    migrations,
    settingsMigrations,
    confirm: true,
  });

  assert.equal(result.status, 'updated');
  assert.deepEqual(result.changes.recurring_tasks, []);
});

test('a clone without an origin remote is refused before the data root is touched', () => {
  const repository = releaseRepository();
  runGit(repository, 'remote', 'remove', 'origin');
  const root = dataRoot();
  const skillsDir = install();
  const head = runGit(root, 'rev-parse', 'HEAD');
  const adapter = adapterFor(repository, skillsDir);

  assert.throws(() => updateChef(root, { adapter, skillDir: path.join(skillsDir, 'chef_setup') }), {
    message: 'no remote to check for releases: add the Chef repository as the origin remote',
  });
  assert.equal(runGit(root, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.readFileSync(path.join(skillsDir, 'chef_setup', 'release.txt'), 'utf8'), 'v1.0.0\n');
});
