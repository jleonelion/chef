#!/usr/bin/env node
// Lints the eval datasets (tier1 cases, agentic rows) like code: JSON Schema (unknown keys and typo'd
// assertion checks fail), <skill>-<scenario> unique ids, and skill names that exist in src/skills.
//   node evals/lint-datasets.mjs
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadCases } from './lib/load-cases.mjs';

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

// Skills a row is evaluating: agentic `skills` are the ones expected to fire; tier1 runs the skills its commands name.
const evaluatedSkills = (suite, row) => (suite === 'agentic' ? (row.skills ?? []) : commandSkills([row, ...(row.steps ?? [])]));

function referencedSkills(suite, row) {
  if (suite === 'agentic') return [...(row.skills ?? []), ...(row.forbidSkills ?? []), ...commandSkills(row.setup), ...commandSkills(row.after)];
  return evaluatedSkills(suite, row);
}

// Input files a row points at (seed `seedFile`, agentic `turnFile`); each must exist.
const inputFiles = (row) => [...(row.seed ?? []).map((file) => file.seedFile), ...(row.turns ?? []).map((turn) => turn?.turnFile)].filter(Boolean);

// suites: {tier1: cases, agentic: rows}; skillNames: names found in src/skills; exists: repo-relative path check.
export function lintDatasets({ suites, skillNames, exists = () => true }) {
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
      for (const input of inputFiles(row ?? {})) {
        if (!exists(input)) errors.push(`${label}: input file not found: ${input}`);
      }
      if (suite === 'agentic' && JSON.stringify(row).includes('{today}')) errors.push(`${label}: {today} makes the row depend on the wall-clock date; use a fixed date`);
      const evaluated = evaluatedSkills(suite, row ?? {});
      if (typeof row?.id === 'string' && evaluated.length && !evaluated.some((skill) => row.id.startsWith(`${skill}-`))) {
        errors.push(`${label}: id must start with an evaluated skill (${[...new Set(evaluated)].join(', ')}) as <skill>-<scenario>`);
      }
      for (const skill of new Set(referencedSkills(suite, row ?? {}))) {
        if (!skillNames.has(skill)) errors.push(`${label}: unknown skill ${skill}`);
      }
    });
  }
  return errors;
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  let suites;
  try {
    suites = { tier1: loadCases(path.join(repo, 'evals', 'tier1', 'cases')), agentic: loadCases(path.join(repo, 'evals', 'agentic', 'rows.json')) };
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
  const skillNames = new Set(fs.readdirSync(path.join(repo, 'src', 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
  const errors = lintDatasets({ suites, skillNames, exists: (p) => fs.existsSync(path.join(repo, p)) });
  for (const e of errors) console.error(`error: ${e}`);
  if (errors.length) process.exit(1);
  console.log(`eval dataset lint passed: ${suites.tier1.length} tier1 case(s), ${suites.agentic.length} agentic row(s)`);
}
