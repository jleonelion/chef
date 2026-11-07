#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
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
let result;
if (positionals[0] !== 'render') result = { status: 'invalid-input', data_root: root, problems: ['supported command: render'] };
else if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart ?? '') || Number.isNaN(Date.parse(`${weekStart}T00:00:00Z`))) {
  result = { status: 'invalid-input', data_root: root, problems: ['--week-start must be YYYY-MM-DD'] };
} else result = await renderBatchPrep(root, weekStart);

console.log(JSON.stringify(result));
if (['invalid-input', 'refused', 'not-found'].includes(result.status)) process.exitCode = 2;
