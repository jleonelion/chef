#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { chefCapture } from '../../../lib/diagnostics/capture.mjs';
import { renderBatchPrep } from './lib/render.mjs';

const { values, positionals } = parseArgs({
  options: {
    'data-root': { type: 'string' },
    'week-start': { type: 'string' },
  },
  allowPositionals: true,
});

const root = resolveDataRoot({ flag: values['data-root'] });
const weekStart = values['week-start'];
function render() {
  if (positionals[0] !== 'render') return { status: 'invalid-input', data_root: root, problems: ['supported command: render'] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart ?? '') || Number.isNaN(Date.parse(`${weekStart}T00:00:00Z`))) {
    return { status: 'invalid-input', data_root: root, problems: ['--week-start must be YYYY-MM-DD'] };
  }
  return renderBatchPrep(root, weekStart);
}

const capture = { root, skill: 'chef-batch-prep-planning', script: 'batch-prep', operation: positionals[0], failures: { 'not-found': 'no-plan', unreadable: 'store-unreadable' } };
const result = await chefCapture(capture, render);

console.log(JSON.stringify(result));
if (['invalid-input', 'refused', 'not-found', 'unreadable'].includes(result.status)) process.exitCode = 2;
