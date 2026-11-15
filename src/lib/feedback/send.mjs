// Sending an approved feedback report. The bytes are parsed back from the preview the user saw
// and approved (identified by its submission_nonce), so nothing is added or re-derived after
// approval. Until a runtime adapter declares a submit capability, approved bytes are saved to
// the feedback outbox and nothing leaves the machine. No other egress is ever tried.
import { checkAdapter, currentRuntime, hasCapability } from '../../runtime/contract.mjs';
import { bytesFromPreview, renderPreview } from './preview.mjs';
import { reportProblems, serialize } from './report.mjs';
import { deleteDraft, saveToOutbox } from './store.mjs';

const NOT_SENT = "Sending feedback isn't supported in this runtime, so Chef saved the approved report on this machine and sent nothing.";
export const SAVE_ONLY = "Sending feedback isn't supported in this runtime: on send, Chef saves the approved report on this machine and sends nothing.";
export const canSend = (adapter) => hasCapability(adapter, 'submit');

export function sendReport(root, draft, { nonce, adapter = currentRuntime(), now = new Date() }) {
  checkAdapter(adapter);
  if (nonce !== draft.report.submission_nonce) {
    return { status: 'refused', reason: 'the report changed since that preview; show the current preview and ask again' };
  }
  const bytes = bytesFromPreview(renderPreview(draft));
  if (bytes !== serialize(draft.report)) throw new Error('the preview does not reproduce the report; nothing was sent');
  const problems = reportProblems(draft.report);
  if (problems.length) return { status: 'invalid-input', problems };
  // No v1 adapter declares submit.*; the Muse connector transport replaces this branch (#80).
  if (canSend(adapter)) throw new Error('submit transport not implemented');
  const saved = saveToOutbox(root, bytes, { nonce, now });
  deleteDraft(root);
  return { status: 'saved', path: saved, bytes: Buffer.byteLength(bytes), notice: NOT_SENT };
}
