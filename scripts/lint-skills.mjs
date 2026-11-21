#!/usr/bin/env node
// Skill-format lint over source and built skills. Exits 1 on any error.
// Missing v1 skills fail only in release mode: plugin version >= 1.0.0 or --release.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCases } from '../evals/lib/load-cases.mjs';
import { hasHomePath, isRelease, missingSkills, rosterErrors, skillErrors, tier1CoverageErrors, V1_SKILLS } from './lib/skill-format.mjs';
import { scriptContractErrors } from './lib/script-contract.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const roots = { src: path.join(repo, 'src', 'skills'), built: path.join(repo, 'plugins', 'chef', 'skills') };
const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const walk = (dir) => fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile());
const facts = JSON.parse(fs.readFileSync(path.join(repo, 'schemas', 'feedback', 'facts.v1.json'), 'utf8'));

const errors = [];
for (const [label, root] of Object.entries(roots)) {
  for (const name of list(root)) {
    const skillMd = path.join(root, name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) { errors.push(`${label}/${name}: SKILL.md missing`); continue; }
    errors.push(...skillErrors(name, fs.readFileSync(skillMd, 'utf8')).map((e) => `${label}/${e}`));
    for (const file of walk(path.join(root, name))) {
      if (hasHomePath(fs.readFileSync(file, 'utf8'))) errors.push(`${path.relative(repo, file)}: hardcoded home path`);
    }
  }
}
for (const [label, root] of Object.entries(roots)) {
  for (const name of list(root)) {
    const skillDir = path.join(root, name);
    const scriptsDir = path.join(skillDir, 'scripts');
    if (!fs.existsSync(scriptsDir)) continue;
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    const entries = fs.readdirSync(scriptsDir).filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs')).sort();
    for (const entry of entries) {
      const script = path.basename(entry, '.mjs');
      const module = await import(pathToFileURL(path.join(scriptsDir, entry)));
      if (!module.SCRIPT_CONTRACT) {
        errors.push(`${label}/${name}/scripts/${entry}: SCRIPT_CONTRACT export missing`);
        continue;
      }
      const registered = facts.scripts[`${name}/${script}`]?.facts.status?.values ?? [];
      errors.push(...scriptContractErrors(skillMd, module.SCRIPT_CONTRACT, registered).map((error) => `${label}/${name}/SKILL.md: ${error}`));
    }
  }
}
if (list(roots.src).join() !== list(roots.built).join()) errors.push('built skills do not match src/skills; run bun run build');

const { version } = JSON.parse(fs.readFileSync(path.join(repo, 'plugins', 'chef', '.claude-plugin', 'plugin.json'), 'utf8'));
const release = isRelease(version, process.argv.includes('--release'));
const names = [...new Set([...list(roots.src), ...list(roots.built)])];
errors.push(...rosterErrors(names, release));
const tier1Cases = loadCases(path.join(repo, 'evals', 'tier1', 'cases'));
errors.push(...tier1CoverageErrors(tier1Cases));
const missing = missingSkills(names);
console.log(`${V1_SKILLS.length - missing.length}/${V1_SKILLS.length} v1 skills present${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);

for (const e of errors) console.error(`error: ${e}`);
if (errors.length) process.exit(1);
console.log(`skill-format lint passed: ${list(roots.built).length} skill(s)`);
