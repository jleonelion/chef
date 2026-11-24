#!/usr/bin/env node
// chef-food-inventory entry point; the only reader and writer of data/food-inventory/.
// Modes: view, check-sender, add-receipt, edit, deduct, expiring, health, rollup. Prints one JSON object.
import { parseArgs } from 'node:util';
import { invalidMode, isDirectExecution } from '../../../lib/cli-entry.mjs';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture } from '../../../lib/diagnostics/capture.mjs';
import { displayQuantity } from '../../../lib/quantity.mjs';
import { readSchemaVersion } from '../../../lib/schema.mjs';
import { readSettings } from '../../../lib/settings.mjs';
import { OPTIONS, readTranscript, today } from './lib/cli-args.mjs';
import { regenerateRollup } from './lib/commit.mjs';
import { deductRecipe } from './lib/deduct.mjs';
import { editItem } from './lib/edit.mjs';
import { expiringItems } from './lib/expiration.mjs';
import { checkHealth } from './lib/health.mjs';
import { addReceipt } from './lib/receipt.mjs';
import { checkSender } from './lib/sender.mjs';
import { listItems, loadInventory } from './lib/store.mjs';

const { values, positionals } = parseArgs({ args: isDirectExecution(import.meta.url) ? process.argv.slice(2) : [], options: OPTIONS, allowPositionals: true });
const now = new Date().toISOString();
const days = () => {
  const value = Number(values.days ?? 3);
  return Number.isInteger(value) && value >= 0 && value <= 365 ? value : 3;
};
const window = () => ({ today: values.today ?? today(), days: days() });

const MODES = {
  // amount/unit as stored (for edits); display in the household's unit system.
  view: (root, settings) => ({
    status: 'ok',
    items: listItems(loadInventory(root)).map(({ path, name, amount, unit, expires }) => ({
      path, name, amount, unit, display: displayQuantity(amount, unit, settings.units).text, expires: expires ?? null,
    })),
  }),
  'check-sender': (root, settings) => {
    const gate = checkSender(values.from, settings.trusted_receipt_senders, { authenticated: values.authenticated });
    return gate.ok ? { status: 'trusted' } : { status: 'refused', reason: gate.reason };
  },
  'add-receipt': (root, settings) =>
    addReceipt(root, {
      transcript: readTranscript(values['transcript-file']),
      source: values.source ?? 'text',
      from: values.from,
      authenticated: values.authenticated,
      id: values['receipt-id'],
      date: values.date ?? today(),
      store: values.store?.slice(0, 80),
      trustedSenders: settings.trusted_receipt_senders,
      now,
    }),
  edit: (root) =>
    editItem(root, {
      path: values.path,
      amount: values.amount === undefined ? undefined : Number(values.amount),
      unit: values.unit,
      expires: values.expires === 'none' ? null : values.expires,
      remove: values.remove ?? false,
      reason: values.reason,
      now,
    }),
  deduct: (root) => deductRecipe(root, {
    recipe: values.recipe,
    servings: Number(values.servings),
    deductionId: values['deduction-id'],
    matches: values.match,
    now,
  }),
  expiring: (root) => ({ status: 'ok', ...window(), ...expiringItems(loadInventory(root), window()) }),
  health: (root) => checkHealth(root, window()),
  rollup: (root) => regenerateRollup(root, now),
};
export const SCRIPT_CONTRACT = Object.freeze({
  modes: Object.keys(MODES),
  flags: Object.keys(OPTIONS),
  statuses: {
    ok: ['ok', 'trusted', 'added', 'duplicate', 'saved', 'deducted', 'regenerated', 'healthy', 'problems'],
    errors: ['refused', 'invalid-input'],
  },
});

const mode = positionals[0];
const root = resolveDataRoot({ flag: values['data-root'] });
function run() {
  if (readSchemaVersion(root) === null) return { status: 'refused', reason: 'not a Chef data root; run chef-setup first' };
  const { settings, warning } = readSettings(root);
  return { data_root: root, ...MODES[mode](root, settings), ...(warning ? { settings_warning: warning } : {}) };
}
if (isDirectExecution(import.meta.url)) {
  const result = Object.hasOwn(MODES, mode ?? '')
    ? await chefCapture({ root, skill: 'chef-food-inventory', script: 'inventory', operation: mode }, run)
    : invalidMode(mode, SCRIPT_CONTRACT.modes, root);
  console.log(JSON.stringify(result));
  if (SCRIPT_CONTRACT.statuses.errors.includes(result.status)) process.exitCode = 2;
}
