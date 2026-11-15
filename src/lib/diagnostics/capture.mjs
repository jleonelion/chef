// ChefCapture: the one wrapper at a skill script's entry that writes an invocation event.
// Positive allowlist at write time: an event holds only the script, operation, outcome, an
// error code from the error-code registry and facts the fact registry declares for that
// script. Never arguments, output content or raw error messages.
import { randomUUID } from 'node:crypto';
import ERROR_CODES from '../../../schemas/feedback/error-codes.v1.json' with { type: 'json' };
import FACTS from '../../../schemas/feedback/facts.v1.json' with { type: 'json' };
import PLUGIN from '../../../plugins/chef/.claude-plugin/plugin.json' with { type: 'json' };
import { muse } from '../../runtime/muse.mjs';
import { readSchemaVersion } from '../schema.mjs';
import { readSettings } from '../settings.mjs';
import { appendEvent } from './trace.mjs';

export const EVENT_SCHEMA_VERSION = 1;

function declaredScript(skill, script, operation) {
  const entry = FACTS.scripts[`${skill}/${script}`];
  if (!entry) throw new Error(`undeclared script "${skill}/${script}"`);
  if (!entry.operations.includes(operation)) throw new Error(`undeclared operation "${operation}"`);
  return entry;
}

function factProblem(spec, value) {
  if (spec.type === 'integer') return Number.isInteger(value) && value >= spec.minimum && value <= spec.maximum ? null : `must be an integer from ${spec.minimum} to ${spec.maximum}`;
  return spec.values.includes(value) ? null : `must be one of ${spec.values.join(', ')}`;
}

function checkedFacts(declared, facts) {
  for (const [name, value] of Object.entries(facts)) {
    if (!Object.hasOwn(declared, name)) throw new Error(`undeclared fact "${name}"`);
    const problem = factProblem(declared[name], value);
    if (problem) throw new Error(`fact "${name}" ${problem}`);
  }
  return { ...facts };
}

function checkErrorCode(outcome, code) {
  if (outcome === 'ok') {
    if (code !== null) throw new Error('ok runs carry no error code');
    return;
  }
  const entry = ERROR_CODES.codes[code];
  if (!entry) throw new Error(`undeclared error code "${code}"`);
  if (entry.outcome !== outcome) throw new Error(`error code "${code}" belongs to ${entry.outcome}, not ${outcome}`);
}

// Throws when anything is not declared in the registries.
export function buildEvent({ skill, script, operation, outcome, error_code = null, facts = {}, startedAt, durationMs, adapter = muse }) {
  const declared = declaredScript(skill, script, operation);
  checkErrorCode(outcome, error_code);
  return {
    schema_version: EVENT_SCHEMA_VERSION,
    invocation_id: randomUUID(),
    started_at: startedAt.toISOString(),
    duration_ms: Math.max(0, Math.round(durationMs)),
    chef_version: PLUGIN.version,
    skill_id: skill,
    script_id: script,
    operation,
    outcome,
    error_code,
    runtime: adapter.isMuse() ? adapter.name : 'unknown',
    adapter_version: adapter.adapterVersion,
    facts: checkedFacts(declared.facts, facts),
  };
}

// Capture runs only inside a Chef data root whose settings leave the trace on.
export function traceEnabled(root) {
  try {
    return readSchemaVersion(root) !== null && readSettings(root).settings.diagnostics.trace === 'on';
  } catch {
    return false;
  }
}

// Diagnostics never break the skill: an event that cannot be built or written is dropped.
function record(context, describe) {
  if (!traceEnabled(context.root)) return;
  try {
    appendEvent(context.root, buildEvent({ ...context, ...describe() }), { now: new Date() });
  } catch {
    // dropped on purpose; registry tests catch undeclared facts and codes
  }
}

// Runs `run` and records one event. `classify(result)` maps the script's result to
// { outcome, error_code?, facts? } using only registry entries. A throw is recorded as
// internal-error + unclassified (never its message) and rethrown.
export async function chefCapture({ root, skill, script, operation, classify, adapter = muse }, run) {
  const context = { root, skill, script, operation, adapter, startedAt: new Date() };
  const started = performance.now();
  const elapsed = () => ({ durationMs: performance.now() - started });
  try {
    const result = await run();
    record(context, () => ({ ...elapsed(), ...classify(result) }));
    return result;
  } catch (error) {
    record(context, () => ({ ...elapsed(), outcome: 'internal-error', error_code: 'unclassified' }));
    throw error;
  }
}
