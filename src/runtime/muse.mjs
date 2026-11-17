// Muse runtime adapter: the only place that knows Muse specifics. Off Muse, runtime identity and
// feedback come from the generic adapter (see contract.mjs); the household helpers here still
// serve Claude Code and Muse Code, which override the data root with CHEF_DATA_ROOT.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DELIVERY_TASKS } from '../lib/recurring-tasks.mjs';

const LOCALE_VARS = ['LC_ALL', 'LC_MEASUREMENT', 'LANG'];
const isUsable = (value) => Boolean(value) && value !== 'C' && value !== 'POSIX' && !value.startsWith('C.');

// Muse keeps secrets in per-user custom connectors. A script never sees the value: authdc
// hands out a surrogate that Muse's egress proxy swaps for the real key, but only on requests
// to the connector's registered host. Off Muse the key comes from an environment variable.
const AUTHDC = '/opt/hatch/bin/authdc';
const PROVIDERS = {
  'usda-fdc': { connector: 'custom.usda-fdc', env: 'CHEF_USDA_FDC_KEY', placement: 'query_param:api_key' },
  'chef-feedback': {
    connector: 'custom.chef-feedback',
    placement: { custom_header: 'X-Chef-Intake-Key' },
  },
};
const FEEDBACK_URL = 'https://chef-feedback-intake.vercel.app/v1/reports';
const ATTACHMENT_INSTRUCTION = 'Send this PDF as a downloadable attachment in this chat; do not return only the filesystem path or add it to Library.';
const runFile = (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });

function placementOf(text) {
  if (typeof text === 'object' && text !== null && typeof text.custom_header === 'string') {
    return { in: 'header', name: text.custom_header };
  }
  if (typeof text !== 'string') return null;
  const [kind, name] = text.split(':');
  return { in: kind === 'query_param' ? 'query' : kind, name };
}

function placementMatches(actual, expected) {
  if (typeof expected === 'string') return actual === expected;
  return (
    typeof actual === 'object' &&
    actual !== null &&
    Object.keys(actual).length === 1 &&
    actual.custom_header === expected.custom_header
  );
}

function fromConnector(spec, run) {
  let entry;
  try {
    entry = JSON.parse(run(AUTHDC, ['cred', 'surrogate', spec.connector])).credentials?.[0];
  } catch {
    return { ok: false, reason: 'not-connected' };
  }
  if (typeof entry?.surrogate !== 'string' || !entry.surrogate) return { ok: false, reason: 'not-connected' };
  if (!placementMatches(entry.placement, spec.placement)) return { ok: false, reason: 'wrong-placement' };
  const placement = placementOf(entry.placement);
  if (!placement) return { ok: false, reason: 'wrong-placement' };
  return { ok: true, value: entry.surrogate, placement, source: 'connector' };
}

const isReceipt = (value) =>
  typeof value === 'object' &&
  value !== null &&
  typeof value.report_id === 'string' &&
  /^[0-9a-f-]{36}$/i.test(value.report_id) &&
  typeof value.receipt_secret === 'string' &&
  value.receipt_secret.length >= 32;

function isNetworkError(error) {
  return error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
}

async function feedbackRequest(url, init, fetchImpl) {
  try {
    return await fetchImpl(url, { ...init, redirect: 'error' });
  } catch (error) {
    if (isNetworkError(error)) return null;
    throw error;
  }
}

// 503 intake-closed: the maintainer closed intake. `message` is their short plain-words reason,
// kept only when it is one line of at most 200 characters.
async function closedIntake(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (body?.reason !== 'intake-closed') return null;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const plain = message && message.length <= 200 && !/[\u0000-\u001f\u007f]/.test(message);
  return { ok: false, reason: 'intake-closed', ...(plain ? { message } : {}) };
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
  const where = `next to ${path.basename(skillsDir)}/ in ${workspace}`;
  const names = fs.readdirSync(workspace, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(pluginManifest(path.join(workspace, entry.name))))
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0) throw new Error(`no Chef repository found ${where}; clone Chef there or reinstall`);
  if (names.length > 1) {
    throw new Error(`found ${names.length} Chef repositories ${where}: ${names.join(', ')}; keep one and remove the others`);
  }
  return path.join(workspace, names[0]);
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

// Recurring Chef tasks that email household recipients (DELIVERY_TASKS). Muse pins a task's
// send grant to the recipients at approval time, so a recipient change means re-creating them.
const SCHEDULE_SETUP = 'Create each task only after the user gives an explicit yes to that task. Ask Muse to create it as a recurring task with exactly the given name, cadence (in the user\'s timezone) and prompt, then list the tasks you created. If a task with that name already exists, leave it as it is. Approve any Gmail send grant Muse asks for only with the user.';

