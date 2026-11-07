// Muse runtime adapter: the only place that knows runtime specifics. Other runtimes
// (Claude Code, Muse Code) reuse it and override the data root with CHEF_DATA_ROOT.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOCALE_VARS = ['LC_ALL', 'LC_MEASUREMENT', 'LANG'];
const isUsable = (value) => Boolean(value) && value !== 'C' && value !== 'POSIX' && !value.startsWith('C.');

// Muse keeps secrets in per-user custom connectors. A script never sees the value: authdc
// hands out a surrogate that Muse's egress proxy swaps for the real key, but only on requests
// to the connector's registered host. Off Muse the key comes from an environment variable.
const AUTHDC = '/opt/hatch/bin/authdc';
const PROVIDERS = {
  'usda-fdc': { connector: 'custom.usda-fdc', env: 'CHEF_USDA_FDC_KEY', placement: 'query_param:api_key' },
};
const runFile = (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });

function placementOf(text) {
  const [kind, name] = text.split(':');
  return { in: kind === 'query_param' ? 'query' : kind, name };
}

function fromConnector(spec, run) {
  let entry;
  try {
    entry = JSON.parse(run(AUTHDC, ['cred', 'surrogate', spec.connector])).credentials?.[0];
  } catch {
    return { ok: false, reason: 'not-connected' };
  }
  if (typeof entry?.surrogate !== 'string' || !entry.surrogate) return { ok: false, reason: 'not-connected' };
  if (entry.placement !== spec.placement) return { ok: false, reason: 'wrong-placement' };
  return { ok: true, value: entry.surrogate, placement: placementOf(spec.placement), source: 'connector' };
}

const pluginManifest = (repository) => path.join(repository, 'plugins', 'chef', '.claude-plugin', 'plugin.json');

function findPluginRepository(skillDir) {
  for (let candidate = path.resolve(skillDir); candidate !== path.dirname(candidate); candidate = path.dirname(candidate)) {
    if (fs.existsSync(pluginManifest(candidate))) return candidate;
  }
  return null;
}

function findWorkspaceRepository(skillsDir) {
  const workspace = path.dirname(skillsDir);
  const matches = fs.readdirSync(workspace, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(pluginManifest(path.join(workspace, entry.name))))
    .map((entry) => path.join(workspace, entry.name));
  if (matches.length !== 1) throw new Error(`expected one Chef repository in ${workspace}; found ${matches.length}`);
  return matches[0];
}

function updateInstall({ skillDir, repository }) {
  const skillsDir = path.dirname(skillDir);
  const customSkills = path.basename(skillsDir) === 'custom-skills';
  return {
    repository: repository ?? (customSkills ? findWorkspaceRepository(skillsDir) : findPluginRepository(skillDir)),
    skillsDir,
    installedName: path.basename(skillDir),
    nameForSkill: customSkills ? 'underscores' : 'hyphens',
  };
}

// Recurring Chef tasks that email household recipients. Muse pins a task's send grant to the
// recipients at approval time, so a recipient change means re-creating these tasks.
const DELIVERY_TASKS = [{ name: 'Chef shopping list', skill: 'chef-shopping-lists' }];

export const muse = {
  name: 'muse',
  isMuse: ({ exists = fs.existsSync } = {}) => exists(AUTHDC),
  // Household delivery: a payload for the user's Gmail connector. Scripts never send email.
  householdEmail({ to, subject, body }) {
    return {
      connector: 'gmail',
      to,
      subject,
      body,
      instruction: "Send this email with the user's Gmail connector; this script does not send email. If Gmail is not connected, show the list in chat and offer to forward it.",
    };
  },
  deliveryTasks(recipients) {
    return {
      action: 'recreate-delivery-tasks',
      recipients,
      tasks: DELIVERY_TASKS,
      instruction: 'Re-create each of these recurring Chef tasks that exists, so Muse asks the user to approve the new recipients, then list the tasks you re-created. Do not create a task that did not exist.',
    };
  },
  defaultDataRoot: () => path.join(os.homedir(), 'workspace', 'chef'),
  updateInstall,
  locale(env = process.env) {
    const fromEnv = LOCALE_VARS.map((name) => env[name]).find(isUsable);
    return fromEnv ?? Intl.DateTimeFormat().resolvedOptions().locale;
  },
  // What to place on a request and where: { ok, value, placement: { in, name }, source }, or
  // { ok: false, reason }. Never log or store `value`.
  credential(provider, { env = process.env, exists = fs.existsSync, run = runFile } = {}) {
    const spec = PROVIDERS[provider];
    if (!spec) throw new Error(`unknown credential provider: ${provider}`);
    if (exists(AUTHDC)) return fromConnector(spec, run);
    const value = env[spec.env]?.trim();
    return value ? { ok: true, value, placement: placementOf(spec.placement), source: 'env' } : { ok: false, reason: 'not-connected' };
  },
};
