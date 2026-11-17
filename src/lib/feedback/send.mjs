// Sending an approved feedback report. The bytes are parsed back from the preview the user saw
// and approved (identified by its submission_nonce), so nothing is added or re-derived after
// approval. Until a runtime adapter declares a submit capability, approved bytes are saved to
// the feedback outbox and nothing leaves the machine. No other egress is ever tried. When the
// maintainer has closed intake, the approved bytes go to the outbox too and the draft stays, so
// only the user can ask to send again; Chef never retries by itself.
import { checkAdapter, currentRuntime, hasCapability } from '../../runtime/contract.mjs';
import { bytesFromPreview, renderPreview } from './preview.mjs';
import { reportProblems, serialize } from './report.mjs';
import { deleteDraft, deletePendingContact, savePendingContact, saveReceipt, saveToOutbox } from './store.mjs';

const NOT_SENT = "Sending feedback isn't supported in this runtime, so Chef saved the approved report on this machine and sent nothing.";
export const SAVE_ONLY = "Sending feedback isn't supported in this runtime: on send, Chef saves the approved report on this machine and sends nothing.";
const CLOSED = 'Chef feedback is closed for now, so nothing was sent. Chef kept the approved report on this machine and will not try again by itself.';
// One plain sentence per intake rejection, mirrored in the chef-setup SKILL.md table. Chef never
// trims or edits the report to make it fit; the draft stays as the user approved it.
export const REJECTION_MESSAGES = {
  'missing-install-key': "Chef couldn't prove this install to feedback intake, so nothing was sent. Reconnect the Chef feedback connector and try again.",
  'rate-limited': 'Feedback intake is getting too many reports right now, so nothing was sent. Try again later.',
  'too-large': 'The report is too large for feedback intake, so nothing was sent. Tell me which diagnostics items to remove by number and I will show the new preview.',
  'schema-invalid': 'Feedback intake could not accept the report format, so nothing was sent. Chef did not change the report; you can edit or remove items by number, or try again after updating Chef.',
  'nonce-replayed': 'Feedback intake already has this report, so nothing new was sent. Check your saved receipts before sending it again.',
  'intake-rejected': 'Feedback intake turned the report down, so nothing was sent. You can try again later.',
  unreachable: "Chef couldn't reach feedback intake, so nothing was sent. Check the connection and try again.",
};
export const canSend = (adapter) => hasCapability(adapter, 'submit');

export async function sendReport(root, draft, { nonce, adapter = currentRuntime(), now = new Date() }) {
  checkAdapter(adapter);
  if (nonce !== draft.report.submission_nonce) {
    return { status: 'refused', reason: 'the report changed since that preview; show the current preview and ask again' };
  }
  if (hasCapability(adapter, 'contact') && !draft.contactChoice) {
    return { status: 'contact-question', reason: 'ask whether the reporter wants to provide contact or decline' };
  }
  const bytes = bytesFromPreview(renderPreview(draft));
  if (bytes !== serialize(draft.report)) throw new Error('the preview does not reproduce the report; nothing was sent');
  const problems = reportProblems(draft.report);
  if (problems.length) return { status: 'invalid-input', problems };
  if (canSend(adapter)) {
    const submission = await adapter.feedback.submit(Buffer.from(bytes));
    if (submission.reason === 'intake-closed') {
      return {
        status: 'closed',
        reason: submission.reason,
        notice: CLOSED,
        ...(submission.message && { message: submission.message }),
        path: saveToOutbox(root, bytes, { nonce, now }),
      };
    }
    if (!submission.ok) {
      const message = REJECTION_MESSAGES[submission.reason];
      return { status: 'failed', reason: submission.reason, ...(message && { message }) };
    }
    const receipt = { report_id: submission.report_id, receipt_secret: submission.receipt_secret };
    // The report is already delivered, so a failed local receipt write must not lose that state.
    let receiptPath = null;
    try {
      receiptPath = saveReceipt(root, { ...receipt, class: draft.report.class, sent_at: now.toISOString() }, { now });
    } catch {}
    if (draft.contactChoice) {
      savePendingContact(root, { ...receipt, choice: draft.contactChoice }, { now });
      deleteDraft(root);
      const contact = await adapter.feedback.submitContact(receipt, draft.contactChoice);
      if (!contact.ok) {
        return { status: 'contact-pending', report_id: receipt.report_id, receipt_path: receiptPath, reason: contact.reason };
      }
      deletePendingContact(root, receipt.report_id);
    }
    deleteDraft(root);
    return { status: 'sent', report_id: receipt.report_id, receipt_path: receiptPath };
  }
  const saved = saveToOutbox(root, bytes, { nonce, now });
  deleteDraft(root);
  return {
    status: 'saved',
    path: saved,
    bytes: Buffer.byteLength(bytes),
    notice: NOT_SENT,
    ...(draft.contactChoice && { contact_notice: 'Contact was not sent because this runtime cannot send feedback.' }),
  };
}
