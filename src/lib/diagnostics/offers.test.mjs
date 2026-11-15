import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { claimOffer, clearDeclines, declineOffer } from './offers.mjs';

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-offers-'));
const at = (iso) => new Date(iso);

const INVENTORY = { skill: 'chef-food-inventory', code: 'unclassified' };
const PLANNING = { skill: 'chef-meal-planning', code: 'unclassified' };

test('an offer is claimed at most once per skill and error code per hour', () => {
  const root = tmpRoot();
  assert.equal(claimOffer(root, INVENTORY, { now: at('2026-11-15T10:00:00Z') }), true);
  assert.equal(claimOffer(root, INVENTORY, { now: at('2026-11-15T10:59:59Z') }), false);
  assert.equal(claimOffer(root, PLANNING, { now: at('2026-11-15T10:30:00Z') }), true);
  assert.equal(claimOffer(root, INVENTORY, { now: at('2026-11-15T11:00:01Z') }), true);
});

test('a declined skill and code is not offered again until declines are cleared; other skills still are', () => {
  const root = tmpRoot();
  declineOffer(root, INVENTORY, { now: at('2026-11-15T10:00:00Z') });
  assert.equal(claimOffer(root, INVENTORY, { now: at('2026-11-16T10:00:00Z') }), false);
  assert.equal(claimOffer(root, PLANNING, { now: at('2026-11-16T10:00:00Z') }), true);
  clearDeclines(root);
  assert.equal(claimOffer(root, INVENTORY, { now: at('2026-11-16T10:00:00Z') }), true);
});

test('an unreadable offers file is treated as empty', () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, 'diagnostics'));
  fs.writeFileSync(path.join(root, 'diagnostics', 'offers.json'), 'nope');
  assert.equal(claimOffer(root, INVENTORY, { now: at('2026-11-15T10:00:00Z') }), true);
});
