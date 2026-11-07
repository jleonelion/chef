#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { planWeek } from './lib/plan.mjs';

const { values, positionals } = parseArgs({
  options: {
    'data-root': { type: 'string' },
    'week-start': { type: 'string' },
  },
  allowPositionals: true,
});

const root = resolveDataRoot({ flag: values['data-root'] });
const mode = positionals[0];
let result;
if (mode !== 'plan') result = { status: 'invalid-input', data_root: root, problems: ['supported command: plan'] };
else if (!/^\d{4}-\d{2}-\d{2}$/.test(values['week-start'] ?? '') || Number.isNaN(Date.parse(`${values['week-start']}T00:00:00Z`))) {
  result = { status: 'invalid-input', data_root: root, problems: ['--week-start must be YYYY-MM-DD'] };
} else result = planWeek(root, { weekStart: values['week-start'] });

console.log(JSON.stringify(result));
if (['invalid-input', 'refused', 'no-plan'].includes(result.status)) process.exitCode = 2;
