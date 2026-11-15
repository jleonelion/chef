// ChefCapture: the one wrapper at a skill script's entry that writes an invocation event.
// Positive allowlist at write time: an event holds only the script, operation, outcome, an
// error code from the error-code registry and facts the fact registry declares for that
// script. Never arguments, output content or raw error messages.
import { randomUUID } from 'node:crypto';
import ERROR_CODES from '../../../schemas/feedback/error-codes.v1.json' with { type: 'json' };
import FACTS from '../../../schemas/feedback/facts.v1.json' with { type: 'json' };
import PLUGIN from '../../../plugins/chef/.claude-plugin/plugin.json' with { type: 'json' };
import { currentRuntime } from '../../runtime/contract.mjs';
import { readSchemaVersion } from '../schema.mjs';
import { readSettings } from '../settings.mjs';
import { claimOffer } from './offers.mjs';
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
export function buildEvent({ skill, script, operation, outcome, error_code = null, facts = {}, startedAt, durationMs, adapter = currentRuntime() }) {
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
    runtime: adapter.name,
    adapter_version: adapter.adapterVersion,
    facts: checkedFacts(declared.facts, facts),
  };
}

// Capture runs only inside a Chef data root whose settings leave the trace on. Settings Chef
// cannot read (invalid, newer version) fail closed: the user may have turned the trace off.
export function traceEnabled(root) {
  try {
    if (readSchemaVersion(root) === null) return false;
    const { status, settings } = readSettings(root);
    return ['ok', 'missing'].includes(status) && settings.diagnostics.trace === 'on';
  } catch {
    return false;
  }
}

// Diagnostics never break the skill: an event that cannot be built or written is dropped.
// Returns the recorded event, or null.
function record(context, describe) {
  if (!traceEnabled(context.root)) return null;
  try {
    const event = buildEvent({ ...context, ...describe() });
    appendEvent(context.root, event, { now: new Date() });
    return event;
  } catch {
    return null; // dropped on purpose; registry tests catch undeclared facts and codes
  }
}

// A recorded internal-error may come with one offer to report it (#78): only with post-error
// offers on, at most once per error code per hour, never for a code the user declined.
function reportOffer(root, event) {
  if (event?.outcome !== 'internal-error') return null;
  try {
    if (readSettings(root).settings.post_error_offers !== 'on' || !claimOffer(root, event.error_code)) return null;
  } catch {
    return null;
  }
  const focus = event.invocation_id;
  return {
    error_code: event.error_code,
    focus,
    message: `Chef hit an internal error. Offer once, in plain words, to report it. If the user agrees, run chef-setup's \`setup.mjs report-draft --focus ${focus}\` and follow its report flow. If they say no thanks, run chef-setup's \`setup.mjs report-offer-decline --code ${event.error_code}\`. Don't offer again either way.`,
  };
}

const withOffer = (result, offer) => (offer ? { ...result, report_offer: offer } : result);
const INTERNAL_ERROR = { status: 'internal-error', reason: 'Chef hit an unexpected error; details are on stderr.' };

// Failures most scripts share; a script's own `failures` add to or override these.
const COMMON_FAILURES = { 'invalid-input': 'invalid-input', refused: 'action-refused' };

// classify for a result with a top-level `status`: a status the registry lists under the script's
// `status` fact is an ok run; `failures` maps the rest to error codes. Any status nobody mapped
// is internal-error + unclassified.
export function classifyStatus({ skill, script, failures = {} }) {
  const okStatuses = FACTS.scripts[`${skill}/${script}`]?.facts.status?.values ?? [];
  const codes = { ...COMMON_FAILURES, ...failures };
  return ({ status }) => {
    if (okStatuses.includes(status)) return { outcome: 'ok', facts: { status } };
    const code = codes[status];
    return Object.hasOwn(ERROR_CODES.codes, code) ? { outcome: ERROR_CODES.codes[code].outcome, error_code: code } : { outcome: 'internal-error', error_code: 'unclassified' };
  };
}

// Runs `run` and records one event. `classify(result)` maps the script's result to
// { outcome, error_code?, facts? } using only registry entries; without it, the result's status is
// classified by classifyStatus with `failures`. A throw is recorded as internal-error +
// unclassified (never its message): its stack goes to stderr, exit code 1, and the script gets an
// internal-error result to print.
export async function chefCapture({ root, skill, script, operation, classify, failures, adapter = currentRuntime() }, run) {
  const context = { root, skill, script, operation, adapter, startedAt: new Date() };
  const classifyResult = classify ?? classifyStatus({ skill, script, failures });
  const started = performance.now();
  const elapsed = () => ({ durationMs: performance.now() - started });
  try {
    const result = await run();
    const event = record(context, () => ({ ...elapsed(), ...classifyResult(result) }));
    return withOffer(result, reportOffer(root, event));
  } catch (error) {
    const event = record(context, () => ({ ...elapsed(), outcome: 'internal-error', error_code: 'unclassified' }));
    console.error(error);
    process.exitCode = 1;
    return withOffer(INTERNAL_ERROR, reportOffer(root, event));
  }
}
