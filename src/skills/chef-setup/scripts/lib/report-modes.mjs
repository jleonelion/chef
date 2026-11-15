// chef-setup feedback report modes: report-draft, report-preview, report-edit, report-remove,
// report-send and report-discard. One draft at a time lives under diagnostics/; every mode that
// changes it returns the full new preview and its submission_nonce, which report-send requires.
import { traceEnabled } from '../../../../lib/diagnostics/capture.mjs';
import { readTrace } from '../../../../lib/diagnostics/trace.mjs';
import { buildBundle, installedSkills, selectEvents } from '../../../../lib/feedback/bundle.mjs';
import { renderPreview } from '../../../../lib/feedback/preview.mjs';
import { editItem, newDraft, removeItem, serialize } from '../../../../lib/feedback/report.mjs';
import { canSend, SAVE_ONLY, sendReport } from '../../../../lib/feedback/send.mjs';
import { deleteDraft, readDraft, saveDraft } from '../../../../lib/feedback/store.mjs';
import { checkAdapter, currentRuntime } from '../../../../runtime/contract.mjs';

export const REPORT_FLAGS = Object.fromEntries(
  ['class', 'summary', 'expected', 'actual', 'frequency', 'desired-outcome', 'current-behavior', 'desired-behavior', 'skill-ids', 'diagnostics', 'item', 'value', 'nonce'].map((flag) => [flag, { type: 'string' }]),
);
REPORT_FLAGS.raw = { type: 'boolean' };

const NO_DRAFT = { status: 'refused', reason: 'there is no report draft; start one with report-draft' };
const invalid = (root, error) => ({ status: 'invalid-input', data_root: root, problems: error.problems ?? [error.message] });

function shown(root, draft, adapter) {
  return { status: 'draft', data_root: root, preview: renderPreview(draft), submission_nonce: draft.report.submission_nonce, can_send: canSend(adapter), ...(canSend(adapter) ? {} : { send_notice: SAVE_ONLY }) };
}

// Diagnostics attach by default to defects only.
function bundleFor(root, values, skillIds, { adapter, skillsDir }) {
  if ((values.diagnostics ?? (values.class === 'defect' ? 'on' : 'off')) !== 'on') return undefined;
  const now = new Date();
  const traceOn = traceEnabled(root);
  const events = traceOn ? selectEvents(readTrace(root, { now }).events, { now, skill: skillIds[0] }) : [];
  return buildBundle({ events, adapter, traceOn, skills: installedSkills(skillsDir), now });
}

function draftMode(root, values, context) {
  const skillIds = values['skill-ids']?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
  try {
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
      bundle: bundleFor(root, values, skillIds, context),
    });
    saveDraft(root, draft);
    return shown(root, draft, context.adapter);
  } catch (error) {
    return invalid(root, error);
  }
}

function previewMode(root, values, { adapter }) {
  const draft = readDraft(root);
  if (!draft) return { ...NO_DRAFT, data_root: root };
  return values.raw ? { status: 'draft', data_root: root, raw: serialize(draft.report) } : shown(root, draft, adapter);
}

function changeMode(change) {
  return (root, values, { adapter }) => {
    const draft = readDraft(root);
    if (!draft) return { ...NO_DRAFT, data_root: root };
    try {
      const next = change(draft, Number(values.item), values.value ?? '');
      saveDraft(root, next);
      return shown(root, next, adapter);
    } catch (error) {
      return invalid(root, error);
    }
  };
}

async function sendMode(root, values, { adapter }) {
  const draft = readDraft(root);
  if (!draft) return { ...NO_DRAFT, data_root: root };
  return { data_root: root, ...(await sendReport(root, draft, { nonce: values.nonce, adapter })) };
}

const MODES = {
  'report-draft': draftMode,
  'report-preview': previewMode,
  'report-edit': changeMode(editItem),
  'report-remove': changeMode((draft, item) => removeItem(draft, item)),
  'report-send': sendMode,
  'report-discard': (root) => ({ status: deleteDraft(root) ? 'discarded' : 'empty', data_root: root }),
};

// { mode: (root, values) => result } for setup.mjs, bound to this runtime and skills folder.
export function reportModes({ skillsDir }) {
  return Object.fromEntries(Object.entries(MODES).map(([name, mode]) => [name, (root, values) => mode(root, values, { adapter: checkAdapter(currentRuntime()), skillsDir })]));
}
