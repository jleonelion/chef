// chef-setup feedback report modes: report-draft, report-preview, report-edit, report-remove,
// report-send, report-discard and report-delete (of a sent report). One draft at a time lives under diagnostics/; every mode that
// changes it returns the full new preview and its submission_nonce, which report-send requires.
import ERROR_CODES from '../../../../../schemas/feedback/error-codes.v1.json' with { type: 'json' };
import { traceEnabled } from '../../../../lib/diagnostics/capture.mjs';
import { declineOffer } from '../../../../lib/diagnostics/offers.mjs';
import { readTrace } from '../../../../lib/diagnostics/trace.mjs';
import { buildBundle, installedSkills, selectAround, selectEvents } from '../../../../lib/feedback/bundle.mjs';
import { bytesFromPreview, renderPreview } from '../../../../lib/feedback/preview.mjs';
import { dropsFocus, editItem, newDraft, removeItem, serialize, SKILL_ID, splitSkillIds } from '../../../../lib/feedback/report.mjs';
import { destinationCard } from '../../../../lib/feedback/destination.mjs';
import { canSend, SAVE_ONLY, sendReport } from '../../../../lib/feedback/send.mjs';
import {
  deleteDraft,
  deletePendingContact,
  deleteReceipt,
  listReceipts,
  readDraft,
  readPendingContact,
  readReceipt,
  saveDraft,
} from '../../../../lib/feedback/store.mjs';
import { checkAdapter, currentRuntime, hasCapability } from '../../../../runtime/contract.mjs';

const STRING_FLAGS = ['class', 'summary', 'expected', 'actual', 'frequency', 'desired-outcome', 'current-behavior', 'desired-behavior', 'contact'];
export const REPORT_FLAGS = {
  ...Object.fromEntries([...STRING_FLAGS, 'skill-ids', 'diagnostics', 'item', 'value', 'nonce', 'focus', 'skill', 'code', 'report-id'].map((flag) => [flag, { type: 'string' }])),
  declined: { type: 'boolean' },
  raw: { type: 'boolean' },
};

const NO_DRAFT = { status: 'refused', reason: 'there is no report draft; start one with report-draft' };
const invalid = (root, error) => ({ status: 'invalid-input', data_root: root, problems: error.problems ?? [error.message] });

const DIAGNOSTICS = ['on', 'off', 'wide'];
const CONTACT_DROPPED = "This runtime can't take contact details, so Chef dropped the contact you gave; it is not in the report.";
const CONTACT_MAX_CHARS = 500;
const canTakeContact = (adapter) => adapter.feedback.capabilities().includes('contact.opaque');

function shown(root, draft, adapter) {
  const sendable = canSend(adapter);
  const canAskContact = canTakeContact(adapter);
  if (canAskContact && !draft.contactChoice) {
    return { status: 'contact-question', data_root: root, can_ask_contact: true };
  }
  const preview = renderPreview(draft);
  return {
    status: 'draft',
    data_root: root,
    preview,
    submission_nonce: draft.report.submission_nonce,
    can_send: sendable,
    can_ask_contact: canAskContact,
    ...(sendable ? { destination_card: destinationCard(adapter, bytesFromPreview(preview)) } : { send_notice: SAVE_ONLY }),
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
    if (values.contact !== undefined && values.declined) throw new Error('contact: choose a value or decline, not both');
    const offersContact = canTakeContact(context.adapter);
    if (offersContact && values.contact !== undefined) {
      if (
        typeof values.contact !== 'string' ||
        !values.contact.trim() ||
        [...values.contact].length > CONTACT_MAX_CHARS ||
        /[\u0000-\u001f\u007f\u2028\u2029]/.test(values.contact)
      ) {
        throw new Error(`contact: use plain text of at most ${CONTACT_MAX_CHARS} characters`);
      }
    }
    const draft = newDraft(fields);
    if (notes) draft.notes = notes;
    if (offersContact) {
      if (values.contact !== undefined) draft.contactChoice = { contact: values.contact };
      else if (values.declined) draft.contactChoice = { declined: true };
    }
    saveDraft(root, draft);
    return {
      ...shown(root, draft, context.adapter),
      ...(!offersContact && values.contact !== undefined && { contact_notice: CONTACT_DROPPED }),
    };
  } catch (error) {
    return invalid(root, error);
  }
}

