#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { invalidMode, isDirectExecution } from '../../../lib/cli-entry.mjs';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture } from '../../../lib/diagnostics/capture.mjs';
import { renderBatchPrep } from './lib/render.mjs';

const OPTIONS = { 'data-root': { type: 'string' }, 'week-start': { type: 'string' } };
const { values, positionals } = parseArgs({
  args: isDirectExecution(import.meta.url) ? process.argv.slice(2) : [],
  options: OPTIONS,
  allowPositionals: true,
});

const root = resolveDataRoot({ flag: values['data-root'] });
const weekStart = values['week-start'];
function render() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart ?? '') || Number.isNaN(Date.parse(`${weekStart}T00:00:00Z`))) {
    return { status: 'invalid-input', data_root: root, problems: ['--week-start must be YYYY-MM-DD'] };
  }
  return renderBatchPrep(root, weekStart);
}

export const SCRIPT_CONTRACT = Object.freeze({
  modes: ['render'],
  flags: Object.keys(OPTIONS),
  statuses: { ok: ['rendered'], errors: ['invalid-input', 'refused', 'not-found', 'unreadable'] },
});

if (isDirectExecution(import.meta.url)) {
  const mode = positionals[0];
  const capture = { root, skill: 'chef-batch-prep-planning', script: 'batch-prep', operation: mode, failures: { 'not-found': 'no-plan', unreadable: 'store-unreadable' } };
  const result = SCRIPT_CONTRACT.modes.includes(mode) ? await chefCapture(capture, render) : invalidMode(mode, SCRIPT_CONTRACT.modes, root);
  console.log(JSON.stringify(result));
  if (SCRIPT_CONTRACT.statuses.errors.includes(result.status)) process.exitCode = 2;
}
