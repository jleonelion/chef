import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { generic } from '../../runtime/generic.mjs';
import { bytesFromPreview, renderPreview } from './preview.mjs';
import { newDraft, removeItem } from './report.mjs';
import { sendReport } from './send.mjs';
import { OUTBOX_DIR, readDraft, saveDraft } from './store.mjs';

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-feedback-'));
const draft = () => newDraft({ class: 'defect', summary: 'Search finds nothing', expected: 'Recipes', actual: 'Nothing', frequency: 'once', skill_ids: ['chef-recipe-search'] });
const mode = (file) => fs.statSync(file).mode & 0o777;

test('off Muse an approved report is saved to the outbox, byte for byte the final preview, and nothing is sent', async () => {
  const root = tempRoot();
  const final = removeItem(draft(), 8);
  saveDraft(root, final);
  const preview = renderPreview(readDraft(root));
  const result = await sendReport(root, readDraft(root), { nonce: final.report.submission_nonce, adapter: generic });
  assert.equal(result.status, 'saved');
  assert.match(result.notice, /isn't supported in this runtime/);
  assert.equal(result.path.startsWith(`${OUTBOX_DIR}/`), true);
  const file = path.join(root, result.path);
  assert.equal(fs.readFileSync(file, 'utf8'), bytesFromPreview(preview));
  assert.equal(result.bytes, fs.statSync(file).size);
  assert.equal(mode(file), 0o600);
  assert.equal(readDraft(root), null, 'the draft is gone once saved');
});

test('a nonce from an earlier preview is refused, so every change needs a fresh look', async () => {
  const root = tempRoot();
  const first = draft();
  saveDraft(root, removeItem(first, 8));
  const result = await sendReport(root, readDraft(root), { nonce: first.report.submission_nonce, adapter: generic });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /changed since/);
  assert.equal(fs.existsSync(path.join(root, OUTBOX_DIR)), false);
});

test('an adapter with an unknown contract major is rejected before anything is written', async () => {
  const root = tempRoot();
  const current = draft();
  const unknownMajor = { ...generic, adapterContractVersion: 9 };
  await assert.rejects(sendReport(root, current, { nonce: current.report.submission_nonce, adapter: unknownMajor }), /unsupported adapter contract/);
  assert.equal(fs.existsSync(path.join(root, OUTBOX_DIR)), false);
});

test('drafts and saved reports expire with the trace, after 14 days', async () => {
  const root = tempRoot();
  const current = draft();
  saveDraft(root, current);
  const { path: saved } = await sendReport(root, current, { nonce: current.report.submission_nonce, adapter: generic });
  saveDraft(root, draft());
  const later = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  assert.equal(readDraft(root, { now: later }), null);
  assert.equal(fs.existsSync(path.join(root, saved)), false);
});

test('a failed receipt write still reports the delivered report as sent and clears the draft', async () => {
  const root = tempRoot();
  const current = draft();
  saveDraft(root, current);
  const adapter = {
    ...generic,
    feedback: { ...generic.feedback, capabilities: () => ['submit.connector'], submit: async () => ({ ok: true, report_id: '../escape', receipt_secret: 'x'.repeat(40) }) },
  };
  const result = await sendReport(root, current, { nonce: current.report.submission_nonce, adapter });
  assert.equal(result.status, 'sent');
  assert.equal(result.receipt_path, null);
  assert.equal(readDraft(root), null);
});

test('a closed intake keeps the approved bytes in the outbox and the draft, and never retries by itself', async () => {
  const root = tempRoot();
  const current = draft();
  saveDraft(root, current);
  const sent = [];
  let reply = { ok: false, reason: 'intake-closed', message: 'Paused for a privacy check.' };
  const adapter = {
    ...generic,
    feedback: {
      ...generic.feedback,
      capabilities: () => ['submit.connector'],
      submit: async (bytes) => {
        sent.push(bytes.toString());
        return reply;
      },
    },
  };
  const send = () => sendReport(root, readDraft(root), { nonce: current.report.submission_nonce, adapter });

  const result = await send();
  assert.equal(result.status, 'closed');
  assert.equal(result.reason, 'intake-closed');
  assert.equal(result.message, 'Paused for a privacy check.');
  assert.match(result.notice, /closed for now, so nothing was sent.*kept the approved report.*will not try again by itself/);
  assert.equal(sent.length, 1, 'one attempt, no automatic retry');
  const file = path.join(root, result.path);
  assert.equal(result.path.startsWith(`${OUTBOX_DIR}/`), true);
  assert.equal(fs.readFileSync(file, 'utf8'), sent[0]);
  assert.equal(fs.readFileSync(file, 'utf8'), bytesFromPreview(renderPreview(current)));
  assert.equal(mode(file), 0o600);
  assert.notEqual(readDraft(root), null, 'the draft stays for a user-initiated retry');

  assert.equal((await send()).path, result.path, 'a second attempt keeps one copy');
  assert.equal(fs.readdirSync(path.join(root, OUTBOX_DIR)).length, 1);

  reply = { ok: true, report_id: 'a0d56f28-88d4-45f2-8ab0-3993ac31d370', receipt_secret: 'x'.repeat(40) };
  assert.equal((await send()).status, 'sent', 'once intake reopens, the user can send it');
  assert.equal(sent.length, 3);
});
