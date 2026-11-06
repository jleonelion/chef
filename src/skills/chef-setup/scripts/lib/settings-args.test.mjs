import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changesFromFlags } from './settings-args.mjs';

test('maps flags to settings changes', () => {
  const changes = changesFromFlags({
    units: 'metric',
    'household-recipients': ' a@example.com, b@example.com ',
    'trusted-receipt-senders': 'receipts@example.com',
    calendar: 'Family',
  });
  assert.deepEqual(changes, {
    units: 'metric',
    household_recipients: ['a@example.com', 'b@example.com'],
    trusted_receipt_senders: ['receipts@example.com'],
    calendar: 'Family',
  });
});

test('empty lists, "none" and "default" reset to the default', () => {
  assert.deepEqual(changesFromFlags({ units: 'default', 'household-recipients': '', calendar: 'none' }), {
    units: null,
    household_recipients: null,
    calendar: null,
  });
});

test('omitted flags are left unchanged', () => {
  assert.deepEqual(changesFromFlags({ 'data-root': '/x' }), {});
});
