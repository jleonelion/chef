import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertNoEvaluationEvidence } from './package-boundary.mjs';

test('the built plugin contains no archived result, transcript, or log', () => {
  const plugin = path.resolve(import.meta.dirname, '..', '..', 'plugins', 'chef');
  assertNoEvaluationEvidence(plugin);
});

test('the packaging guard rejects evaluation evidence', (t) => {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-package-boundary-'));
  t.after(() => fs.rmSync(plugin, { recursive: true, force: true }));
  fs.mkdirSync(path.join(plugin, 'archive'));
  fs.writeFileSync(path.join(plugin, 'archive', 'result.json'), '{}');
  assert.throws(() => assertNoEvaluationEvidence(plugin), /evaluation archive/);
});
