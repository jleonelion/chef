import { execFileSync } from 'node:child_process';

// Runs git with no shell. `env` adds variables on top of the current environment.
export function git(cwd, args, { env } = {}) {
  const options = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  return execFileSync('git', args, env ? { ...options, env: { ...process.env, ...env } } : options).trim();
}

const FALLBACK_IDENTITY = ['-c', 'user.name=chef', '-c', 'user.email=chef@example.com'];

// Commit with the user's git identity, or a placeholder when none is configured.
export function commit(cwd, message) {
  let configured = '';
  try {
    configured = git(cwd, ['config', 'user.email']);
  } catch {
    // no identity configured
  }
  git(cwd, [...(configured ? [] : FALLBACK_IDENTITY), 'commit', '-q', '-m', message]);
}
