// Claude Code launcher: `claude -p` headless, built plugin loaded with --plugin-dir. Only this file
// and projectClaude (../trajectory.mjs) know about Claude. Contract: see evals/README.md.
//
// Unattended flags: --permission-mode dontAsk with an explicit --allowedTools list (shell, file
// read/write/edit, search, skills); --strict-mcp-config and --setting-sources project keep MCP and
// user settings out. Isolation is the per-rep plugin copy and sandbox env; the user's real config is
// never written.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { projectClaude } from '../trajectory.mjs';
import { collectProcess } from './process.mjs';

export const name = 'claude';
export const launcherVersion = 2;
export const project = projectClaude;

export function detect() {
  try {
    return { binary: 'claude', version: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim() };
  } catch {
    throw new Error('claude is not installed');
  }
}

// pluginDir: the built plugin; copied into workdir so a rep cannot touch the repo copy.
export function prepare({ pluginDir, workdir, env }) {
  const plugin = path.join(workdir, 'plugin');
  fs.cpSync(pluginDir, plugin, { recursive: true });
  const skillsDir = path.join(plugin, 'skills');
  const runTurn = ({ prompt, session, resume, model, timeoutMs }) => {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--plugin-dir', plugin];
    args.push('--strict-mcp-config', '--setting-sources', 'project', '--permission-mode', 'dontAsk');
    args.push('--allowedTools', 'Bash Read Write Edit Glob Grep Skill');
    args.push(...(resume ? ['--resume', session] : ['--session-id', session]), ...(model ? ['--model', model] : []));
    return collectProcess(spawn('claude', args, { cwd: workdir, env, stdio: ['ignore', 'pipe', 'pipe'] }), { timeoutMs, ext: 'jsonl' });
  };
  return { skillsDir, env, runTurn };
}
