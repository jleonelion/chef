#!/usr/bin/env node
// Skill-format lint over source and built skills. Exits 1 on any error.
import fs from 'node:fs';
import path from 'node:path';
import { hasHomePath, skillErrors } from './lib/skill-format.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const roots = { src: path.join(repo, 'src', 'skills'), built: path.join(repo, 'plugins', 'chef', 'skills') };
const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const walk = (dir) => fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile());

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
if (list(roots.src).join() !== list(roots.built).join()) errors.push('built skills do not match src/skills; run bun run build');

for (const e of errors) console.error(`error: ${e}`);
if (errors.length) process.exit(1);
console.log(`skill-format lint passed: ${list(roots.built).length} skill(s)`);
