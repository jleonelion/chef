import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { claimOffer, clearDeclines, declineOffer } from './offers.mjs';

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-offers-'));
const at = (iso) => new Date(iso);

test('an offer is taken at most once per error code per hour', () => {
  const root = tmpRoot();
  assert.equal(claimOffer(root, 'unclassified', { now: at('2026-11-15T10:00:00Z') }), true);
  assert.equal(claimOffer(root, 'unclassified', { now: at('2026-11-15T10:59:59Z') }), false);
  assert.equal(claimOffer(root, 'other-code', { now: at('2026-11-15T10:30:00Z') }), true);
  assert.equal(claimOffer(root, 'unclassified', { now: at('2026-11-15T11:00:01Z') }), true);
});

test('a declined code is never offered again until declines are cleared', () => {
  const root = tmpRoot();
  declineOffer(root, 'unclassified', { now: at('2026-11-15T10:00:00Z') });
  assert.equal(claimOffer(root, 'unclassified', { now: at('2026-11-16T10:00:00Z') }), false);
  clearDeclines(root);
  assert.equal(claimOffer(root, 'unclassified', { now: at('2026-11-16T10:00:00Z') }), true);
});

test('an unreadable offers file is treated as empty', () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, 'diagnostics'));
  fs.writeFileSync(path.join(root, 'diagnostics', 'offers.json'), 'nope');
  assert.equal(claimOffer(root, 'unclassified', { now: at('2026-11-15T10:00:00Z') }), true);
});
