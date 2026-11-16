#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture } from '../../../lib/diagnostics/capture.mjs';
import { parseOverrides } from '../../../lib/dietary-gate.mjs';
import { readRuleset } from '../../../lib/dietary-ruleset.mjs';
import { readSettings } from '../../../lib/settings.mjs';
import { buildList } from './lib/build.mjs';
import { deliverList } from './lib/deliver.mjs';

const { values, positionals } = parseArgs({
  options: { 'data-root': { type: 'string' }, 'week-start': { type: 'string' }, upcoming: { type: 'boolean' }, override: { type: 'string', multiple: true } },
  allowPositionals: true,
});

function run(root) {
  if (positionals[0] !== 'build') return { status: 'invalid-input', data_root: root, problems: ['supported command: build'] };
  const weekStart = values['week-start'];
  const { overrides, problems } = parseOverrides(values.override, readRuleset(root));
  if (weekStart !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) problems.push('--week-start must be YYYY-MM-DD');
  if (weekStart !== undefined && values.upcoming) problems.push('--upcoming and --week-start cannot be used together');
  if (problems.length) return { status: 'invalid-input', data_root: root, problems };
  const settings = readSettings(root);
  const list = buildList(root, { weekStart, upcoming: values.upcoming, overrides, units: settings.settings.units });
  if (list.status !== 'built') return list;
  const delivery = deliverList(root, list, { recipients: settings.settings.household_recipients });
  if (delivery.status === 'refused') return delivery;
  return { ...list, delivery, ...(settings.warning && { settings_warning: settings.warning }) };
}

const root = resolveDataRoot({ flag: values['data-root'] });
const capture = { root, skill: 'chef-shopping-lists', script: 'shopping-lists', operation: positionals[0], failures: { 'no-plan': 'no-plan' } };
const result = await chefCapture(capture, () => run(root));
console.log(JSON.stringify(result));
if (['invalid-input', 'refused', 'no-plan'].includes(result.status)) process.exitCode = 2;
