#!/usr/bin/env node
// Bundle smoke: copy the built skills to a temp dir outside the repo, run tier1 against that
// copy, then chef-setup "verify install" from it (every skill's smoke.json against the bundled
// fixture), proving each bundled script runs with no access to src/ or the repo layout.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-bundle-smoke-'));
const skills = path.join(tmp, 'skills');
try {
  fs.cpSync(path.join(repo, 'plugins', 'chef', 'skills'), skills, { recursive: true });
  const tier1 = spawnSync(process.execPath, [path.join(repo, 'evals', 'tier1', 'run.mjs'), '--skills-dir', skills], { stdio: 'inherit' });
  const dataRoot = path.join(tmp, 'data-root');
  fs.cpSync(path.join(repo, 'fixtures', 'data-root'), dataRoot, { recursive: true });
  const verify = spawnSync(process.execPath, [path.join(skills, 'chef-setup', 'scripts', 'setup.mjs'), 'verify'], {
    cwd: tmp,
    env: { ...process.env, CHEF_DATA_ROOT: dataRoot },
    encoding: 'utf8',
  });
  console.log(verify.stdout.trim());
  if (verify.status === 0) console.log('verify install passed from the bundle');
  process.exitCode = tier1.status === 0 && verify.status === 0 ? 0 : 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
