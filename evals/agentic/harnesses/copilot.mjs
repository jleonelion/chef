// Copilot CLI launcher: `copilot -p --output-format json`, built plugin loaded with --plugin-dir.
// Contract: see evals/README.md.
//
// Isolation: COPILOT_HOME points at a per-rep dir, so the user's config, sessions, hooks and
// instructions are neither read nor written. Auth is a GitHub token passed as GH_TOKEN (taken from
// the environment or `gh auth token`, never written to disk); no token fails closed. User-level
// skill directories such as ~/.agents/skills stay visible to the CLI (same skill names, so checks
// are unaffected); custom instructions and built-in MCP servers are switched off.
// Unattended: -p never prompts; --allow-all-tools, --no-ask-user. The rep's data root lives under
// the cwd, so --allow-all-paths is not needed.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { projectCopilot } from '../trajectory.mjs';

export const name = 'copilot';
export const launcherVersion = 1;
export const project = projectCopilot;

export function detect() {
  try {
    const [version] = execFileSync('copilot', ['--version'], { encoding: 'utf8' }).split('\n');
    return { binary: 'copilot', version: version.trim() };
  } catch {
    throw new Error('copilot is not installed');
  }
}

function token(env) {
  const found = env.GH_TOKEN || env.GITHUB_TOKEN || env.COPILOT_GITHUB_TOKEN;
  if (found) return found;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('copilot is not authenticated: set GH_TOKEN or run `gh auth login`');
  }
}

export function prepare({ pluginDir, workdir, env }) {
  const plugin = path.join(workdir, 'plugin');
  fs.cpSync(pluginDir, plugin, { recursive: true });
  const copilotHome = path.join(workdir, 'copilot-home');
  fs.mkdirSync(copilotHome, { recursive: true });
  const rep = { ...env, COPILOT_HOME: copilotHome, GH_TOKEN: token(env) };
  const runTurn = ({ prompt, session, resume, model, timeoutMs }) => {
    const args = ['-p', prompt, '--output-format', 'json', '--allow-all-tools', '--no-ask-user', '--no-auto-update'];
    args.push('--disable-builtin-mcps', '--no-custom-instructions', '--plugin-dir', plugin);
    args.push(resume ? `--resume=${session}` : `--session-id=${session}`, ...(model ? ['--model', model] : []));
    return new Promise((resolve) => {
      const child = spawn('copilot', args, { cwd: workdir, env: rep, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.stderr.on('data', (chunk) => (err += chunk));
      const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
      child.on('close', () => {
        clearTimeout(timer);
        resolve({ out, err, ext: 'jsonl' });
      });
    });
  };
  return { skillsDir: path.join(plugin, 'skills'), env: rep, runTurn };
}
