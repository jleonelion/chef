import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { RECURRING_TASKS } from '../lib/recurring-tasks.mjs';
import { muse } from './muse.mjs';

test('Muse data root default is ~/workspace/chef', () => {
  assert.equal(muse.defaultDataRoot(), path.join(os.homedir(), 'workspace', 'chef'));
});

test('update locations come from the adapter for Muse custom skills', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-runtime-workspace-'));
  const skillDir = path.join(workspace, 'custom-skills', 'chef_setup');
  const repository = path.join(workspace, 'chef-source');
  fs.mkdirSync(path.join(repository, 'plugins', 'chef', '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(repository, 'plugins', 'chef', '.claude-plugin', 'plugin.json'), '{"name":"chef"}');
  assert.deepEqual(muse.updateInstall({ skillDir }), {
    repository,
    skillsDir: path.join(workspace, 'custom-skills'),
    installedName: 'chef_setup',
    nameForSkill: 'underscores',
  });
});

function museWorkspace(...repositories) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-runtime-workspace-'));
  for (const name of repositories) {
    fs.mkdirSync(path.join(workspace, name, 'plugins', 'chef', '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(workspace, name, 'plugins', 'chef', '.claude-plugin', 'plugin.json'), '{"name":"chef"}');
  }
  return { workspace, skillDir: path.join(workspace, 'custom-skills', 'chef_setup') };
}

test('Muse update with no Chef repository next to custom-skills says to clone Chef there', () => {
  const { workspace, skillDir } = museWorkspace();
  assert.throws(() => muse.updateInstall({ skillDir }), {
    message: `no Chef repository found next to custom-skills/ in ${workspace}; clone Chef there or reinstall`,
  });
});

test('Muse update with two Chef repositories names them and asks the user to keep one', () => {
  const { workspace, skillDir } = museWorkspace('chef', 'chef-old');
  assert.throws(() => muse.updateInstall({ skillDir }), {
    message: `found 2 Chef repositories next to custom-skills/ in ${workspace}: chef, chef-old; keep one and remove the others`,
  });
});

test('update locations come from the adapter for Claude Code and Muse Code plugins', () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-plugin-cache-'));
  const skillDir = path.join(repository, 'plugins', 'chef', 'skills', 'chef-setup');
  fs.mkdirSync(path.join(repository, 'plugins', 'chef', '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(repository, 'plugins', 'chef', '.claude-plugin', 'plugin.json'), '{"name":"chef"}');
  assert.deepEqual(muse.updateInstall({ skillDir }), {
    repository,
    skillsDir: path.join(repository, 'plugins', 'chef', 'skills'),
    installedName: 'chef-setup',
    nameForSkill: 'hyphens',
  });
});

test('locale prefers LC_ALL, then LC_MEASUREMENT, then LANG, skipping C/POSIX and empty', () => {
  assert.equal(muse.locale({ LC_ALL: 'en_GB.UTF-8', LANG: 'en_US.UTF-8' }), 'en_GB.UTF-8');
  assert.equal(muse.locale({ LC_ALL: '', LC_MEASUREMENT: 'de_DE', LANG: 'en_US.UTF-8' }), 'de_DE');
  assert.equal(muse.locale({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }), 'en_US.UTF-8');
});

const USDA_QUERY = { in: 'query', name: 'api_key' };
const authdcReply = (placement = 'query_param:api_key') => JSON.stringify({ credentials: [{ surrogate: 'hsurr:abc', placement }] });

test('on Muse, the USDA credential is the connector surrogate placed as the api_key query param', () => {
  const calls = [];
  const run = (file, args) => {
    calls.push([file, ...args]);
    return authdcReply();
  };
  const result = muse.credential('usda-fdc', { env: { CHEF_USDA_FDC_KEY: 'ignored-on-muse' }, exists: () => true, run });
  assert.deepEqual(result, { ok: true, value: 'hsurr:abc', placement: USDA_QUERY, source: 'connector' });
  assert.deepEqual(calls, [['/opt/hatch/bin/authdc', 'cred', 'surrogate', 'custom.usda-fdc']]);
});

test('on Muse, an unregistered connector or unreadable reply means no key', () => {
  const failing = () => {
    throw new Error('exit 1: 403');
  };
  assert.deepEqual(muse.credential('usda-fdc', { exists: () => true, run: failing }), { ok: false, reason: 'not-connected' });
  assert.deepEqual(muse.credential('usda-fdc', { exists: () => true, run: () => 'not json' }), { ok: false, reason: 'not-connected' });
  assert.deepEqual(muse.credential('usda-fdc', { exists: () => true, run: () => authdcReply('header:X-Api-Key') }), { ok: false, reason: 'wrong-placement' });
});

const feedbackAuthdcReply = (placement = { custom_header: 'X-Chef-Intake-Key' }) =>
  JSON.stringify({ credentials: [{ surrogate: 'hsurr:feedback', placement }] });

test('feedback capability is available only with the correctly placed Muse connector', () => {
  const connected = { exists: () => true, run: () => feedbackAuthdcReply() };
  const disconnected = { exists: () => true, run: () => 'not json' };

  assert.deepEqual(muse.feedback.capabilities(connected), ['submit.connector', 'contact.opaque', 'delete.receipt']);
  assert.deepEqual(muse.feedback.capabilities(disconnected), []);
  assert.deepEqual(
    muse.credential('chef-feedback', { ...connected }),
    {
      ok: true,
      value: 'hsurr:feedback',
      placement: { in: 'header', name: 'X-Chef-Intake-Key' },
      source: 'connector',
    },
  );
});

test('feedback status says why the connector is unusable', () => {
  assert.deepEqual(muse.feedback.status({ exists: () => true, run: () => feedbackAuthdcReply() }), { ok: true });
  assert.deepEqual(muse.feedback.status({ exists: () => true, run: () => 'not json' }), { ok: false, reason: 'not-connected' });
  assert.deepEqual(muse.feedback.status({ exists: () => true, run: () => feedbackAuthdcReply('query_param:key') }), { ok: false, reason: 'wrong-placement' });
});

test('feedback submission sends the exact bytes with the connector surrogate and disables redirects', async () => {
  const calls = [];
  const bytes = Buffer.from('{"schema_version":1,"submission_nonce":"fixed"}');
  const result = await muse.feedback.submit(bytes, {
    exists: () => true,
    run: () => feedbackAuthdcReply(),
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return { ok: true, status: 201, json: async () => ({ report_id: 'a0d56f28-88d4-45f2-8ab0-3993ac31d370', receipt_secret: 'receipt-secret-abcdefghijklmnopqrstuvwxyz0123456789' }) };
    },
  });

  assert.deepEqual(result, {
    ok: true,
    report_id: 'a0d56f28-88d4-45f2-8ab0-3993ac31d370',
    receipt_secret: 'receipt-secret-abcdefghijklmnopqrstuvwxyz0123456789',
  });
  assert.equal(calls[0][0], 'https://chef-feedback-intake.vercel.app/v1/reports');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].headers['X-Chef-Intake-Key'], 'hsurr:feedback');
  assert.deepEqual(calls[0][1].body, bytes);
});

