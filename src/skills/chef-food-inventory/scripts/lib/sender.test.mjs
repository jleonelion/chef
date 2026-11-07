import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSender, senderAddress } from './sender.mjs';

const trusted = ['Receipts@Example.com'];

test('extracts the address from a bare or display-name sender', () => {
  assert.equal(senderAddress('receipts@example.com'), 'receipts@example.com');
  assert.equal(senderAddress('  Corner Market <Receipts@Example.COM> '), 'receipts@example.com');
});

test('rejects ambiguous or malformed senders', () => {
  assert.equal(senderAddress('a@example.com, b@example.com'), null);
  assert.equal(senderAddress('<a@example.com> <b@example.com>'), null);
  assert.equal(senderAddress('not an address'), null);
  assert.equal(senderAddress(''), null);
  assert.equal(senderAddress(undefined), null);
});

test('accepts a trusted sender case-insensitively', () => {
  assert.deepEqual(checkSender('Market <RECEIPTS@example.com>', trusted), { ok: true });
});

test('a display name that looks trusted does not spoof the gate', () => {
  const result = checkSender('"receipts@example.com" <attacker@example.com>', trusted);
  assert.equal(result.ok, false);
  assert.match(result.reason, /not a trusted receipt sender/);
});

test('lookalike addresses are refused', () => {
  assert.equal(checkSender('receipts+x@example.com', trusted).ok, false);
  assert.equal(checkSender('xreceipts@example.com', trusted).ok, false);
});

test('an empty trusted list means forwarding is off', () => {
  const result = checkSender('receipts@example.com', []);
  assert.equal(result.ok, false);
  assert.match(result.reason, /forwarding is off/);
});
