// Smoke runner shared by chef-setup "verify install" and scripts/bundle-smoke.mjs. Each skill
// lists cases in smoke.json; every case runs one bundled script against a fresh temp copy of
// the fixture data root, with HOME pointed there too, so real user data is never touched.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SMOKE_FILE = 'smoke.json';
const isEntry = (name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs');

function parseStatus(stdout) {
  try {
    return JSON.parse(stdout).status;
  } catch {
    return undefined;
  }
}

function runCase(skillDir, testCase, fixture) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-smoke-'));
  const dataRoot = path.join(tmp, 'data-root');
  try {
    fs.cpSync(fixture, dataRoot, { recursive: true });
    const env = { ...process.env, CHEF_DATA_ROOT: dataRoot, HOME: tmp };
    const run = spawnSync(process.execPath, [path.join(skillDir, testCase.script), ...testCase.args], { cwd: skillDir, env, encoding: 'utf8', timeout: 30000 });
    const status = parseStatus(run.stdout);
    if (run.status !== testCase.expect.exit) return `exit ${run.status}, expected ${testCase.expect.exit}: ${(run.stderr || run.stdout).trim().slice(0, 300)}`;
    if (status !== testCase.expect.status) return `status "${status}", expected "${testCase.expect.status}"`;
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function uncovered(skillDir, cases) {
  const scripts = path.join(skillDir, 'scripts');
  if (!fs.existsSync(scripts)) return [];
  const covered = new Set(cases.map((c) => path.normalize(c.script)));
  return fs.readdirSync(scripts).filter(isEntry).sort().map((f) => path.join('scripts', f)).filter((f) => !covered.has(f));
}

function smokeSkill(skillsDir, skill, fixture) {
  const skillDir = path.join(skillsDir, skill);
  const file = path.join(skillDir, SMOKE_FILE);
  const cases = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const gaps = uncovered(skillDir, cases).map((script) => ({ skill, id: 'coverage', ok: false, detail: `no smoke case for ${script}` }));
  const results = cases.map((testCase) => {
    const problem = runCase(skillDir, testCase, fixture);
    return { skill, id: testCase.id, ok: problem === null, ...(problem && { detail: problem }) };
  });
  return [...gaps, ...results];
}

export function runSmoke({ skillsDir, fixture }) {
  const skills = fs.readdirSync(skillsDir).filter((name) => fs.statSync(path.join(skillsDir, name)).isDirectory()).sort();
  return skills.flatMap((skill) => smokeSkill(skillsDir, skill, fixture));
}