test('contact is sent only in a separate receipt-authorized idempotent PUT', async () => {
  const calls = [];
  const receipt = { report_id: 'a0d56f28-88d4-45f2-8ab0-3993ac31d370', receipt_secret: 'receipt-secret' };
  const result = await muse.feedback.submitContact(receipt, { declined: true }, {
    exists: () => true,
    run: () => feedbackAuthdcReply(),
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return { ok: true, status: 204 };
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0][0], `https://chef-feedback-intake.vercel.app/v1/reports/${receipt.report_id}/contact`);
  assert.equal(calls[0][1].method, 'PUT');
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer receipt-secret');
  assert.equal(calls[0][1].body, '{"declined":true}');
});

test('delete is a receipt-authorized DELETE through the connector with redirects disabled', async () => {
  const calls = [];
  const receipt = { report_id: 'a0d56f28-88d4-45f2-8ab0-3993ac31d370', receipt_secret: 'receipt-secret' };
  const answering = (status) => ({
    exists: () => true,
    run: () => feedbackAuthdcReply(),
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return { ok: status < 300, status };
    },
  });

  assert.deepEqual(await muse.feedback.deleteReport(receipt, answering(204)), { ok: true });
  assert.deepEqual(await muse.feedback.deleteReport(receipt, answering(404)), { ok: false, reason: 'not-found' });
  assert.deepEqual(await muse.feedback.deleteReport(receipt, answering(500)), { ok: false, reason: 'intake-rejected' });
  assert.deepEqual(
    await muse.feedback.deleteReport(receipt, { exists: () => true, run: () => 'not json', fetchImpl: async () => assert.fail('no request') }),
    { ok: false, reason: 'not-connected' },
  );
  assert.equal(calls[0][0], `https://chef-feedback-intake.vercel.app/v1/reports/${receipt.report_id}`);
  assert.equal(calls[0][1].method, 'DELETE');
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer receipt-secret');
  assert.equal(calls[0][1].headers['X-Chef-Intake-Key'], 'hsurr:feedback');
});

