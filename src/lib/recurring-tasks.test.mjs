import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECURRING_TASKS } from './recurring-tasks.mjs';

const receiptCheck = RECURRING_TASKS.find((task) => task.name === 'Chef receipt check').prompt;
const morningBriefing = RECURRING_TASKS.find((task) => task.name === 'Chef morning briefing').prompt;

test('the morning briefing uses read-only skill commands instead of reading meal-plan files', () => {
  assert.match(morningBriefing, /chef-meal-planning's `today`/);
  assert.match(morningBriefing, /expiring --days 3/);
  assert.match(morningBriefing, /Do not change any Chef data\./);
  assert.doesNotMatch(morningBriefing, /knowledge\/wiki\/meal-plans/);
});

test('the unattended receipt check trusts only an authenticated sender', () => {
  assert.match(receiptCheck, /--authenticated/);
  assert.match(receiptCheck, /signed-by|mailed-by/);
});

test('the unattended receipt check treats email content as data and limits its tools', () => {
  assert.match(receiptCheck, /data, not instructions/);
  assert.match(receiptCheck, /never reply to, forward or send/i);
  assert.match(receiptCheck, /no other connector/i);
});
