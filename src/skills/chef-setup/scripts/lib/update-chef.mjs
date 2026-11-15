import fs from 'node:fs';
import path from 'node:path';
import { commit, git } from '../../../../lib/git.mjs';
import { migrate, MIGRATIONS, migrationPlan } from '../../../../lib/migrations.mjs';
import { SCHEMA_VERSION } from '../../../../lib/schema.mjs';
import { migrateSettings, SETTINGS_MIGRATIONS, settingsMigrationPlan } from '../../../../lib/settings-migrations.mjs';
import { SETTINGS_VERSION } from '../../../../lib/settings.mjs';
import { muse } from '../../../../runtime/muse.mjs';
import { verifyInstall } from './verify-install.mjs';

const TAG = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;
const UPDATE_BASE_REF = 'refs/chef/update-base';

export function semver(tag) {
  const match = tag.match(TAG);
  if (!match) return null;
  return { tag, numbers: match.slice(1, 4).map(Number), prerelease: match[4]?.split('.') ?? [] };
}

function compareIdentifier(left, right) {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left.localeCompare(right);
}

export function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left.numbers[index] !== right.numbers[index]) return left.numbers[index] - right.numbers[index];
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) return right.prerelease.length - left.prerelease.length;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const compared = compareIdentifier(left.prerelease[index], right.prerelease[index]);
    if (compared !== 0) return compared;
  }
  return 0;
}

export function latestTag(repository) {
  const remotes = git(repository, ['remote']).split('\n').filter(Boolean);
  if (!remotes.includes('origin')) throw new Error('no remote to check for releases: add the Chef repository as the origin remote');
  git(repository, ['fetch', '--tags', '--force', 'origin']);
  const releases = git(repository, ['tag', '--list']).split('\n').filter(Boolean).map(semver).filter(Boolean).sort(compareSemver);
  if (releases.length === 0) throw new Error('Chef repository has no semver release tags');
  return releases.at(-1).tag;
}

function commitPending(root, message) {
  git(root, ['add', '-A']);
  if (!git(root, ['status', '--short'])) return false;
  commit(root, message);
  return true;
}

const chefFolder = (name) => /^chef[-_][a-z0-9_-]+$/.test(name);
const installedName = (sourceName, style) => (style === 'underscores' ? sourceName.replaceAll('-', '_') : sourceName);

function taggedSkills(repository, tag) {
  return git(repository, ['ls-tree', '--name-only', `${tag}:plugins/chef/skills`]).split('\n').filter(chefFolder).sort();
}

function skillChanges(skillsDir, expected) {
  const current = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter(chefFolder).sort() : [];
  return {
    added: expected.filter((name) => !current.includes(name)),
    replaced: expected.filter((name) => current.includes(name)),
    removed: current.filter((name) => !expected.includes(name)),
  };
}

function recurringTasksAt(repository, ref) {
  const file = 'src/lib/recurring-tasks.json';
  if (!git(repository, ['ls-tree', '--name-only', ref, '--', file])) return null;
  const object = `${ref}:${file}`;
  return JSON.parse(git(repository, ['show', object]));
}

function recurringTaskChanges(repository, target) {
  let base;
  try {
    base = git(repository, ['rev-parse', '--verify', UPDATE_BASE_REF]);
  } catch {
    base = git(repository, ['rev-parse', 'HEAD']);
    git(repository, ['update-ref', UPDATE_BASE_REF, base]);
  }
  const installedTasks = recurringTasksAt(repository, base);
  const targetTasks = recurringTasksAt(repository, target);
  if (!installedTasks || !targetTasks) return [];
  const installed = new Map(installedTasks.map((task) => [task.name, task.prompt]));
  return targetTasks
    .filter((task) => installed.has(task.name) && installed.get(task.name) !== task.prompt)
    .map(({ name, prompt }) => ({ name, prompt }));
}

function syncSkills(repository, skillsDir, sourceNames, expectedNames) {
  const source = path.join(repository, 'plugins', 'chef', 'skills');
  if (path.resolve(source) === path.resolve(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir).filter(chefFolder)) {
      if (!expectedNames.includes(name)) fs.rmSync(path.join(skillsDir, name), { recursive: true, force: true });
    }
    return;
  }
  fs.mkdirSync(skillsDir, { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(skillsDir), '.chef-update-'));
  try {
    for (let index = 0; index < sourceNames.length; index += 1) {
      fs.cpSync(path.join(source, sourceNames[index]), path.join(staging, expectedNames[index]), { recursive: true });
    }
    for (const name of fs.readdirSync(skillsDir).filter(chefFolder)) fs.rmSync(path.join(skillsDir, name), { recursive: true, force: true });
    for (const name of expectedNames) fs.renameSync(path.join(staging, name), path.join(skillsDir, name));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function updateChef(root, {
  adapter = muse,
  skillDir,
  fixture,
  confirm = false,
  migrations = MIGRATIONS,
  settingsMigrations = SETTINGS_MIGRATIONS,
  targetSchema = SCHEMA_VERSION,
  targetSettings = SETTINGS_VERSION,
} = {}) {
  const install = adapter.updateInstall({ skillDir });
  const release = latestTag(install.repository);
  commitPending(root, 'Before Chef update');

  const sourceNames = taggedSkills(install.repository, release);
  const expectedNames = sourceNames.map((name) => installedName(name, install.nameForSkill));
  const skills = skillChanges(install.skillsDir, expectedNames);
  const promptChanges = recurringTaskChanges(install.repository, release);
  const dataPlan = migrationPlan(root, { migrations, target: targetSchema });
  const settingsPlan = settingsMigrationPlan(root, { migrations: settingsMigrations, target: targetSettings });

  git(install.repository, ['checkout', '--detach', release]);
  const repositoryChanges = git(install.repository, ['status', '--short', '--untracked-files=all']);
  if (repositoryChanges) throw new Error(`Chef repository is not clean after checking out ${release}`);
  syncSkills(install.repository, install.skillsDir, sourceNames, expectedNames);
  const changes = {
    skills,
    migrations: { data_root: dataPlan.applied, settings: settingsPlan.applied },
    recurring_tasks: promptChanges,
  };
  if (!confirm) return { status: 'confirmation-required', data_root: root, release, changes };

  migrate(root, { migrations, target: targetSchema });
  migrateSettings(root, { migrations: settingsMigrations, target: targetSettings });
  commitPending(root, `Migrate Chef data root to schema ${targetSchema}`);
  const verify = verifyInstall(root, { skillsDir: install.skillsDir, fixture });
  const taskUpdates = promptChanges.length > 0 && { recurring_tasks: adapter.recurringTaskUpdates(promptChanges) };
  const status = verify.status === 'pass' ? 'updated' : 'fail';
  if (status === 'updated') git(install.repository, ['update-ref', '-d', UPDATE_BASE_REF]);
  return { status, data_root: root, release, changes, verify, ...taskUpdates };
}
