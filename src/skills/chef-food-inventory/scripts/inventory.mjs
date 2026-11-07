#!/usr/bin/env node
// chef-food-inventory entry point; the only reader and writer of data/food-inventory/.
// Modes: view, check-sender, add-receipt, edit, expiring, health, rollup. Prints one JSON object.
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { readSchemaVersion } from '../../../lib/schema.mjs';
import { readSettings } from '../../../lib/settings.mjs';
import { OPTIONS, readTranscript, today } from './lib/cli-args.mjs';
import { commitInventory } from './lib/commit.mjs';
import { deductRecipe } from './lib/deduct.mjs';
import { editItem } from './lib/edit.mjs';
import { expiringItems } from './lib/expiration.mjs';
import { checkHealth } from './lib/health.mjs';
import { addReceipt } from './lib/receipt.mjs';
import { checkSender } from './lib/sender.mjs';
import { listItems, loadInventory } from './lib/store.mjs';

const { values, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true });
const now = new Date().toISOString();
const days = () => {
  const value = Number(values.days ?? 3);
  return Number.isInteger(value) && value >= 0 && value <= 365 ? value : 3;
};
const window = () => ({ today: values.today ?? today(), days: days() });

function rollup(root) {
  const inventory = { ...loadInventory(root), lastUpdated: now };
  const written = commitInventory(root, { inventory, action: 'rollup', details: {}, message: 'chef-food-inventory: regenerate rollup' });
  return written.status === 'written' ? { status: 'regenerated', rollup: written.pages[0] } : written;
}

const MODES = {
  view: (root) => ({ status: 'ok', items: listItems(loadInventory(root)).map(({ path, name, amount, unit, expires }) => ({ path, name, amount, unit, expires: expires ?? null })) }),
  'check-sender': (root, settings) => {
    const gate = checkSender(values.from, settings.trusted_receipt_senders);
    return gate.ok ? { status: 'trusted' } : { status: 'refused', reason: gate.reason };
  },
  'add-receipt': (root, settings) =>
    addReceipt(root, {
      transcript: readTranscript(values['transcript-file']),
      source: values.source ?? 'text',
      from: values.from,
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
    now,
  }),
  expiring: (root) => ({ status: 'ok', ...window(), ...expiringItems(loadInventory(root), window()) }),
  health: (root) => checkHealth(root, window()),
  rollup,
};

const mode = positionals[0];
if (!Object.hasOwn(MODES, mode ?? '')) {
  console.error(`Usage: inventory.mjs <${Object.keys(MODES).join('|')}> [options]`);
  process.exit(64);
}
const root = resolveDataRoot({ flag: values['data-root'] });
let result;
if (readSchemaVersion(root) === null) result = { status: 'refused', reason: 'not a Chef data root; run chef-setup first' };
else {
  const { settings, warning } = readSettings(root);
  result = { data_root: root, ...MODES[mode](root, settings), ...(warning ? { settings_warning: warning } : {}) };
}
console.log(JSON.stringify(result));
if (result.status === 'refused' || result.status === 'invalid-input') process.exitCode = 2;
