// chef-setup feedback report modes: report-draft, report-preview, report-edit, report-remove,
// report-send and report-discard. One draft at a time lives under diagnostics/; every mode that
// changes it returns the full new preview and its submission_nonce, which report-send requires.
import ERROR_CODES from '../../../../../schemas/feedback/error-codes.v1.json' with { type: 'json' };
import { traceEnabled } from '../../../../lib/diagnostics/capture.mjs';
import { declineOffer } from '../../../../lib/diagnostics/offers.mjs';
import { readTrace } from '../../../../lib/diagnostics/trace.mjs';
import { buildBundle, installedSkills, selectAround, selectEvents } from '../../../../lib/feedback/bundle.mjs';
import { renderPreview } from '../../../../lib/feedback/preview.mjs';
import { dropsFocus, editItem, newDraft, removeItem, serialize, splitSkillIds } from '../../../../lib/feedback/report.mjs';
import { canSend, SAVE_ONLY, sendReport } from '../../../../lib/feedback/send.mjs';
import { deleteDraft, readDraft, saveDraft } from '../../../../lib/feedback/store.mjs';
import { checkAdapter, currentRuntime } from '../../../../runtime/contract.mjs';

const STRING_FLAGS = ['class', 'summary', 'expected', 'actual', 'frequency', 'desired-outcome', 'current-behavior', 'desired-behavior', 'contact'];
export const REPORT_FLAGS = {
  ...Object.fromEntries([...STRING_FLAGS, 'skill-ids', 'diagnostics', 'item', 'value', 'nonce', 'focus', 'code'].map((flag) => [flag, { type: 'string' }])),
  raw: { type: 'boolean' },
};

const NO_DRAFT = { status: 'refused', reason: 'there is no report draft; start one with report-draft' };
const invalid = (root, error) => ({ status: 'invalid-input', data_root: root, problems: error.problems ?? [error.message] });

const DIAGNOSTICS = ['on', 'off', 'wide'];
const CONTACT_DROPPED = "This runtime can't take contact details, so Chef dropped the contact you gave; it is not in the report.";
const canTakeContact = (adapter) => adapter.feedback.capabilities().includes('contact.opaque');

function shown(root, draft, adapter) {
  const sendable = canSend(adapter);
  return {
    status: 'draft',
    data_root: root,
    preview: renderPreview(draft),
    submission_nonce: draft.report.submission_nonce,
    can_send: sendable,
    can_ask_contact: canTakeContact(adapter),
    ...(sendable ? {} : { send_notice: SAVE_ONLY }),
  };
}

// Runs `mode` on the saved draft, or refuses when there is none.
const withDraft = (mode) => (root, values, context) => {
  const draft = readDraft(root);
  return draft ? mode(root, draft, values, context) : { ...NO_DRAFT, data_root: root };
};

// Diagnostics attach by default to defects only; `wide` takes every skill's recent runs.
// Returns the bundle and, when selection fell back to the last runs of any skill, a preview note.
function diagnosticsFor(root, values, skillIds, { adapter, skillsDir }) {
  const choice = values.diagnostics ?? (values.class === 'defect' ? 'on' : 'off');
  if (!DIAGNOSTICS.includes(choice)) throw new Error(`diagnostics: must be one of ${DIAGNOSTICS.join(', ')}`);
  if (choice === 'off') return {};
  const now = new Date();
  const traceOn = traceEnabled(root);
  const skill = choice === 'wide' ? undefined : skillIds[0];
  const { events, fallback } = traceOn ? selectEvents(readTrace(root, { now }).events, { now, skill }) : { events: [], fallback: false };
  const bundle = buildBundle({ events, adapter, traceOn, skills: installedSkills(skillsDir), now });
  return { bundle, ...(fallback && { notes: { diagnostics_fallback: { skill: skill ?? null } } }) };
}

