import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { isDirectExecution } from './cli-entry.mjs';

test('direct execution compares canonical paths when argv uses a symlink', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-cli-entry-'));
  const real = path.join(root, 'real');
  const linked = path.join(root, 'linked');
  fs.mkdirSync(real);
  fs.symlinkSync(real, linked);
  const script = path.join(real, 'script.mjs');
  fs.writeFileSync(script, '');

  assert.equal(isDirectExecution(pathToFileURL(script).href, path.join(linked, 'script.mjs')), true);
});
