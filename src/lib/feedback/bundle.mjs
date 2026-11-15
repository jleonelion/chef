// Diagnostic bundle: the invocation events chosen for one feedback report, re-keyed so the
// bundle cannot be joined to the local trace or another report, plus coarse environment facts
// and the kinds of fact Chef could not observe. Never locale, timezone, settings or paths.
import fs from 'node:fs';
import path from 'node:path';
import SCHEMA from '../../../schemas/feedback/diagnostic-bundle.v1.json' with { type: 'json' };
import PLUGIN from '../../../plugins/chef/.claude-plugin/plugin.json' with { type: 'json' };
import { hasCapability } from '../../runtime/contract.mjs';

export const BUNDLE_SCHEMA_VERSION = 1;
export const MAX_EVENTS = SCHEMA.properties.events.maxItems;
const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MS = HOUR_MS;
const OS_FAMILIES = { darwin: 'macos', linux: 'linux', win32: 'windows' };
// Chef observes only its own scripts, never the agent or host around them.
const ALWAYS_UNOBSERVED = ['pre_launch_unobserved', 'host_action_unconfirmed', 'post_return_unobserved'];

const FALLBACK_EVENTS = 10;

// Runs of the named skill (of every skill when none is named) in the last hour, newest
// MAX_EVENTS, oldest first. With none there, the last FALLBACK_EVENTS runs of any skill, and
// `fallback` says so for the preview.
export function selectEvents(events, { now, skill }) {
  const inWindow = events
    .filter((event) => now - Date.parse(event.started_at) <= WINDOW_MS && (!skill || event.skill_id === skill))
    .slice(-MAX_EVENTS);
  if (inWindow.length || !events.length) return { events: inWindow, fallback: false };
  return { events: events.slice(-FALLBACK_EVENTS), fallback: true };
}

// Chef skills installed beside each other. Muse custom skills use underscores (chef_setup).
export function installedSkills(skillsDir, version = PLUGIN.version) {
  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && /^chef[-_]/.test(entry.name) && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => ({ id: entry.name.replaceAll('_', '-'), version }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function rekey(events) {
  const keys = new Map(events.map((event, i) => [event.invocation_id, `inv-${i + 1}`]));
  const anchor = Math.floor(Math.min(...events.map((event) => Date.parse(event.started_at))) / HOUR_MS) * HOUR_MS;
  const rekeyed = events.map(({ schema_version, invocation_id, parent_id, started_at, ...rest }) => ({
    invocation_id: keys.get(invocation_id),
    // A parent outside the bundle is dropped: its trace ID would link the bundle to the trace.
    ...(keys.has(parent_id) ? { parent_id: keys.get(parent_id) } : {}),
    offset_ms: Date.parse(started_at) - anchor,
    ...rest,
  }));
  return { anchor, events: rekeyed };
}

function evidenceGaps(adapter, traceOn) {
  const gaps = [...ALWAYS_UNOBSERVED];
  if (!hasCapability(adapter, 'evidence')) gaps.push('runtime_extension_unavailable');
  gaps.push('correlation_unavailable');
  if (!traceOn) gaps.push('trace_unavailable');
  return gaps;
}

export function buildBundle({ events, adapter, traceOn, skills, now = new Date(), engine = jsEngine(), platform = process.platform }) {
  const capabilities = adapter.feedback.capabilities();
  const { anchor, events: rekeyed } = events.length ? rekey(events) : { anchor: Math.floor(now / HOUR_MS) * HOUR_MS, events: [] };
  return {
    schema_version: BUNDLE_SCHEMA_VERSION,
    anchor_hour: new Date(anchor).toISOString().replace('.000Z', 'Z'),
    environment: {
      chef_version: PLUGIN.version,
      runtime: { name: adapter.name, adapter_version: adapter.adapterVersion, adapter_contract_version: adapter.adapterContractVersion, capabilities },
      skills,
      js_engine: engine,
      os_family: OS_FAMILIES[platform] ?? 'other',
    },
    events: rekeyed,
    evidence_gaps: evidenceGaps(adapter, traceOn),
    runtime_evidence: [],
  };
}

function jsEngine() {
  if (process.versions.bun) return { name: 'bun', version: process.versions.bun };
  return { name: 'node', version: process.versions.node };
}
