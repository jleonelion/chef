import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkResponse } from './report.mjs';

const rows = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rows.json'), 'utf8'));
const active = rows.find(({ id }) => id === 'chef-health-goals-check-in-goal-set-reports-targets');
const dormant = rows.find(({ id }) => id === 'chef-health-goals-check-in-goal-unset-stays-dormant');

test('health-goal check-in accepts grouped sodium with the stored goal and both bounds', () => {
  for (const sodium of ['2300', '2,300']) {
    for (const targets of [
      `Sodium: ${sodium} mg or less; protein: 90 g or more.`,
      `Sodium: at most ${sodium} mg; protein: at least 90 g.`,
      `Sodium: maximum ${sodium} milligrams; protein: minimum 90 grams.`,
      `**Sodium:** \u2264 ${sodium} mg/day\n**Protein:** \u2265 90 g/day`,
      `Sodium: ${sodium} mg/day or less; protein: 90 g per day or more.`,
      `At most ${sodium} mg sodium and at least 90 g protein.`,
    ]) {
      checkResponse(`Your goal is Lower sodium. Daily targets:\n${targets}`, active.responses[0]);
    }
  }
});

test('health-goal check-in rejects missing, incorrect or unassociated goal targets', () => {
  const valid = 'Goal: Lower sodium. Sodium: at most 2300 mg. Protein: at least 90 g.';
  checkResponse(valid, active.responses[0]);
  for (const [name, response] of [
    ['missing goal', valid.replace('Goal: Lower sodium. ', '')],
    ['wrong goal', valid.replace('Goal: Lower sodium', 'Goal: Gain weight')],
    ['missing sodium', 'Goal: Lower sodium. Protein: at least 90 g. Reference number: 2300.'],
    ['missing protein', valid.replace(' Protein: at least 90 g.', '')],
    ['wrong sodium', valid.replace('2300 mg', '2400 mg') + ' Reference number: 2300.'],
    ['wrong protein', valid.replace('90 g', '95 g')],
    ['reversed sodium', valid.replace('at most', 'at least')],
    ['reversed protein', valid.replace('at least', 'at most')],
    ['unbounded sodium', valid.replace('at most ', '')],
    ['unbounded protein', valid.replace('at least ', '')],
    ['wrong sodium unit', valid.replace('2300 mg', '2300 g')],
    ['wrong protein unit', valid.replace('90 g', '90 mg')],
    ['missing sodium unit', valid.replace('2300 mg', '2300')],
    ['missing protein unit', valid.replace('90 g', '90')],
    ['unrelated numbers', 'Goal: Lower sodium. Sodium and protein have no targets. Reference: at most 2300 mg and at least 90 g.'],
    ['swapped nutrients', 'Goal: Lower sodium. Protein: at most 2300 mg. Sodium: at least 90 g.'],
    ['numeric suffix', valid.replace('2300 mg', '12300 mg')],
    ['protein numeric prefix', valid.replace('90 g', '190 g')],
    ['different amount', valid.replace('2300 mg', '2300.5 mg')],
    ['malformed grouping', valid.replace('2300 mg', '23,00 mg')],
    ['negative sodium', valid.replace('2300 mg', '-2300 mg')],
    ['negative protein', valid.replace('90 g', '-90 g')],
    ['unsupported units', valid.replace('2300 mg', '2300 mcg')],
    ['body-weight units', valid.replace('90 g', '90 g/kg')],
    ['weekly instead of daily units', valid.replace('2300 mg', '2300 mg/week')],
  ]) {
    assert.throws(() => checkResponse(response, active.responses[0]), (error) => error.check === 'response', name);
  }
});

test('dormant health-goal check-in rejects invented targets regardless of grouping', () => {
  const noGoal = 'You have no health goal or daily targets saved.';
  checkResponse(noGoal, dormant.responses[0]);
  for (const target of [
    'Sodium: at most 2300 mg.',
    'Sodium: 2,300 mg or less.',
    'Protein: at least 90 g.',
    'Sodium: at most 1500 mg.',
    'Protein: at least 100 grams.',
    'At most 2,300 mg sodium.',
    'Calories: 2000 kcal.',
    'Fiber: 30 grams.',
  ]) {
    assert.throws(() => checkResponse(`${noGoal} ${target}`, dormant.responses[0]), (error) => error.check === 'response', target);
  }
  for (const reply of [
    "You don't have a Chef health goal or daily targets set.\n\nChef log: nothing written.",
    'You don\u2019t have a Chef health goal set.',
    'You do not have any goal declared.',
    'There is no goal or targets saved.',
    'I see no Chef health goal on file.',
    'Your goal is not currently set.',
    "You haven't set a health goal.",
  ]) checkResponse(reply, dormant.responses[0]);
  for (const response of ['', 'Everything looks fine.', 'Your goal is Lower sodium.', 'You have a goal set: Lower sodium.', "You don't have to worry; your goal is Lower sodium."]) {
    assert.throws(() => checkResponse(response, dormant.responses[0]), (error) => error.check === 'response', response);
  }
});
