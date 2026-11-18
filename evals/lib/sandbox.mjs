// Rep sandbox shared by the tier1 and agentic suites: a throwaway dir holding a copy of the
// fixture data root (committed to a fresh git repo, as a real data root is) plus the env contract.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// `seed` paths starting with ../ land beside the data root (inputs such as receipt transcripts)
// and are not committed.
export function writeSeed(dataRoot, files) {
  for (const file of files ?? []) {
    const abs = path.join(dataRoot, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content);
  }
}

export function commitAll(dir, { author, message, tag }) {
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', `user.name=${author}`, '-c', `user.email=${author}@example.com`, 'commit', '-q', '-m', message);
  if (tag) git('tag', tag);
  return git;
}

// `fixture: false` skips the data-root copy and commit (cases that build their own state in `seed`).
export function prepareSandbox({ prefix, id, fixture, author, seed, afterCommitSeed, useFixture = true }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-${id}-`));
  const dataRoot = path.join(tmp, 'data-root');
  if (useFixture) fs.cpSync(fixture, dataRoot, { recursive: true });
  writeSeed(dataRoot, seed);
  if (useFixture) commitAll(dataRoot, { author, message: 'fixture' });
  writeSeed(dataRoot, afterCommitSeed);
  return { tmp, dataRoot };
}

export function sandboxEnv(dataRoot, overrides) {
  return { ...process.env, ...overrides, CHEF_DATA_ROOT: dataRoot };
}
