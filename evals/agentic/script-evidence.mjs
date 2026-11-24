import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { snapshot } from './script-pack.cjs';

export function observeScripts({ skillsDir, expectedSkillsDir, workdir, env }) {
  const baseline = snapshot(skillsDir);
  if (baseline.content !== snapshot(expectedSkillsDir).content) {
    throw new Error('installed-script provenance not established: installed pack differs from the evaluated bundle');
  }
  const directory = path.join(workdir, 'execution-evidence');
  fs.mkdirSync(directory);
  const preload = path.join(import.meta.dirname, 'observe-script.cjs');
  Object.assign(env, {
    CHEF_EVAL_EXECUTION_DIR: directory,
    CHEF_EVAL_SKILLS_DIR: skillsDir,
    NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --require ${JSON.stringify(preload)}`.trim(),
    BUN_OPTIONS: `${env.BUN_OPTIONS ?? ''} --preload=${pathToFileURL(preload).href}`.trim(),
  });
  let seen = new Set();
  function unchanged() {
    const after = snapshot(skillsDir);
    if (after.content !== baseline.content || after.identity !== baseline.identity) {
      throw new Error('installed-script provenance not established: installed pack was modified or replaced');
    }
  }
  return {
    beginTurn() {
      unchanged();
      seen = new Set(fs.readdirSync(directory));
    },
    collect(logFile) {
      const files = fs.readdirSync(directory).sort();
      const records = files.filter((file) => !seen.has(file)).map((file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
      seen = new Set(files);
      fs.writeFileSync(logFile, `${JSON.stringify(records, null, 2)}\n`);
      unchanged();
      if (records.some((record) => record.script && (record.pack?.content !== baseline.content || record.pack?.identity !== baseline.identity))) {
        throw new Error('installed-script provenance not established: installed pack was modified or replaced');
      }
      return records.filter((record) => record.script && !record.error && !record.nested && !record.syntaxOnly)
        .sort((a, b) => BigInt(a.startedAt) < BigInt(b.startedAt) ? -1 : 1)
        .map(({ script, args }) => ({ script, args }));
    },
  };
}
