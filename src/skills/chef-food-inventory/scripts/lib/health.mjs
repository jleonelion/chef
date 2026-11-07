// Inventory health check: store schema, audit trail, ledger and rollup agree with the store.
import fs from 'node:fs';
import path from 'node:path';
import { parsePage } from '../../../../lib/frontmatter.mjs';
import { expiringItems } from './expiration.mjs';
import { loadLedger } from './ledger.mjs';
import { renderRollup, ROLLUP_PATH } from './rollup.mjs';
import { listItems, loadInventory, readText, sha256, STORE } from './store.mjs';

function auditProblems(root, storeText) {
  const lines = (readText(root, STORE.audit) ?? '').trim().split('\n').filter(Boolean);
  if (!lines.length) return storeText === null ? [] : ['the store has no audit trail'];
  const last = JSON.parse(lines.at(-1));
  return last.after_hash === sha256(storeText ?? '') ? [] : ['the store changed outside Chef: it does not match the last audit entry'];
}

function rollupProblems(root, inventory) {
  const text = readText(root, ROLLUP_PATH);
  if (text === null) return listItems(inventory).length ? ['the rollup page is missing'] : [];
  const page = parsePage(text);
  const expected = renderRollup(inventory);
  const same = page.body === expected.body && JSON.stringify(page.frontmatter) === JSON.stringify(expected.frontmatter);
  return same ? [] : ['the rollup page does not match the store'];
}

function ledgerProblems(root, ledger) {
  return Object.entries(ledger.receipts)
    .filter(([id, entry]) => !fs.existsSync(path.join(root, STORE.purchases, `${entry.date}-${id}.json`)))
    .map(([id]) => `receipt ${id} has no purchase record`);
}

function stats(inventory, ledger, window) {
  const items = listItems(inventory);
  const { expired, soon } = expiringItems(inventory, window);
  return { items: items.length, empty: items.filter((i) => i.amount === 0).length, expired: expired.length, expiring_soon: soon.length, receipts: Object.keys(ledger.receipts).length };
}

export function checkHealth(root, window) {
  let inventory;
  let ledger;
  try {
    inventory = loadInventory(root);
    ledger = loadLedger(root);
  } catch (error) {
    return { status: 'problems', problems: [error.message], stats: null };
  }
  const problems = [...auditProblems(root, readText(root, STORE.inventory)), ...ledgerProblems(root, ledger), ...rollupProblems(root, inventory)];
  return { status: problems.length ? 'problems' : 'healthy', problems, stats: stats(inventory, ledger, window) };
}
