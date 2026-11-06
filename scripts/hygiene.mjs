#!/usr/bin/env node
// Public-hygiene check over tracked + untracked (non-ignored) files and all commit metadata.
//   CHEF_HYGIENE_DENY="<regex per line>" node scripts/hygiene.mjs [--require-deny-list]
// The deny list lives only in the CHEF_HYGIENE_DENY Actions secret (and locally in your env).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { parseDenyList, scanText } from './lib/hygiene-rules.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const denyList = parseDenyList(process.env.CHEF_HYGIENE_DENY);

if (process.argv.includes('--require-deny-list') && denyList.length === 0) {
  console.error('error: CHEF_HYGIENE_DENY is empty. Fork PRs get no secrets; a maintainer must run hygiene on a branch.');
  process.exit(1);
}

const findings = [];
const files = git('ls-files', '-co', '--exclude-standard', '-z').split('\0').filter(Boolean);
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) continue;
  for (const f of scanText(buffer.toString('utf8'), denyList)) findings.push(`${file}:${f.line}: ${f.rule}`);
}
for (const sha of git('rev-list', '--all').split('\n').filter(Boolean)) {
  const meta = git('show', '-s', '--format=%an%n%ae%n%cn%n%ce%n%B', sha);
  for (const f of scanText(meta, denyList)) findings.push(`commit ${sha.slice(0, 12)}: ${f.rule}`);
}

for (const f of findings) console.error(`error: ${f}`);
if (findings.length) process.exit(1);
console.log(`hygiene passed: ${files.length} files, ${denyList.length} deny pattern(s)`);
