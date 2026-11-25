// Codex launcher: `codex exec --json`, built skills installed under a per-rep .agents/skills.
// Contract: see evals/README.md.
//
// Isolation: CODEX_HOME and HOME both point into the rep's workdir, --ignore-user-config and
// --ignore-rules skip the user's config and execpolicy. Only auth.json is copied in (never written
// back); without a login the launcher fails closed.
// Unattended: `exec` never prompts; -c sandbox_mode="workspace-write" confines writes to the
// workdir (the data root lives there). Set CHEF_EVAL_CODEX_UNSANDBOXED=1 only inside an already
// sandboxed environment where Codex's own sandbox cannot start; it adds
// --dangerously-bypass-approvals-and-sandbox.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectCodex } from '../trajectory.mjs';
import { collectProcess } from './process.mjs';

export const name = 'codex';
export const launcherVersion = 4;
export const project = projectCodex;

export function detect() {
  try {
    return { binary: 'codex', version: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim() };
  } catch {
    throw new Error('codex is not installed');
  }
}

export function prepare({ pluginDir, workdir, env }) {
  const auth = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'auth.json');
  if (!fs.existsSync(auth)) throw new Error('codex is not logged in (no auth.json); run `codex login`');
  const codexHome = path.join(workdir, 'codex-home');
  // Keep Chef separate from the system skills Codex creates under CODEX_HOME/skills.
  const skillsDir = path.join(workdir, '.agents', 'skills');
  fs.mkdirSync(path.join(workdir, 'home'), { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  fs.copyFileSync(auth, path.join(codexHome, 'auth.json'));
  fs.cpSync(path.join(pluginDir, 'skills'), skillsDir, { recursive: true });
  const rep = { ...env, CODEX_HOME: codexHome, HOME: path.join(workdir, 'home') };
  let thread = null;
  const runTurn = ({ prompt, resume, model, timeoutMs }) => {
    const flags = ['--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules'];
    flags.push('-c', 'sandbox_mode="workspace-write"', ...(model ? ['-m', model] : []));
    if (process.env.CHEF_EVAL_CODEX_UNSANDBOXED) flags.push('--dangerously-bypass-approvals-and-sandbox');
    const args = resume && thread ? ['exec', 'resume', ...flags, thread, prompt] : ['exec', ...flags, prompt];
    const result = collectProcess(spawn('codex', args, { cwd: workdir, env: rep, stdio: ['ignore', 'pipe', 'pipe'] }), { timeoutMs, ext: 'jsonl' });
    return result.then((turn) => {
      thread ??= /"thread_id":"([^"]+)"/.exec(turn.transcript)?.[1] ?? null;
      return turn;
    });
  };
  return { skillsDir, env: rep, runTurn };
}
