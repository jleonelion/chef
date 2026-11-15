// chef-setup feedback report modes: report-draft, report-preview, report-edit, report-remove,
// report-send and report-discard. One draft at a time lives under diagnostics/; every mode that
// changes it returns the full new preview and its submission_nonce, which report-send requires.
import { traceEnabled } from '../../../../lib/diagnostics/capture.mjs';
import { readTrace } from '../../../../lib/diagnostics/trace.mjs';
import { buildBundle, installedSkills, selectEvents } from '../../../../lib/feedback/bundle.mjs';
import { renderPreview } from '../../../../lib/feedback/preview.mjs';
import { editItem, newDraft, removeItem, serialize, splitSkillIds } from '../../../../lib/feedback/report.mjs';
import { canSend, SAVE_ONLY, sendReport } from '../../../../lib/feedback/send.mjs';
import { deleteDraft, readDraft, saveDraft } from '../../../../lib/feedback/store.mjs';
import { checkAdapter, currentRuntime } from '../../../../runtime/contract.mjs';

const STRING_FLAGS = ['class', 'summary', 'expected', 'actual', 'frequency', 'desired-outcome', 'current-behavior', 'desired-behavior', 'contact'];
export const REPORT_FLAGS = {
  ...Object.fromEntries([...STRING_FLAGS, 'skill-ids', 'diagnostics', 'item', 'value', 'nonce'].map((flag) => [flag, { type: 'string' }])),
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

function draftMode(root, values, context) {
  const skillIds = splitSkillIds(values['skill-ids']);
  try {
    const { bundle, notes } = diagnosticsFor(root, values, skillIds, context);
    // No v1 adapter declares contact.opaque; its transport lands with the Muse submit path (#80).
    if (values.contact !== undefined && canTakeContact(context.adapter)) throw new Error('contact transport not implemented');
    const draft = newDraft({
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
    });
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

const sendMode = (root, draft, values, { adapter }) => ({ data_root: root, ...sendReport(root, draft, { nonce: values.nonce, adapter }) });

const MODES = {
  'report-draft': draftMode,
  'report-preview': withDraft(previewMode),
  'report-edit': withDraft(changeMode(editItem)),
  'report-remove': withDraft(changeMode(removeItem)),
  'report-send': withDraft(sendMode),
  'report-discard': (root) => ({ status: deleteDraft(root) ? 'discarded' : 'empty', data_root: root }),
};

// { mode: (root, values) => result } for setup.mjs, bound to this runtime and skills folder.
export function reportModes({ skillsDir }) {
  const bound = (mode) => (root, values) => mode(root, values, { adapter: checkAdapter(currentRuntime()), skillsDir });
  return Object.fromEntries(Object.entries(MODES).map(([name, mode]) => [name, bound(mode)]));
}
