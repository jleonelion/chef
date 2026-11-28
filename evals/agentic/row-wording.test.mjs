import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const rows = JSON.parse(fs.readFileSync(new URL('./rows.json', import.meta.url), 'utf8'));
const checks = (id, turn = 0) => rows.find((row) => row.id === id).responses[turn];
const accepts = (id, reply, turn = 0) => {
  for (const { matches } of checks(id, turn).filter((check) => check.matches)) {
    if (!new RegExp(matches).test(reply)) return false;
  }
  return true;
};

test('plan-absent row accepts varied no-plan wording', () => {
  const id = 'chef-meal-logging-plan-absent-logs-nothing';
  const tail = ' What did you have for lunch, and how many servings?';
  for (const lead of [
    'There is no lunch planned for 2026-01-21.',
    'Nothing is scheduled for lunch on 2026-01-21.',
    'I could not find a plan for that lunch.',
    'Lunch on 2026-01-21 is not planned.',
  ]) assert.ok(accepts(id, `${lead}${tail}`), lead);
  assert.ok(!accepts(id, `Logged your lunch for 2026-01-21.${tail}`));
});

test('receipt-intake-off row accepts capitalization and disabled wording', () => {
  const id = 'chef-food-inventory-receipt-intake-off-refused';
  const [, intake] = checks(id);
  const pattern = new RegExp(intake.matches);
  for (const reply of ['receipt intake is off', 'Receipt intake is off.', 'Email receipt intake is disabled', 'receipt intake is **off**']) {
    assert.match(reply, pattern, reply);
  }
  assert.doesNotMatch('Receipt intake is on.', pattern);
});

test('logging rows accept dates without a year and table servings', () => {
  const id = 'chef-meal-logging-direct-entry-confirms-before-write';
  const reply = 'Entry for January 21: Chickpea Spinach Stew, lunch, Servings | 1, cooked at home. Reply yes to confirm.';
  assert.ok(accepts(id, reply));
});
