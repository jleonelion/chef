#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { invalidMode, isDirectExecution } from '../../../lib/cli-entry.mjs';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture } from '../../../lib/diagnostics/capture.mjs';
import { parseOverrides } from '../../../lib/dietary-gate.mjs';
import { readRuleset } from '../../../lib/dietary-ruleset.mjs';
import { readSettings } from '../../../lib/settings.mjs';
import { buildList } from './lib/build.mjs';
import { deliverList } from './lib/deliver.mjs';

const OPTIONS = { 'data-root': { type: 'string' }, 'week-start': { type: 'string' }, upcoming: { type: 'boolean' }, override: { type: 'string', multiple: true } };
const { values, positionals } = parseArgs({
  args: isDirectExecution(import.meta.url) ? process.argv.slice(2) : [],
  options: OPTIONS,
  allowPositionals: true,
});

function run(root) {
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

export const SCRIPT_CONTRACT = Object.freeze({
  modes: ['build'],
  flags: Object.keys(OPTIONS),
  statuses: { ok: ['built'], errors: ['invalid-input', 'refused', 'no-plan'] },
});
const root = resolveDataRoot({ flag: values['data-root'] });
if (isDirectExecution(import.meta.url)) {
  const mode = positionals[0];
  const capture = { root, skill: 'chef-shopping-lists', script: 'shopping-lists', operation: mode, failures: { 'no-plan': 'no-plan' } };
  const result = SCRIPT_CONTRACT.modes.includes(mode) ? await chefCapture(capture, () => run(root)) : invalidMode(mode, SCRIPT_CONTRACT.modes, root);
  console.log(JSON.stringify(result));
  if (SCRIPT_CONTRACT.statuses.errors.includes(result.status)) process.exitCode = 2;
}