export const muse = {
  name: 'muse',
  adapterVersion: 1,
  adapterContractVersion: 1,
  feedback: {
    destination: { host: new URL(FEEDBACK_URL).host },
    // Whether the Chef feedback connector is usable, and why not: not-connected or wrong-placement.
    status({ exists = fs.existsSync, run = runFile } = {}) {
      if (!exists(AUTHDC)) return { ok: false, reason: 'not-connected' };
      const { ok, reason } = fromConnector(PROVIDERS['chef-feedback'], run);
      return ok ? { ok } : { ok, reason };
    },
    capabilities({ exists = fs.existsSync, run = runFile } = {}) {
      if (!exists(AUTHDC)) return [];
      const credential = fromConnector(PROVIDERS['chef-feedback'], run);
      return credential.ok ? ['submit.connector', 'contact.opaque', 'delete.receipt'] : [];
    },
    async submit(bytes, { exists = fs.existsSync, run = runFile, fetchImpl = fetch } = {}) {
      const credential = muse.credential('chef-feedback', { exists, run });
      if (!credential.ok) return { ok: false, reason: 'unsupported' };
      const response = await feedbackRequest(
        FEEDBACK_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [credential.placement.name]: credential.value },
          body: bytes,
        },
        fetchImpl,
      );
      if (!response) return { ok: false, reason: 'unreachable' };
      const closed = response.status === 503 && await closedIntake(response);
      if (closed) return closed;
      if (response.status !== 201) {
        const reason = { 401: 'missing-install-key', 409: 'nonce-replayed', 413: 'too-large', 422: 'schema-invalid', 429: 'rate-limited' }[response.status] ?? 'intake-rejected';
        return { ok: false, reason };
      }
      let receipt;
      try {
        receipt = await response.json();
      } catch {
        return { ok: false, reason: 'invalid-receipt' };
      }
      return isReceipt(receipt) ? { ok: true, ...receipt } : { ok: false, reason: 'invalid-receipt' };
    },
    async submitContact(receipt, choice, { exists = fs.existsSync, run = runFile, fetchImpl = fetch } = {}) {
      const credential = muse.credential('chef-feedback', { exists, run });
      if (!credential.ok) return { ok: false, reason: credential.reason };
      const response = await feedbackRequest(
        `${FEEDBACK_URL}/${receipt.report_id}/contact`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', [credential.placement.name]: credential.value, Authorization: `Bearer ${receipt.receipt_secret}` },
          body: JSON.stringify(choice),
        },
        fetchImpl,
      );
      if (!response) return { ok: false, reason: 'unreachable' };
      if (response.status === 204) return { ok: true };
      return { ok: false, reason: response.status === 409 ? 'contact-already-set' : 'contact-rejected' };
    },
    // Receipt-gated hard delete. Intake answers 404 not-found alike for expired, deleted or
    // wrong-receipt reports, so `not-found` means the report is gone either way.
    async deleteReport(receipt, { exists = fs.existsSync, run = runFile, fetchImpl = fetch } = {}) {
      const credential = muse.credential('chef-feedback', { exists, run });
      if (!credential.ok) return { ok: false, reason: credential.reason };
      const response = await feedbackRequest(
        `${FEEDBACK_URL}/${receipt.report_id}`,
        {
          method: 'DELETE',
          headers: { [credential.placement.name]: credential.value, Authorization: `Bearer ${receipt.receipt_secret}` },
        },
        fetchImpl,
      );
      if (!response) return { ok: false, reason: 'unreachable' };
      if (response.status === 204) return { ok: true };
      return { ok: false, reason: response.status === 404 ? 'not-found' : 'intake-rejected' };
    },
  },
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
  recurringTaskUpdates(changes) {
    return {
      action: 'recreate-recurring-tasks',
      tasks: changes,
      instruction: "For each listed recurring Chef task that already exists, ask for the user's explicit approval to re-create it with the new prompt while keeping its name and the user's chosen time. Re-create only tasks the user approves. Do not create a task that did not exist. Then list the tasks you re-created.",
    };
  },
  // How the agent turns a confirmed chef-setup schedule proposal into recurring tasks.
  scheduleSetup: () => ({ scheduler: 'muse-recurring-tasks', instruction: SCHEDULE_SETUP }),
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
  // Fields to merge into a script result so the agent sends `file` as a chat attachment.
  // Only on Muse; elsewhere the caller reports the path instead.
  attachment(file, { exists = fs.existsSync } = {}) {
    return muse.isMuse({ exists }) ? { attachment: { action: 'send-chat-attachment', path: file, instruction: ATTACHMENT_INSTRUCTION } } : {};
  },
};
