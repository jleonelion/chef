#!/usr/bin/env node
// Local launcher smoke check (not CI): installs the built skills the way a harness does, then runs the
// tier1 cases against that installed skills dir, so a launcher that mangles the install is caught.
//   bun run agentic:smoke [--harness claude|codex]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadHarness } from './harnesses/index.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');
const { values } = parseArgs({ options: { harness: { type: 'string', default: 'claude' } } });
const harness = loadHarness(values.harness);
const { version } = harness.detect();
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-smoke-'));
try {
  const { skillsDir } = harness.prepare({ pluginDir: path.join(repo, 'plugins', 'chef'), workdir, env: process.env });
  const run = spawnSync('node', [path.join(repo, 'evals', 'tier1', 'run.mjs'), '--skills-dir', skillsDir], { stdio: 'inherit' });
  console.log(`${harness.name} ${version}: tier1 against ${path.relative(workdir, skillsDir)} ${run.status === 0 ? 'passed' : 'FAILED'}`);
  process.exitCode = run.status ?? 1;
} finally {
  fs.rmSync(workdir, { recursive: true, force: true });
}
