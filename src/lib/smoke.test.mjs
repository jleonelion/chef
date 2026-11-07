import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runSmoke } from './smoke.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-smoke-'));
// A script that writes into its data root and reports a status taken from argv.
const SCRIPT = `import fs from 'node:fs';
fs.writeFileSync(process.env.CHEF_DATA_ROOT + '/touched', process.env.HOME);
console.log(JSON.stringify({ status: process.argv[2] }));
process.exitCode = Number(process.argv[3] ?? 0);
`;

function setup({ cases, extraScript = false } = {}) {
  const skills = tmp();
  const skill = path.join(skills, 'chef-demo');
  fs.mkdirSync(path.join(skill, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(skill, 'scripts', 'demo.mjs'), SCRIPT);
  if (extraScript) fs.writeFileSync(path.join(skill, 'scripts', 'other.mjs'), SCRIPT);
  if (cases) fs.writeFileSync(path.join(skill, 'smoke.json'), JSON.stringify(cases));
  const fixture = tmp();
  fs.writeFileSync(path.join(fixture, 'schema-version.json'), '{"schema_version":1}');
  return { skills, fixture };
}

const demo = (args, expect) => ({ id: 'demo', script: 'scripts/demo.mjs', args, expect });

test('runs each case against a throwaway copy of the fixture', () => {
  const { skills, fixture } = setup({ cases: [demo(['ok'], { exit: 0, status: 'ok' })] });
  const results = runSmoke({ skillsDir: skills, fixture });
  assert.deepEqual(results.map((r) => [r.skill, r.id, r.ok]), [['chef-demo', 'demo', true]]);
  assert.deepEqual(fs.readdirSync(fixture), ['schema-version.json']);
});

test('reports a wrong exit code or status', () => {
  const { skills, fixture } = setup({ cases: [demo(['ok', '3'], { exit: 0, status: 'ok' }), demo(['bad'], { exit: 0, status: 'ok' })] });
  const results = runSmoke({ skillsDir: skills, fixture });
  assert.deepEqual(results.map((r) => r.ok), [false, false]);
  assert.match(results[0].detail, /exit 3/);
  assert.match(results[1].detail, /status "bad"/);
});

test('every bundled script needs a smoke case', () => {
  const missingFile = setup();
  assert.match(runSmoke({ skillsDir: missingFile.skills, fixture: missingFile.fixture })[0].detail, /no smoke case for scripts\/demo.mjs/);
  const uncovered = setup({ cases: [demo(['ok'], { exit: 0, status: 'ok' })], extraScript: true });
  const results = runSmoke({ skillsDir: uncovered.skills, fixture: uncovered.fixture });
  assert.ok(results.some((r) => !r.ok && /scripts\/other.mjs/.test(r.detail)));
});
