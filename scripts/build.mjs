#!/usr/bin/env bun
// Builds src/skills/<skill> into self-contained plugins/chef/skills/<skill> folders:
// each top-level scripts/*.mjs is bundled to one Node file; SKILL.md, the skill's own references/
// and the shared src/references/ files are copied.
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dir, '..');
const srcSkills = path.join(repo, 'src', 'skills');
const outSkills = path.join(repo, 'plugins', 'chef', 'skills');
const sharedRefs = path.join(repo, 'src', 'references');

const isEntry = (name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs');

async function bundle(entry, outDir) {
  const result = await Bun.build({ entrypoints: [entry], outdir: outDir, target: 'node', format: 'esm', naming: '[name].mjs' });
  if (!result.success) throw new AggregateError(result.logs, `bundle failed: ${entry}`);
}

async function buildSkill(name) {
  const src = path.join(srcSkills, name);
  const out = path.join(outSkills, name);
  fs.cpSync(path.join(src, 'SKILL.md'), path.join(out, 'SKILL.md'));
  if (fs.existsSync(path.join(src, 'references'))) {
    fs.cpSync(path.join(src, 'references'), path.join(out, 'references'), { recursive: true });
  }
  fs.cpSync(sharedRefs, path.join(out, 'references'), { recursive: true });
  const scripts = path.join(src, 'scripts');
  if (!fs.existsSync(scripts)) return;
  for (const file of fs.readdirSync(scripts).filter(isEntry).sort()) {
    await bundle(path.join(scripts, file), path.join(out, 'scripts'));
  }
}

fs.rmSync(outSkills, { recursive: true, force: true });
for (const name of fs.readdirSync(srcSkills).sort()) await buildSkill(name);
console.log(`built ${fs.readdirSync(outSkills).length} skill(s) into ${path.relative(repo, outSkills)}`);
