// Local feedback files under the data root's diagnostics/ folder (git-ignored, 0700): the current
// draft, unsent reports, receipts of sent reports and pending contact requests. They expire with the invocation
// trace, checked lazily whenever they are read or written.
import fs from 'node:fs';
import path from 'node:path';
import { DIAGNOSTICS_DIR, ensureDiagnosticsDir, TRACE_BOUNDS, writePrivate } from '../diagnostics/trace.mjs';

export const DRAFT_FILE = `${DIAGNOSTICS_DIR}/report-draft.json`;
export const OUTBOX_DIR = `${DIAGNOSTICS_DIR}/outbox`;
export const CONTACT_RETRY_DIR = `${DIAGNOSTICS_DIR}/contact-retry`;
export const RECEIPTS_DIR = `${DIAGNOSTICS_DIR}/receipts`;
const expired = (file, now) => now - fs.statSync(file).mtimeMs > TRACE_BOUNDS.maxAgeMs;

function pruneFiles(root, relativeDir, now) {
  const dir = path.join(root, relativeDir);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (expired(file, now)) fs.rmSync(file);
  }
}

function pruneOutbox(root, now) {
  for (const dir of [OUTBOX_DIR, CONTACT_RETRY_DIR, RECEIPTS_DIR]) pruneFiles(root, dir, now);
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

// The receipt (report_id and secret) of a sent report; the secret is never shown in chat.
export function saveReceipt(root, receipt, { now = new Date() } = {}) {
  if (!reportIdIsSafe(receipt.report_id)) throw new Error('invalid report id');
  ensureDiagnosticsDir(root);
  pruneOutbox(root, now);
  const relative = `${RECEIPTS_DIR}/${receipt.report_id}.json`;
  fs.mkdirSync(path.join(root, RECEIPTS_DIR), { recursive: true, mode: 0o700 });
  writePrivateJson(path.join(root, relative), receipt);
  return relative;
}

const reportIdIsSafe = (reportId) => /^[0-9a-f-]{36}$/i.test(reportId);

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
