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

const AUTH = { authenticated: 'example.com' };

test('accepts a trusted sender case-insensitively', () => {
  assert.deepEqual(checkSender('Market <RECEIPTS@example.com>', trusted, AUTH), { ok: true });
});

test('a display name that looks trusted does not spoof the gate', () => {
  const result = checkSender('"receipts@example.com" <attacker@example.com>', trusted, AUTH);
  assert.equal(result.ok, false);
  assert.match(result.reason, /not a trusted receipt sender/);
});

test('lookalike addresses are refused', () => {
  assert.equal(checkSender('receipts+x@example.com', trusted, AUTH).ok, false);
  assert.equal(checkSender('xreceipts@example.com', trusted, AUTH).ok, false);
});

test('a trusted From is refused without authentication evidence for its domain', () => {
  const result = checkSender('receipts@example.com', trusted);
  assert.equal(result.ok, false);
  assert.match(result.reason, /not authenticated/);
});

test('a trusted From is refused when the authenticated domain differs (spoofed From)', () => {
  const result = checkSender('receipts@example.com', trusted, { authenticated: 'attacker.example.net' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not authenticated/);
});

test('a matching authenticated domain passes, case- and space-insensitively', () => {
  assert.deepEqual(checkSender('receipts@example.com', trusted, { authenticated: ' Example.COM ' }), { ok: true });
});

test('a parent or child domain is not a match', () => {
  assert.equal(checkSender('receipts@example.com', trusted, { authenticated: 'com' }).ok, false);
  assert.equal(checkSender('receipts@example.com', trusted, { authenticated: 'mail.example.com' }).ok, false);
});

test('an empty trusted list means forwarding is off', () => {
  const result = checkSender('receipts@example.com', []);
  assert.equal(result.ok, false);
  assert.match(result.reason, /forwarding is off/);
});
