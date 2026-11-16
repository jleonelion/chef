import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { generic } from '../../../../runtime/generic.mjs';
import { bytesFromPreview } from '../../../../lib/feedback/preview.mjs';
import { CONTACT_RETRY_DIR, readPendingContact, readDraft } from '../../../../lib/feedback/store.mjs';
import { reportModes } from './report-modes.mjs';

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-contact-'));
const fields = {
  class: 'defect',
  summary: 'Search finds nothing',
  expected: 'Recipes',
  actual: 'Nothing',
  frequency: 'once',
  'skill-ids': 'chef-recipe-search',
  diagnostics: 'off',
};

function connectedAdapter({ contactResult = { ok: true } } = {}) {
  const calls = [];
  const adapter = {
    ...generic,
    feedback: {
      ...generic.feedback,
      capabilities: () => ['submit.connector', 'contact.opaque'],
      destination: { host: 'intake.example.com' },
      submit: async (bytes) => {
        calls.push(['submit', bytes.toString()]);
        return { ok: true, report_id: 'a0d56f28-88d4-45f2-8ab0-3993ac31d370', receipt_secret: 'receipt-secret-abcdefghijklmnopqrstuvwxyz0123456789' };
      },
      submitContact: async (receipt, choice) => {
        calls.push(['contact', receipt.report_id, receipt.receipt_secret, choice]);
        return contactResult;
      },
    },
  };
  return { adapter, calls };
}

test('Muse asks for contact before showing the preview; contact stays outside the report bytes', () => {
  const root = tempRoot();
  const { adapter } = connectedAdapter();
  const modes = reportModes({ skillsDir: path.join(root, 'skills'), adapter });

  const question = modes['report-draft'](root, fields);
  assert.equal(question.status, 'contact-question');
  assert.equal(question.can_ask_contact, true);
  assert.equal('preview' in question, false);

  const draft = modes['report-draft'](root, { ...fields, contact: 'reply@example.com' });
  const raw = modes['report-preview'](root, { raw: true }).raw;
  assert.match(draft.preview, /^Contact: reply@example\.com$/m);
  assert.equal(bytesFromPreview(draft.preview), raw);
  assert.doesNotMatch(raw, /reply@example\.com/);
  assert.doesNotMatch(draft.preview, /Check item/);
  assert.equal(readDraft(root).contactChoice.contact, 'reply@example.com');
  assert.equal(fs.statSync(path.join(root, 'diagnostics', 'report-draft.json')).mode & 0o777, 0o600);
});

test('declining is visible in the preview and the report itself remains unchanged', () => {
  const root = tempRoot();
  const { adapter } = connectedAdapter();
  const modes = reportModes({ skillsDir: path.join(root, 'skills'), adapter });

  const draft = modes['report-draft'](root, { ...fields, declined: true });

  assert.match(draft.preview, /^Contact: declined$/m);
  assert.doesNotMatch(modes['report-preview'](root, { raw: true }).raw, /declined/);
});

test('sending submits the approved report bytes first and contact separately', async () => {
  const root = tempRoot();
  const { adapter, calls } = connectedAdapter();
  const modes = reportModes({ skillsDir: path.join(root, 'skills'), adapter });
  const draft = modes['report-draft'](root, { ...fields, contact: 'reply@example.com' });

  const result = await modes['report-send'](root, { nonce: draft.submission_nonce });

  assert.equal(result.status, 'sent');
  assert.equal(result.report_id, 'a0d56f28-88d4-45f2-8ab0-3993ac31d370');
  assert.deepEqual(calls.map(([type]) => type), ['submit', 'contact']);
  assert.equal(calls[0][1], bytesFromPreview(draft.preview));
  assert.deepEqual(calls[1].slice(1), [
    'a0d56f28-88d4-45f2-8ab0-3993ac31d370',
    'receipt-secret-abcdefghijklmnopqrstuvwxyz0123456789',
    { contact: 'reply@example.com' },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /receipt-secret|reply@example\.com/);
  const receipt = path.join(root, result.receipt_path);
  assert.equal(fs.statSync(receipt).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(receipt, 'utf8')), {
    report_id: 'a0d56f28-88d4-45f2-8ab0-3993ac31d370',
    receipt_secret: 'receipt-secret-abcdefghijklmnopqrstuvwxyz0123456789',
  });
});

test('a sendable preview comes with a destination card holding the exact byte size', () => {
  const root = tempRoot();
  const { adapter } = connectedAdapter();
  const modes = reportModes({ skillsDir: path.join(root, 'skills'), adapter });

  const draft = modes['report-draft'](root, { ...fields, declined: true });

  const size = Buffer.byteLength(bytesFromPreview(draft.preview)).toLocaleString('en-US');
  assert.match(draft.destination_card, /intake\.example\.com/);
  assert.match(draft.destination_card, /90 days/);
  assert.match(draft.destination_card, /no name or account/i);
  assert.match(draft.destination_card, new RegExp(`Size: ${size} bytes`));
});

test('a runtime that cannot send shows no destination card', () => {
  const root = tempRoot();
  const modes = reportModes({ skillsDir: path.join(root, 'skills'), adapter: generic });

  const draft = modes['report-draft'](root, fields);

  assert.equal('destination_card' in draft, false);
  assert.ok(draft.send_notice);
});

test('a contact timeout leaves a private retry record and retrying repeats the same PUT', async () => {
  const root = tempRoot();
  const { adapter, calls } = connectedAdapter();
  let attempts = 0;
  const submitContact = adapter.feedback.submitContact;
  adapter.feedback.submitContact = async (...args) => {
    const result = await submitContact(...args);
    attempts += 1;
    return attempts === 1 ? { ok: false, reason: 'unreachable' } : result;
  };
  const modes = reportModes({ skillsDir: path.join(root, 'skills'), adapter });
  const draft = modes['report-draft'](root, { ...fields, declined: true });

  const sent = await modes['report-send'](root, { nonce: draft.submission_nonce });
  assert.equal(sent.status, 'contact-pending');
  assert.equal(readDraft(root), null);
  const pending = readPendingContact(root, sent.report_id);
  assert.deepEqual(pending.choice, { declined: true });
  assert.equal(pending.receipt_secret, 'receipt-secret-abcdefghijklmnopqrstuvwxyz0123456789');
  assert.equal(fs.statSync(path.join(root, CONTACT_RETRY_DIR, `${sent.report_id}.json`)).mode & 0o777, 0o600);

  const retried = await modes['report-contact-retry'](root, { 'report-id': sent.report_id });
  assert.equal(retried.status, 'contact-updated');
  assert.equal(readPendingContact(root, sent.report_id), null);
  assert.equal(fs.existsSync(path.join(root, sent.receipt_path)), true, 'the receipt outlives the contact retry record');
  assert.deepEqual(calls.map(([type]) => type), ['submit', 'contact', 'contact']);
  assert.deepEqual(calls[1], calls[2]);
});

test('contact is capped, single-line plain text, and cannot be sent with two choices', () => {
  const root = tempRoot();
  const { adapter } = connectedAdapter();
  const modes = reportModes({ skillsDir: path.join(root, 'skills'), adapter });

  assert.equal(modes['report-draft'](root, { ...fields, contact: 'x'.repeat(501) }).status, 'invalid-input');
  assert.equal(modes['report-draft'](root, { ...fields, contact: 'reply\n@example.com' }).status, 'invalid-input');
  assert.equal(modes['report-draft'](root, { ...fields, contact: 'reply@example.com', declined: true }).status, 'invalid-input');
  assert.equal(modes['report-draft'](root, { ...fields, contact: '🍎'.repeat(300) }).status, 'draft');
});
