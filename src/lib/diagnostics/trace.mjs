// The invocation trace: a local ring buffer of invocation events, one JSON line each, at
// <data root>/diagnostics/trace.jsonl. The diagnostics folder ignores itself in git (like cache/),
// so no Chef commit ever holds it. Bounds are enforced lazily on every read and write; no daemon.
import fs from 'node:fs';
import path from 'node:path';
import SCHEMA from '../../../schemas/feedback/invocation-trace.v1.json' with { type: 'json' };

export const DIAGNOSTICS_DIR = 'diagnostics';
export const TRACE_FILE = `${DIAGNOSTICS_DIR}/trace.jsonl`;
export const TRACE_SCHEMA_VERSION = 1;
export const DAY_MS = 24 * 60 * 60 * 1000;
// The bounds live in the trace schema, the single source shared with feedback intake.
export const TRACE_BOUNDS = { maxEvents: SCHEMA.properties.events.maxItems, maxBytes: SCHEMA['x-max-bytes'], maxAgeMs: SCHEMA['x-max-age-days'] * DAY_MS };

const PRIVATE_FILE = { mode: 0o600 };
const lineOf = (event) => `${JSON.stringify(event)}\n`;

function ensureDiagnosticsDir(root) {
  const dir = path.join(root, DIAGNOSTICS_DIR);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n', PRIVATE_FILE);
  fs.chmodSync(ignore, 0o600);
}

function storedEvents(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return text.split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

// Unexpired events, newest that fit the count and byte bounds, in stored order.
function withinBounds(events, now, { maxEvents, maxBytes, maxAgeMs }) {
  const fresh = events.filter((event) => now - Date.parse(event.started_at) <= maxAgeMs);
  const kept = [];
  let bytes = 0;
  for (const event of fresh.reverse()) {
    const size = Buffer.byteLength(lineOf(event));
    if (kept.length === maxEvents || bytes + size > maxBytes) break;
    kept.unshift(event);
    bytes += size;
  }
  return kept;
}

function rewrite(file, events) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, events.map(lineOf).join(''), PRIVATE_FILE);
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

export function appendEvent(root, event, { now = new Date(), bounds = TRACE_BOUNDS } = {}) {
  ensureDiagnosticsDir(root);
  const file = path.join(root, TRACE_FILE);
  const stored = storedEvents(file);
  const kept = withinBounds([...stored, event], now, bounds);
  const onlyAppended = kept.length === stored.length + 1 && fs.existsSync(file);
  if (onlyAppended) fs.appendFileSync(file, lineOf(event), PRIVATE_FILE);
  else rewrite(file, kept);
}

export function readTrace(root, { now = new Date(), bounds = TRACE_BOUNDS } = {}) {
  const file = path.join(root, TRACE_FILE);
  const stored = storedEvents(file);
  const events = withinBounds(stored, now, bounds);
  if (events.length !== stored.length) rewrite(file, events);
  return { schema_version: TRACE_SCHEMA_VERSION, events };
}

// True when there was a trace to delete.
export function clearTrace(root) {
  const file = path.join(root, TRACE_FILE);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}
