#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { initDataRoot } from './lib/init-data-root.mjs';

const { values, positionals } = parseArgs({
  options: { 'data-root': { type: 'string' } },
  allowPositionals: true,
});
const mode = positionals[0] ?? 'init';

if (mode !== 'init') {
  console.error(`Unknown mode "${mode}". Supported: init`);
  process.exit(64);
}

const result = initDataRoot(resolveDataRoot({ flag: values['data-root'] }));
console.log(JSON.stringify(result));
if (result.status === 'refused') process.exitCode = 2;
