// Processed-receipt ledger (data-root state): one entry per receipt, so a receipt is never applied twice.
import { readText, sha256, STORE } from './store.mjs';

export function loadLedger(root) {
  const text = readText(root, STORE.ledger);
  return text === null ? { receipts: {} } : JSON.parse(text);
}

// A caller-supplied id (such as an email Message-ID) wins; otherwise the transcript's own text.
export function receiptId({ id, transcript }) {
  const basis = id?.trim() ? `id:${id.trim()}` : `text:${transcript.replace(/\s+/g, ' ').trim().toLowerCase()}`;
  return sha256(basis).slice(0, 16);
}

export const serializeLedger = (ledger) => `${JSON.stringify(ledger, null, 2)}\n`;
