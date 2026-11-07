#!/usr/bin/env node
// Migration regression: every released schema version keeps a frozen fixture data root in
// fixtures/schema-v<n>/. Each is copied to a temp dir, migrated to the current schema, and
// tier1 runs against the result. Frozen copies are never edited after they land.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrate } from '../src/lib/migrations.mjs';
import { SCHEMA_VERSION } from '../src/lib/schema.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const frozen = (version) => path.join(repo, 'fixtures', `schema-v${version}`);

function check(version) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `chef-migrate-v${version}-`));
  const root = path.join(tmp, 'data-root');
  try {
    fs.cpSync(frozen(version), root, { recursive: true });
    const { applied } = migrate(root);
    console.log(`schema v${version} -> v${SCHEMA_VERSION} (${applied.length} step(s))`);
    const run = spawnSync(process.execPath, [path.join(repo, 'evals', 'tier1', 'run.mjs'), '--fixture', root], { stdio: 'inherit' });
    return run.status === 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const versions = Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1);
const missing = versions.filter((version) => !fs.existsSync(frozen(version)));
if (missing.length) {
  console.error(`missing frozen fixture(s): ${missing.map((v) => `fixtures/schema-v${v}`).join(', ')}`);
  process.exit(1);
}
const failed = versions.filter((version) => !check(version));
if (failed.length) {
  console.error(`migration regression failed for schema v${failed.join(', v')}`);
  process.exit(1);
}
console.log(`Migration regression passed: ${versions.length} frozen schema version(s)`);
