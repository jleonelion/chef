import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCase } from './assertions.mjs';

const doc = {
  one: ['x'],
  many: ['x', 'y'],
  items: [{ id: 'a', tags: ['t'] }, { id: 'b', tags: ['u', 'v'] }],
  nothing: null,
};

test('equals compares a one-element array exactly', () => {
  assertCase(doc, { path: '$.one', equals: ['x'] });
  assert.throws(() => assertCase(doc, { path: '$.one', equals: 'x' }));
});

test('equals compares multi-element arrays', () => {
  assertCase(doc, { path: '$.many', equals: ['x', 'y'] });
});

test('equals on a single fan-out match compares that match', () => {
  assertCase(doc, { path: "$.items.[?(@id=='a')].id", equals: 'a' });
  assertCase(doc, { path: "$.items.[?(@id=='a')].tags", equals: ['t'] });
});

test('equals on several fan-out matches compares the match list', () => {
  assertCase(doc, { path: '$.items[*].id', equals: ['a', 'b'] });
});

test('absent passes for a missing key and fails for a present one', () => {
  assertCase(doc, { path: '$.warning', absent: true });
  assert.throws(() => assertCase(doc, { path: '$.one', absent: true }), /\$\.one: expected absent/);
});

test('absent treats null as present', () => {
  assert.throws(() => assertCase(doc, { path: '$.nothing', absent: true }));
});

test('absent: false requires the key to be present', () => {
  assertCase(doc, { path: '$.nothing', absent: false });
  assert.throws(() => assertCase(doc, { path: '$.warning', absent: false }), /\$\.warning: expected present/);
});
