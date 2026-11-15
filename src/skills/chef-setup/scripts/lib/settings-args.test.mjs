import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changesFromFlags } from './settings-args.mjs';

test('maps flags to settings changes', () => {
  const changes = changesFromFlags({
    units: 'metric',
    'household-recipients': ' a@example.com, b@example.com ',
    'trusted-receipt-senders': 'receipts@example.com',
    calendar: 'Family',
    trace: 'off',
  });
  assert.deepEqual(changes, {
    units: 'metric',
    household_recipients: ['a@example.com', 'b@example.com'],
    trusted_receipt_senders: ['receipts@example.com'],
    calendar: 'Family',
    diagnostics: { trace: 'off' },
  });
});

test('empty lists, "none" and "default" reset to the default', () => {
  assert.deepEqual(changesFromFlags({ units: 'default', 'household-recipients': '', calendar: 'none', trace: 'default' }), {
    units: null,
    diagnostics: null,
    household_recipients: null,
    calendar: null,
  });
});

test('--convert-recipe-units takes true, false or default; anything else is left for validation', () => {
  assert.deepEqual(changesFromFlags({ 'convert-recipe-units': 'true' }), { convert_recipe_units: true });
  assert.deepEqual(changesFromFlags({ 'convert-recipe-units': 'false' }), { convert_recipe_units: false });
  assert.deepEqual(changesFromFlags({ 'convert-recipe-units': 'default' }), { convert_recipe_units: null });
  assert.deepEqual(changesFromFlags({ 'convert-recipe-units': 'yes' }), { convert_recipe_units: 'yes' });
});

test('omitted flags are left unchanged', () => {
  assert.deepEqual(changesFromFlags({ 'data-root': '/x' }), {});
});
