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
