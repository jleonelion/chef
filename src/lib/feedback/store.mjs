// Local feedback files under the data root's diagnostics/ folder (git-ignored, 0700): the one
// report draft in progress and the feedback outbox of approved reports this runtime could not send.
// Both expire like the invocation trace, checked lazily whenever they are read or written.
import fs from 'node:fs';
import path from 'node:path';
import { DIAGNOSTICS_DIR, ensureDiagnosticsDir, TRACE_BOUNDS, writePrivate } from '../diagnostics/trace.mjs';

export const DRAFT_FILE = `${DIAGNOSTICS_DIR}/report-draft.json`;
export const OUTBOX_DIR = `${DIAGNOSTICS_DIR}/outbox`;
const expired = (file, now) => now - fs.statSync(file).mtimeMs > TRACE_BOUNDS.maxAgeMs;

function pruneOutbox(root, now) {
  const dir = path.join(root, OUTBOX_DIR);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (expired(file, now)) fs.rmSync(file);
  }
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

// Writes the approved bytes unchanged; returns the data-root-relative path.
export function saveToOutbox(root, bytes, { nonce, now = new Date() }) {
  ensureDiagnosticsDir(root);
  pruneOutbox(root, now);
  fs.mkdirSync(path.join(root, OUTBOX_DIR), { recursive: true, mode: 0o700 });
  const stamp = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const relative = `${OUTBOX_DIR}/${stamp}-${nonce.slice(0, 8)}.json`;
  writePrivate(path.join(root, relative), bytes);
  return relative;
}
