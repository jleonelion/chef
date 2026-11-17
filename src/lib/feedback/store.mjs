// Local feedback files under the data root's diagnostics/ folder (git-ignored, 0700): the current
// draft, unsent reports, receipts of sent reports and pending contact requests. They expire with the invocation
// trace, except receipts, which last as long as intake can keep the report (90 days) so the holder
// can delete it any time. Expiry is checked lazily whenever they are read or written.
import fs from 'node:fs';
import path from 'node:path';
import { DAY_MS, DIAGNOSTICS_DIR, ensureDiagnosticsDir, TRACE_BOUNDS, writePrivate } from '../diagnostics/trace.mjs';

export const DRAFT_FILE = `${DIAGNOSTICS_DIR}/report-draft.json`;
export const OUTBOX_DIR = `${DIAGNOSTICS_DIR}/outbox`;
export const CONTACT_RETRY_DIR = `${DIAGNOSTICS_DIR}/contact-retry`;
export const RECEIPTS_DIR = `${DIAGNOSTICS_DIR}/receipts`;
export const RECEIPT_MAX_AGE_MS = 90 * DAY_MS;
const expired = (file, now, maxAgeMs = TRACE_BOUNDS.maxAgeMs) => now - fs.statSync(file).mtimeMs > maxAgeMs;

function pruneFiles(root, relativeDir, now, maxAgeMs) {
  const dir = path.join(root, relativeDir);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (expired(file, now, maxAgeMs)) fs.rmSync(file);
  }
}

function pruneOutbox(root, now) {
  for (const dir of [OUTBOX_DIR, CONTACT_RETRY_DIR]) pruneFiles(root, dir, now, TRACE_BOUNDS.maxAgeMs);
  pruneFiles(root, RECEIPTS_DIR, now, RECEIPT_MAX_AGE_MS);
}

function writePrivateJson(file, value) {
  writePrivate(file, `${JSON.stringify(value)}\n`);
}

export function saveDraft(root, draft) {
  ensureDiagnosticsDir(root);
  writePrivate(path.join(root, DRAFT_FILE), `${JSON.stringify(draft)}\n`);
}

export function readDraft(root, { now = new Date() } = {}) {
  pruneOutbox(root, now);
  const file = path.join(root, DRAFT_FILE);
  if (!fs.existsSync(file)) return null;
  if (expired(file, now)) {
    fs.rmSync(file);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// True when there was a draft to delete.
export function deleteDraft(root) {
  const file = path.join(root, DRAFT_FILE);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

// Writes the approved bytes unchanged; returns the data-root-relative path. A report already in
// the outbox (same nonce, so the same bytes) is kept as it is, so repeated attempts save one copy.
export function saveToOutbox(root, bytes, { nonce, now = new Date() }) {
  ensureDiagnosticsDir(root);
  pruneOutbox(root, now);
  fs.mkdirSync(path.join(root, OUTBOX_DIR), { recursive: true, mode: 0o700 });
  const suffix = `-${nonce.slice(0, 8)}.json`;
  const existing = fs.readdirSync(path.join(root, OUTBOX_DIR)).find((name) => name.endsWith(suffix));
  if (existing) return `${OUTBOX_DIR}/${existing}`;
  const stamp = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const relative = `${OUTBOX_DIR}/${stamp}${suffix}`;
  writePrivate(path.join(root, relative), bytes);
  return relative;
}

export function savePendingContact(root, pending, { now = new Date() } = {}) {
  ensureDiagnosticsDir(root);
  pruneOutbox(root, now);
  const file = path.join(root, CONTACT_RETRY_DIR, `${pending.report_id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writePrivateJson(file, pending);
  return file;
}

// The receipt (report_id, secret, class, sent_at) of a sent report; the secret is never shown in chat.
export function saveReceipt(root, receipt, { now = new Date() } = {}) {
  receiptFile(root, receipt.report_id);
  ensureDiagnosticsDir(root);
  pruneOutbox(root, now);
  const relative = `${RECEIPTS_DIR}/${receipt.report_id}.json`;
  fs.mkdirSync(path.join(root, RECEIPTS_DIR), { recursive: true, mode: 0o700 });
  writePrivateJson(path.join(root, relative), receipt);
  return relative;
}

const reportIdIsSafe = (reportId) => /^[0-9a-f-]{36}$/i.test(reportId);
const receiptFile = (root, reportId) => {
  if (!reportIdIsSafe(reportId)) throw new Error('invalid report id');
  return path.join(root, RECEIPTS_DIR, `${reportId}.json`);
};

// Receipts written before class and sent_at were recorded fall back to the file time.
function parseReceipt(file) {
  return { class: null, sent_at: fs.statSync(file).mtime.toISOString(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

export function readReceipt(root, reportId, { now = new Date() } = {}) {
  const file = receiptFile(root, reportId);
  pruneOutbox(root, now);
  return fs.existsSync(file) ? parseReceipt(file) : null;
}

// Sent reports, newest first, as { report_id, class, sent_at } only: never the secret or content.
export function listReceipts(root, { now = new Date() } = {}) {
  pruneOutbox(root, now);
  const dir = path.join(root, RECEIPTS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((name) => name.replace(/\.json$/, ''))
    .filter(reportIdIsSafe)
    .flatMap((reportId) => {
      try {
        const { report_id, class: reportClass, sent_at } = parseReceipt(receiptFile(root, reportId));
        return [{ report_id, class: reportClass, sent_at }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at));
}

export function deleteReceipt(root, reportId) {
  const file = receiptFile(root, reportId);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

export function readPendingContact(root, reportId, { now = new Date() } = {}) {
  if (!reportIdIsSafe(reportId)) throw new Error('invalid report id');
  pruneOutbox(root, now);
  const file = path.join(root, CONTACT_RETRY_DIR, `${reportId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function deletePendingContact(root, reportId) {
  if (!reportIdIsSafe(reportId)) throw new Error('invalid report id');
  const file = path.join(root, CONTACT_RETRY_DIR, `${reportId}.json`);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}
