// Feedback report drafts: build one, edit or remove its items by preview number, and check it
// against the limits in feedback-report.v1.json, the same limits feedback intake enforces. Item
// numbers are fixed when the draft is built, so a removed item leaves a gap. Every change mints a
// new submission_nonce, so a preview the user saw before the change can never be sent.
import { randomUUID } from 'node:crypto';
import SCHEMA from '../../../schemas/feedback/feedback-report.v1.json' with { type: 'json' };
import { itemsOf, locate, TEXT_FIELDS } from './preview.mjs';

export const REPORT_SCHEMA_VERSION = 1;
export const MAX_BYTES = SCHEMA['x-max-bytes'];
export const CLASS_FIELDS = { defect: ['expected', 'actual', 'frequency'], enhancement: ['desired_outcome'], behavior_change: ['current_behavior', 'desired_behavior'] };
const FREQUENCIES = SCHEMA.properties.frequency.enum;
const maxLength = (field) => SCHEMA.$defs[field === 'summary' ? 'short_text' : 'text'].maxLength;
export const SKILL_ID = /^chef-[a-z0-9-]+$/;
// Optional parts the user may withhold. Required fields can only be edited; evidence only removed.
const REMOVABLE = [/^skill_ids$/, /^focus_invocation$/, /^diagnostic_bundle$/, /^diagnostic_bundle\.environment\.(skills|js_engine|os_family)$/, /^diagnostic_bundle\.events\[inv-\d+\]$/];
const EDITABLE = new Set([...TEXT_FIELDS, 'frequency', 'skill_ids']);

export const serialize = (report) => JSON.stringify(report);
export const splitSkillIds = (raw = '') => raw.split(',').map((id) => id.trim()).filter(Boolean);

function textProblem(field, value) {
  if (typeof value !== 'string' || value.trim() === '') return `${field}: required`;
  return value.length > maxLength(field) ? `${field}: at most ${maxLength(field)} characters` : null;
}

export function reportProblems(report) {
  const fields = CLASS_FIELDS[report.class];
  if (!fields) return [`class: must be one of ${Object.keys(CLASS_FIELDS).join(', ')}`];
  const problems = ['summary', ...fields.filter((f) => f !== 'frequency')].map((f) => textProblem(f, report[f])).filter(Boolean);
  if (fields.includes('frequency') && !FREQUENCIES.includes(report.frequency)) problems.push(`frequency: must be one of ${FREQUENCIES.join(', ')}`);
  const skills = report.skill_ids ?? [];
  if (skills.some((id) => !SKILL_ID.test(id))) problems.push('skill_ids: must be Chef skill IDs like chef-recipe-search');
  if (report.class === 'behavior_change' && !skills.length) problems.push('skill_ids: name at least one skill');
  const bytes = Buffer.byteLength(serialize(report));
  if (bytes > MAX_BYTES) problems.push(`report is ${bytes} bytes, over ${MAX_BYTES} bytes`);
  return problems;
}

function checked(report) {
  const problems = reportProblems(report);
  if (problems.length) throw Object.assign(new Error(problems.join('; ')), { problems });
  return report;
}

export function newDraft({ class: kind, trigger = 'user-initiated', summary, skill_ids, focus_invocation, bundle, ...fields }) {
  const report = checked({
    schema_version: REPORT_SCHEMA_VERSION,
    class: kind,
    trigger,
    summary,
    ...Object.fromEntries((CLASS_FIELDS[kind] ?? []).map((field) => [field, fields[field]])),
    ...(skill_ids?.length ? { skill_ids } : {}),
    ...(focus_invocation ? { focus_invocation } : {}),
    ...(bundle ? { diagnostic_bundle: bundle } : {}),
    removed_fields: [],
    submission_nonce: randomUUID(),
  });
  return { report, numbers: Object.fromEntries(itemsOf(report).map((item, i) => [item.id, i + 1])) };
}

function itemId({ report, numbers }, number) {
  const id = Object.keys(numbers).find((key) => numbers[key] === number);
  if (!id || !itemsOf(report).some((item) => item.id === id)) throw new Error(`no item ${number} in this draft`);
  return id;
}

const changed = (draft, report) => ({ ...draft, report: checked({ ...report, submission_nonce: randomUUID() }) });

function withoutItem(report, id) {
  const { parent, key, element } = locate(report, id);
  if (element) parent[key] = parent[key].filter((entry) => entry.invocation_id !== element);
  else delete parent[key];
}

// True when removing item `number` takes away the failing run a post-error report is about.
// An unknown number is false here; removeItem reports it.
export function dropsFocus({ report, numbers }, number) {
  const focus = report.focus_invocation;
  const id = Object.keys(numbers).find((key) => numbers[key] === number);
  return Boolean(focus) && ['focus_invocation', 'diagnostic_bundle', `diagnostic_bundle.events[${focus}]`].includes(id);
}

// Without its failing run, a post-error report is one the user started.
function withoutFocus(report) {
  delete report.focus_invocation;
  report.trigger = 'user-initiated';
  if (!report.removed_fields.includes('focus_invocation')) report.removed_fields.push('focus_invocation');
}

export function removeItem(draft, number) {
  const id = itemId(draft, number);
  const losesFocus = dropsFocus(draft, number);
  if (!REMOVABLE.some((pattern) => pattern.test(id))) {
    throw new Error(`item ${number} (${id}) cannot be removed${EDITABLE.has(id) ? '; it can be edited' : ''}`);
  }
  const report = structuredClone(draft.report);
  withoutItem(report, id);
  // Removing a part also covers anything inside it the user removed earlier.
  const inside = (field) => field.startsWith(`${id}.`) || field.startsWith(`${id}[`);
  report.removed_fields = [...report.removed_fields.filter((field) => !inside(field)), id];
  if (losesFocus) withoutFocus(report);
  return changed(draft, report);
}

export function editItem(draft, number, value) {
  const id = itemId(draft, number);
  if (!EDITABLE.has(id)) throw new Error(`item ${number} (${id}) cannot be edited`);
  const parsed = id === 'skill_ids' ? splitSkillIds(value) : value;
  return changed(draft, { ...draft.report, [id]: parsed });
}
