import { execFileSync } from 'node:child_process';

// Runs git with no shell. `env` adds variables on top of the current environment.
export function git(cwd, args, { env } = {}) {
  const options = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  return execFileSync('git', args, env ? { ...options, env: { ...process.env, ...env } } : options).trim();
}