test('off Muse, the USDA credential comes from CHEF_USDA_FDC_KEY', () => {
  const offMuse = { exists: () => false, run: () => assert.fail('authdc must not run off Muse') };
  assert.deepEqual(muse.credential('usda-fdc', { ...offMuse, env: { CHEF_USDA_FDC_KEY: ' k123 ' } }), { ok: true, value: 'k123', placement: USDA_QUERY, source: 'env' });
  assert.deepEqual(muse.credential('usda-fdc', { ...offMuse, env: { CHEF_USDA_FDC_KEY: '' } }), { ok: false, reason: 'not-connected' });
  assert.deepEqual(muse.credential('usda-fdc', { ...offMuse, env: {} }), { ok: false, reason: 'not-connected' });
});

test('unknown providers are a programming error', () => {
  assert.throws(() => muse.credential('nope', { exists: () => false, env: {} }), /unknown credential provider/);
});

test('PDF delivery is a chat attachment instruction on Muse and absent elsewhere', () => {
  const file = '/workspace/chef/data/batch-prep-plans/2026-01-19.pdf';
  assert.deepEqual(muse.attachment(file, { exists: () => true }), {
    attachment: {
      action: 'send-chat-attachment',
      path: file,
      instruction: 'Send this PDF as a downloadable attachment in this chat; do not return only the filesystem path or add it to Library.',
    },
  });
  assert.deepEqual(muse.attachment(file, { exists: () => false }), {});
});

test('locale falls back to the runtime Intl locale', () => {
  assert.equal(muse.locale({ LANG: 'POSIX' }), Intl.DateTimeFormat().resolvedOptions().locale);
});

test('Muse is detected by its credential binary', () => {
  assert.equal(muse.isMuse({ exists: (file) => file === '/opt/hatch/bin/authdc' }), true);
  assert.equal(muse.isMuse({ exists: () => false }), false);
});

test('household email and delivery-task payloads are instructions, never sends', () => {
  const email = muse.householdEmail({ to: ['cook@example.com'], subject: 'S', body: 'B' });
  assert.equal(email.connector, 'gmail');
  assert.match(email.instruction, /does not send email/);
  const tasks = muse.deliveryTasks(['cook@example.com']);
  assert.deepEqual(tasks.tasks.map((t) => t.skill), ['chef-shopping-lists']);
  assert.deepEqual(tasks.recipients, ['cook@example.com']);
});

test('delivery tasks are re-created from the one shared task definition', () => {
  const [task] = muse.deliveryTasks([]).tasks;
  assert.deepEqual(task, RECURRING_TASKS.find((t) => t.name === 'Chef shopping list'));
});

test('schedule setup tells the agent to create only tasks the user said yes to', () => {
  const { instruction } = muse.scheduleSetup();
  assert.match(instruction, /recurring task/);
  assert.match(instruction, /explicit yes/);
});
