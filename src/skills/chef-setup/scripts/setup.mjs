#!/usr/bin/env node
// chef-setup entry point. Modes: init (create the data root), adopt (clone an existing one),
// settings (show), set (change), update (install a tagged release), verify (check the install),
// usda (check the USDA connection), safety (the one safety screen), dietary (show the dietary
// ruleset), set-dietary (change it).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveDataRoot } from '../../../lib/data-root.mjs';
import { dietaryNotes, readRuleset } from '../../../lib/dietary-ruleset.mjs';
import { usdaClient } from '../../../lib/fdc.mjs';
import { today } from '../../../lib/recipes.mjs';
import { SAFETY_SCREEN } from '../../../lib/safety-text.mjs';
import { readSchemaVersion } from '../../../lib/schema.mjs';
import { readSettings } from '../../../lib/settings.mjs';
import { adoptDataRoot } from './lib/adopt-data-root.mjs';
import { checkUsda } from './lib/check-usda.mjs';
import { initDataRoot } from './lib/init-data-root.mjs';
import { changesFromFlags, SETTING_FLAGS } from './lib/settings-args.mjs';
import { updateChef } from './lib/update-chef.mjs';
import { verifyInstall } from './lib/verify-install.mjs';
import { writeRuleset } from './lib/write-ruleset.mjs';
import { writeSettings } from './lib/write-settings.mjs';

// Installed layout: <skills>/chef-setup/scripts/setup.mjs, fixture in chef-setup/fixture/.
const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { values, positionals } = parseArgs({
  options: {
    'data-root': { type: 'string' },
    source: { type: 'string' },
    rewrite: { type: 'boolean' },
    confirm: { type: 'boolean' },
    ...SETTING_FLAGS,
    member: { type: 'string' },
    hard: { type: 'string' },
    avoid: { type: 'string' },
    none: { type: 'boolean' },
  },
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

function update(root) {
  try {
    return updateChef(root, {
      skillDir,
      fixture: path.join(skillDir, 'fixture', 'data-root'),
      confirm: values.confirm ?? false,
    });
  } catch (error) {
    return { status: 'refused', data_root: root, reason: error instanceof Error ? error.message : String(error) };
  }
}

const list = (raw) => raw?.split(',').map((item) => item.trim()).filter(Boolean);
const NOT_A_ROOT = { status: 'refused', reason: 'not a Chef data root; run chef-setup init first' };

function dietary(root) {
  if (readSchemaVersion(root) === null) return { ...NOT_A_ROOT, data_root: root };
  const ruleset = readRuleset(root);
  return { data_root: root, ...dietaryNotes(ruleset), members: ruleset.members };
}

function setDietary(root) {
  const change = { none: values.none, member: values.member, hard: list(values.hard), avoid: list(values.avoid) };
  return writeRuleset(root, change, { date: today(), rewrite: values.rewrite ?? false });
}

const MODES = {
  init: (root) => initDataRoot(root),
  adopt: (root) => adoptDataRoot(root, values.source),
  settings: show,
  set,
  update,
  verify: (root) => verifyInstall(root, { skillsDir: path.dirname(skillDir), fixture: path.join(skillDir, 'fixture', 'data-root') }),
  usda: () => checkUsda(usdaClient()),
  safety: () => ({ status: 'ok', screen: SAFETY_SCREEN }),
  dietary,
  'set-dietary': setDietary,
};

const mode = positionals[0] ?? 'init';
if (!Object.hasOwn(MODES, mode)) {
  console.error(`Unknown mode "${mode}". Supported: ${Object.keys(MODES).join(', ')}`);
  process.exit(64);
}

const result = await MODES[mode](resolveDataRoot({ flag: values['data-root'] }));
console.log(JSON.stringify(result));
if (result.status === 'refused' || result.status === 'invalid-input') process.exitCode = 2;
if (result.status === 'fail') process.exitCode = 1;
