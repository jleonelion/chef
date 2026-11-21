import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeList } from './list-edits.mjs';

test('merge keeps order, adds once and reports duplicate or missing removals', () => {
  assert.deepEqual(
    mergeList(['a@example.com', 'b@example.com'], {
      add: ['b@example.com', 'c@example.com'],
      remove: ['missing@example.com', 'a@example.com'],
    }),
    {
      value: ['b@example.com', 'c@example.com'],
      added: ['c@example.com'],
      removed: ['a@example.com'],
      unchanged: ['b@example.com', 'missing@example.com'],
    },
  );
});

test('replace and edit flags conflict', () => {
  assert.equal(mergeList(['a'], { replace: ['b'], add: ['c'] }).status, 'invalid-input');
});
