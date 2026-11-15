import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { migrateSettings, settingsMigrationPlan } from './settings-migrations.mjs';
import { readSettings } from './settings.mjs';

function root(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-settings-migrate-'));
  if (content !== undefined) fs.writeFileSync(path.join(dir, 'settings.json'), content);
  return dir;
}

const migrations = {
  0: ({ old_units, removed_key: _, ...stored }) => ({ ...stored, settings_version: 1, units: old_units }),
};

test('previews settings renames and removals without changing the file', () => {
  const dir = root('{"settings_version":0,"old_units":"metric","removed_key":true}\n');
  assert.deepEqual(settingsMigrationPlan(dir, { migrations, target: 1 }), { from: 0, to: 1, applied: [0] });
  assert.equal(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'), '{"settings_version":0,"old_units":"metric","removed_key":true}\n');
});

test('applies confirmed settings renames and removals while preserving unrelated keys', () => {
  const dir = root('{"settings_version":0,"old_units":"metric","removed_key":true,"future_key":7}\n');
  migrateSettings(dir, { migrations, target: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))), {
    settings_version: 1,
    future_key: 7,
    units: 'metric',
  });
});

test('settings 1 -> 2 turns the invocation trace on and keeps every other key', () => {
  const dir = root('{"settings_version":1,"units":"metric","future_key":7}\n');
  assert.deepEqual(migrateSettings(dir), { from: 1, to: 2, applied: [1] });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))), {
    settings_version: 2,
    units: 'metric',
    future_key: 7,
    diagnostics: { trace: 'on' },
  });
});

test('a v1 file from before convert_recipe_units reads it as off', () => {
  const dir = root('{"settings_version":1,"units":"metric"}\n');
  assert.equal(readSettings(dir).settings.convert_recipe_units, false);
});

test('missing settings need no migration and are not created', () => {
  const dir = root();
  assert.deepEqual(migrateSettings(dir), { from: 2, to: 2, applied: [] });
  assert.equal(fs.existsSync(path.join(dir, 'settings.json')), false);
});
