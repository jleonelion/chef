// The one receipt path. Text, a photo the model transcribed, or a forwarded email all arrive as a
// transcript; email first passes the trusted-sender gate. All-or-nothing: any unreadable line
// refuses the whole receipt.
import { applyItems } from './apply.mjs';
import { commitInventory } from './commit.mjs';
import { loadLedger, receiptId, serializeLedger } from './ledger.mjs';
import { checkSender } from './sender.mjs';
import { loadInventory, STORE } from './store.mjs';
import { parseTranscript } from './transcript.mjs';

export const SOURCES = ['text', 'photo', 'email'];
const invalid = (problems, rejected = []) => ({ status: 'invalid-input', problems, rejected });

function readItems(transcript) {
  const { items, rejected } = parseTranscript(transcript);
  if (rejected.length) return invalid(['some priced lines could not be read; fix or remove them and retry'], rejected);
  if (!items.length) return invalid(['no item lines found; each item needs "<qty> <unit> <name> — $<price>"']);
  return { items };
}

function files(id, ledger, purchase, transcript) {
  return {
    data: [
      { path: STORE.ledger, content: serializeLedger(ledger) },
      { path: `${STORE.purchases}/${purchase.date}-${id}.json`, content: `${JSON.stringify(purchase, null, 2)}\n` },
    ],
    raw: [{ path: `knowledge/raw/receipts/${purchase.date}-${id}.txt`, content: transcript }],
  };
}

export function addReceipt(root, { transcript, source, from, id: givenId, date, store, trustedSenders, now }) {
  if (!SOURCES.includes(source)) return invalid([`source must be one of ${SOURCES.join(', ')}`]);
  if (source === 'email') {
    const gate = checkSender(from, trustedSenders);
    if (!gate.ok) return { status: 'refused', reason: gate.reason };
  }
  const parsed = readItems(transcript);
  if (parsed.status) return parsed;
  const id = receiptId({ id: givenId, transcript });
  const ledger = loadLedger(root);
  if (Object.hasOwn(ledger.receipts, id)) return { status: 'duplicate', receipt_id: id, processed_at: ledger.receipts[id].processed_at };

  const applied = applyItems(loadInventory(root), parsed.items, { date, now });
  if (applied.rejected.length) return invalid(['some items do not fit the current inventory'], applied.rejected);
  const purchase = { receipt_id: id, date, source, store: store ?? null, items: parsed.items.map(({ lineNumber, ...item }) => item) };
  ledger.receipts[id] = { date, source, store: store ?? null, processed_at: now, items: applied.changes.length };
  const written = commitInventory(root, {
    inventory: applied.inventory,
    action: 'receipt',
    details: { receipt_id: id, source, changes: applied.changes },
    ...files(id, ledger, purchase, transcript),
    message: `chef-food-inventory: receipt ${date} (${applied.changes.length} items)`,
  });
  if (written.status !== 'written') return written;
  return { status: 'added', receipt_id: id, changes: applied.changes, rollup: written.pages[0] };
}
