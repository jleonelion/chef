#!/usr/bin/env node
// Lints the eval datasets (tier1 cases, agentic rows) like code: JSON Schema (unknown keys and typo'd
// assertion checks fail), kebab-case unique ids, and skill names that exist in src/skills.
//   node evals/lint-datasets.mjs
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const repo = path.resolve(import.meta.dirname, '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(repo, ...parts), 'utf8'));

function compile() {
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addSchema(readJson('schemas', 'evals', 'assertion.v1.json'));
  return {
    tier1: ajv.compile(readJson('schemas', 'evals', 'tier1-case.v1.json')),
    agentic: ajv.compile(readJson('schemas', 'evals', 'agentic-row.v1.json')),
  };
}

const schemaErrors = (label, validate, row) =>
  validate(row) ? [] : validate.errors.map((e) => `${label}: ${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);

// updateInstall cases address skills by their custom-install dir name (chef_setup).
const commandSkills = (steps) => (steps ?? []).flatMap((step) => (step.command ?? []).flatMap((arg) => [...String(arg).matchAll(/\{skills\}\/([^/]+)/g)].map((m) => m[1].replaceAll('_', '-'))));

function referencedSkills(suite, row) {
  if (suite === 'agentic') return [...(row.skills ?? []), ...(row.forbidSkills ?? []), ...commandSkills(row.setup), ...commandSkills(row.after)];
  return commandSkills([row, ...(row.steps ?? [])]);
}

// suites: {tier1: cases, agentic: rows}; skillNames: names found in src/skills.
export function lintDatasets({ suites, skillNames }) {
  const validators = compile();
  const errors = [];
  for (const [suite, rows] of Object.entries(suites)) {
    if (!Array.isArray(rows)) {
      errors.push(`${suite}: dataset must be an array`);
      continue;
    }
    const seen = new Set();
    rows.forEach((row, index) => {
      const label = `${suite} ${row?.id ?? `#${index}`}`;
      errors.push(...schemaErrors(label, validators[suite], row));
      if (seen.has(row?.id)) errors.push(`${label}: duplicate id`);
      seen.add(row?.id);
      for (const skill of new Set(referencedSkills(suite, row ?? {}))) {
        if (!skillNames.has(skill)) errors.push(`${label}: unknown skill ${skill}`);
      }
    });
  }
  return errors;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const suites = { tier1: readJson('evals', 'tier1', 'cases.json'), agentic: readJson('evals', 'agentic', 'rows.json') };
  const skillNames = new Set(fs.readdirSync(path.join(repo, 'src', 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
  const errors = lintDatasets({ suites, skillNames });
  for (const e of errors) console.error(`error: ${e}`);
  if (errors.length) process.exit(1);
  console.log(`eval dataset lint passed: ${suites.tier1.length} tier1 case(s), ${suites.agentic.length} agentic row(s)`);
}
