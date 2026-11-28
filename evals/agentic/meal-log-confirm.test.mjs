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
    'Here\'s what I\'d log for **January 20, 2026**:\n\n| Meal | Food |\n|---|---|\n| Lunch | Lemon Garlic Pasta | 1 |\n\nThe Chef meal-logging skill requires confirmation before saving. **Reply "yes" to confirm both entries and that dinner wasn\'t cooked at home**, or tell me what to change.',
    'Say yes and I will save it.',
    'Tell me if you want me to save this.',
    'Let me know if you would like me to log it.',
    'Confirm both entries and I\'ll record them.',
    'Draft ready. Reply OK to proceed.',
  ]) assert.match(reply, pattern, reply);
  for (const reply of [
    'Logged 1 serving of Chickpea Spinach Stew for lunch.',
    'I logged it. Anything else?',
    'Done. Saved the entry to your meal log.',
    'Which recipe did you cook?',
    'Confirmed and logged both entries.',
    'I replied to your earlier note and saved the entry.',
  ]) assert.doesNotMatch(reply, pattern, reply);
});
