#!/usr/bin/env node
// chef-setup entry point. Modes: init (create the data root), settings (show), set (change).
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { readSchemaVersion } from '../../../lib/schema.mjs';
import { readSettings } from '../../../lib/settings.mjs';
import { initDataRoot } from './lib/init-data-root.mjs';
import { changesFromFlags, SETTING_FLAGS } from './lib/settings-args.mjs';
import { writeSettings } from './lib/write-settings.mjs';

const { values, positionals } = parseArgs({
  options: { 'data-root': { type: 'string' }, rewrite: { type: 'boolean' }, ...SETTING_FLAGS },
  allowPositionals: true,
});

function set(root) {
  const changes = changesFromFlags(values);
  if (Object.keys(changes).length === 0) return { status: 'invalid-input', data_root: root, problems: ['no settings given'] };
  return writeSettings(root, changes, { rewrite: values.rewrite ?? false });
}

function show(root) {
  if (readSchemaVersion(root) === null) return { status: 'refused', data_root: root, reason: 'not a Chef data root; run chef-setup init first' };
  return { data_root: root, ...readSettings(root) };
}

const MODES = {
  init: (root) => initDataRoot(root),
  settings: show,
  set,
};

const mode = positionals[0] ?? 'init';
if (!Object.hasOwn(MODES, mode)) {
  console.error(`Unknown mode "${mode}". Supported: ${Object.keys(MODES).join(', ')}`);
  process.exit(64);
}

const result = MODES[mode](resolveDataRoot({ flag: values['data-root'] }));
console.log(JSON.stringify(result));
if (result.status === 'refused' || result.status === 'invalid-input') process.exitCode = 2;
