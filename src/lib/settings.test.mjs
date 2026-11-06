import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { defaultSettings, readSettings, unitsForLocale, validateSettings } from './settings.mjs';

const root = (content) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-settings-'));
  if (content !== undefined) fs.writeFileSync(path.join(dir, 'settings.json'), content);
  return dir;
};
const US = { locale: 'en_US.UTF-8' };

test('units default from the locale region', () => {
  assert.equal(unitsForLocale('en_US.UTF-8'), 'us');
  assert.equal(unitsForLocale('en-US'), 'us');
  assert.equal(unitsForLocale('en_GB.UTF-8'), 'metric');
  assert.equal(unitsForLocale('fr-FR'), 'metric');
  assert.equal(unitsForLocale(''), 'metric');
});

test('defaults cover every v1 key', () => {
  assert.deepEqual(defaultSettings(US), {
    household_recipients: [],
    trusted_receipt_senders: [],
    units: 'us',
    calendar: null,
  });
});

test('missing file means all defaults and no warning', () => {
  const result = readSettings(root(), US);
  assert.equal(result.status, 'missing');
  assert.deepEqual(result.settings, defaultSettings(US));
  assert.equal(result.warning, undefined);
});

test('stored values override defaults; unknown keys are kept in stored', () => {
  const stored = { settings_version: 1, units: 'metric', household_recipients: ['a@example.com'], future_key: 7 };
  const result = readSettings(root(JSON.stringify(stored)), US);
  assert.equal(result.status, 'ok');
  assert.equal(result.settings.units, 'metric');
  assert.deepEqual(result.settings.household_recipients, ['a@example.com']);
  assert.equal(result.settings.future_key, undefined);
  assert.deepEqual(result.stored, stored);
});

test('invalid JSON means defaults plus one warning', () => {
  const result = readSettings(root('{not json'), US);
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.settings, defaultSettings(US));
  assert.match(result.warning, /chef-setup/);
  assert.equal(result.content, '{not json');
});

test('a bad value makes the whole file invalid', () => {
  const result = readSettings(root('{"settings_version":1,"units":"furlongs"}'), US);
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.settings, defaultSettings(US));
  assert.match(result.warning, /units/);
});

test('a newer settings_version means defaults plus one warning', () => {
  const result = readSettings(root('{"settings_version":2,"units":"metric"}'), US);
  assert.equal(result.status, 'unknown-version');
  assert.equal(result.settings.units, 'us');
  assert.match(result.warning, /version 2/);
});

test('validateSettings checks each v1 key', () => {
  assert.deepEqual(validateSettings({ household_recipients: ['a@example.com'], calendar: 'Family' }), []);
  assert.deepEqual(validateSettings({ household_recipients: ['nope'] }), ['household_recipients: "nope" is not an email address']);
  assert.deepEqual(validateSettings({ trusted_receipt_senders: 'a@example.com' }), ['trusted_receipt_senders: must be a list of email addresses']);
  assert.deepEqual(validateSettings({ calendar: '' }), ['calendar: must be a calendar name or null']);
  assert.deepEqual(validateSettings({ units: 'metric', other: 1 }), []);
});
