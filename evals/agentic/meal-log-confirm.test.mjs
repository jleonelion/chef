import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const rows = JSON.parse(fs.readFileSync(new URL('./rows.json', import.meta.url), 'utf8'));
const ids = [
  'chef-meal-logging-from-plan-no-plan',
  'chef-meal-logging-plan-leftovers-and-food',
  'chef-meal-logging-direct-entry-confirms-before-write',
];
const patterns = ids.map((id) => {
  const [raw] = rows.find((row) => row.id === id).responses.flat(2).filter(({ matches }) => matches?.includes('[Ww]ant me to')).map(({ matches }) => matches);
  assert.ok(raw, `${id} has a confirm-before-write pattern`);
  return new RegExp(raw);
});

test('meal logging rows share one confirm-before-write pattern', () => {
  assert.equal(new Set(patterns.map(String)).size, 1);
});

test('confirm-before-write accepts direct imperative questions and rejects logged claims', () => {
  const [pattern] = patterns;
  for (const reply of [
    'Log **1 serving of Chickpea Spinach Stew** for **lunch on January 21, 2026**, marked **cooked at home**? Confirming will also deduct the recipe ingredients for one serving from your Chef inventory.',
    'Here is the entry.\nSave this meal?',
    'Please confirm before I log it.',
    'Should I log this entry?',
  ]) assert.match(reply, pattern, reply);
  for (const reply of [
    'Logged 1 serving of Chickpea Spinach Stew for lunch.',
    'I logged it. Anything else?',
    'Done. Saved the entry to your meal log.',
    'Which recipe did you cook?',
  ]) assert.doesNotMatch(reply, pattern, reply);
});
