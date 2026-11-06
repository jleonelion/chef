#!/usr/bin/env node
// Bundle smoke: copy the built skills to a temp dir outside the repo and run tier1 against
// that copy, proving each bundled script runs with no access to src/ or the repo layout.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-bundle-smoke-'));
const skills = path.join(tmp, 'skills');
try {
  fs.cpSync(path.join(repo, 'plugins', 'chef', 'skills'), skills, { recursive: true });
  const run = spawnSync(process.execPath, [path.join(repo, 'evals', 'tier1', 'run.mjs'), '--skills-dir', skills], { stdio: 'inherit' });
  process.exitCode = run.status ?? 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