// Accepting a post-error offer: a defect about the failing run, with answers pre-drafted from the
// run's registry fields only (skill, operation, error code) for the user to change.
function postErrorFields(root, values, { adapter, skillsDir }) {
  const now = new Date();
  const around = traceEnabled(root) ? selectAround(readTrace(root, { now }).events, values.focus) : null;
  if (!around) throw new Error('focus: that run is not in the invocation trace');
  const { events, focus } = around;
  const bundle = buildBundle({ events, adapter, traceOn: true, skills: installedSkills(skillsDir), now });
  const run = `${focus.skill_id} ${focus.operation}`;
  return {
    class: 'defect',
    trigger: 'post-error',
    summary: values.summary ?? `${run} stopped with an internal error`,
    expected: values.expected ?? `${run} finishes`,
    actual: values.actual ?? `It stopped with an internal error (${focus.error_code}).`,
    frequency: values.frequency ?? 'unknown',
    skill_ids: [focus.skill_id],
    focus_invocation: bundle.events[events.indexOf(focus)].invocation_id,
    bundle,
  };
}

function userFields(root, values, context) {
  const skillIds = splitSkillIds(values['skill-ids']);
  const { bundle, notes } = diagnosticsFor(root, values, skillIds, context);
  return {
    notes,
    class: values.class,
    summary: values.summary,
    expected: values.expected,
    actual: values.actual,
    frequency: values.frequency,
    desired_outcome: values['desired-outcome'],
    current_behavior: values['current-behavior'],
    desired_behavior: values['desired-behavior'],
    skill_ids: skillIds,
    bundle,
  };
}

function draftMode(root, values, context) {
  try {
    const { notes, ...fields } = values.focus === undefined ? userFields(root, values, context) : postErrorFields(root, values, context);
    // No v1 adapter declares contact.opaque; its transport lands with the Muse submit path (#80).
    if (values.contact !== undefined && canTakeContact(context.adapter)) throw new Error('contact transport not implemented');
    const draft = newDraft(fields);
    if (notes) draft.notes = notes;
    saveDraft(root, draft);
    return { ...shown(root, draft, context.adapter), ...(values.contact !== undefined && { contact_notice: CONTACT_DROPPED }) };
  } catch (error) {
    return invalid(root, error);
  }
}

function previewMode(root, draft, values, { adapter }) {
  return values.raw ? { status: 'draft', data_root: root, raw: serialize(draft.report) } : shown(root, draft, adapter);
}

const changeMode = (change) => (root, draft, values, { adapter }) => {
  try {
    const next = change(draft, Number(values.item), values.value ?? '');
    saveDraft(root, next);
    return shown(root, next, adapter);
  } catch (error) {
    return invalid(root, error);
  }
};

const FOCUS_WARNING = 'Removing this takes away the failing run, so the report becomes user-initiated: it will no longer say which run failed. Ask the user to confirm first.';

// Removing the failing run of a post-error report needs --confirm.
const removeMode = (root, draft, values, context) => {
  if (!values.confirm && dropsFocus(draft, Number(values.item))) return { status: 'confirmation-required', data_root: root, item: Number(values.item), warning: FOCUS_WARNING };
  return changeMode(removeItem)(root, draft, values, context);
};

function declineMode(root, values) {
  if (!Object.hasOwn(ERROR_CODES.codes, values.code ?? '')) return invalid(root, new Error('code: must be the error_code of the offer'));
  declineOffer(root, values.code);
  return { status: 'declined', data_root: root, error_code: values.code };
}

const sendMode = (root, draft, values, { adapter }) => ({ data_root: root, ...sendReport(root, draft, { nonce: values.nonce, adapter }) });

const MODES = {
  'report-draft': draftMode,
  'report-preview': withDraft(previewMode),
  'report-edit': withDraft(changeMode(editItem)),
  'report-remove': withDraft(removeMode),
  'report-send': withDraft(sendMode),
  'report-offer-decline': declineMode,
  'report-discard': (root) => ({ status: deleteDraft(root) ? 'discarded' : 'empty', data_root: root }),
};

// { mode: (root, values) => result } for setup.mjs, bound to this runtime and skills folder.
export function reportModes({ skillsDir }) {
  const bound = (mode) => (root, values) => mode(root, values, { adapter: checkAdapter(currentRuntime()), skillsDir });
  return Object.fromEntries(Object.entries(MODES).map(([name, mode]) => [name, bound(mode)]));
}
