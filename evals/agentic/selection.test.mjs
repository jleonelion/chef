import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectRows } from './selection.mjs';

const rows = [
  { id: 'gated', gate: true },
  { id: 'candidate', candidate: true },
  { id: 'ordinary', gate: false },
];

test('candidate and gated selectors cover separate rows', () => {
  assert.deepEqual(selectRows(rows, { candidates: true }).map((row) => row.id), ['candidate']);
  assert.deepEqual(selectRows(rows, { gatesOnly: true }).map((row) => row.id), ['gated']);
});

test('candidate and gated selectors combine as a union', () => {
  assert.deepEqual(
    selectRows(rows, { candidates: true, gatesOnly: true }).map((row) => row.id),
    ['gated', 'candidate'],
  );
});
