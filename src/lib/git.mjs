import { execFileSync } from 'node:child_process';

export function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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