function previewMode(root, draft, values, { adapter }) {
  if (canTakeContact(adapter) && !draft.contactChoice) return shown(root, draft, adapter);
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

// "No thanks" to an offer: { skill, code } from the offer's skill_id and error_code.
function declineMode(root, values) {
  const problems = [
    !SKILL_ID.test(values.skill ?? '') && 'skill: must be the skill_id of the offer',
    !Object.hasOwn(ERROR_CODES.codes, values.code ?? '') && 'code: must be the error_code of the offer',
  ].filter(Boolean);
  if (problems.length) return { status: 'invalid-input', data_root: root, problems };
  declineOffer(root, { skill: values.skill, code: values.code });
  return { status: 'declined', data_root: root, skill_id: values.skill, error_code: values.code };
}

const sendMode = async (root, draft, values, { adapter }) => ({
  data_root: root,
  ...await sendReport(root, draft, { nonce: values.nonce, adapter }),
});

async function retryContactMode(root, values, { adapter }) {
  try {
    const pending = readPendingContact(root, values['report-id']);
    if (!pending) return { status: 'refused', data_root: root, reason: 'there is no pending contact request for that report' };
    const result = await adapter.feedback.submitContact(
      { report_id: pending.report_id, receipt_secret: pending.receipt_secret },
      pending.choice,
    );
    if (!result.ok) return { status: 'contact-pending', data_root: root, report_id: pending.report_id, reason: result.reason };
    deletePendingContact(root, pending.report_id);
    return { status: 'contact-updated', data_root: root, report_id: pending.report_id };
  } catch (error) {
    return invalid(root, error);
  }
}

const DELETE_NEEDS_CONNECTOR = "Deleting a sent report needs Muse's Chef feedback connector, which this runtime doesn't have connected, so nothing was deleted.";
const DELETE_WARNING = 'This permanently deletes the report, with any contact and replies, from feedback intake. It cannot be undone. Ask the user to confirm first.';
const GONE = 'That report has expired or was already deleted, so there was nothing left to delete. Chef removed its local receipt.';

// Without --report-id: the sent reports to pick from. With it: confirmation first, then the
// receipt-gated delete. The receipt secret never appears in a result.
async function deleteMode(root, values, { adapter }) {
  if (!hasCapability(adapter, 'delete')) return { status: 'unsupported', data_root: root, reason: DELETE_NEEDS_CONNECTOR };
  try {
    if (values['report-id'] === undefined) {
      const receipts = listReceipts(root);
      return receipts.length ? { status: 'choose', data_root: root, receipts } : { status: 'empty', data_root: root };
    }
    const receipt = readReceipt(root, values['report-id']);
    if (!receipt) return { status: 'refused', data_root: root, reason: 'there is no receipt for that report on this machine' };
    const { report_id } = receipt;
    if (!values.confirm) {
      return { status: 'confirmation-required', data_root: root, report: { report_id, class: receipt.class, sent_at: receipt.sent_at }, warning: DELETE_WARNING };
    }
    const result = await adapter.feedback.deleteReport({ report_id, receipt_secret: receipt.receipt_secret });
    if (!result.ok && result.reason !== 'not-found') return { status: 'failed', data_root: root, report_id, reason: result.reason };
    deleteReceipt(root, report_id);
    deletePendingContact(root, report_id);
    return result.ok ? { status: 'deleted', data_root: root, report_id } : { status: 'expired-or-deleted', data_root: root, report_id, notice: GONE };
  } catch (error) {
    return invalid(root, error);
  }
}

const MODES = {
  'report-draft': draftMode,
  'report-preview': withDraft(previewMode),
  'report-edit': withDraft(changeMode(editItem)),
  'report-remove': withDraft(removeMode),
  'report-send': withDraft(sendMode),
  'report-contact-retry': retryContactMode,
  'report-offer-decline': declineMode,
  'report-discard': (root) => ({ status: deleteDraft(root) ? 'discarded' : 'empty', data_root: root }),
  'report-delete': deleteMode,
};

// { mode: (root, values) => result } for setup.mjs, bound to this runtime and skills folder.
export function reportModes({ skillsDir, adapter }) {
  const bound = (mode) => (root, values) => mode(root, values, { adapter: checkAdapter(adapter ?? currentRuntime()), skillsDir });
  return Object.fromEntries(Object.entries(MODES).map(([name, mode]) => [name, bound(mode)]));
}
