import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { initDataRoot } from './init-data-root.mjs';
import { verifyInstall } from './verify-install.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chef-verify-'));

function install() {
  const skillsDir = tmp();
  const skill = path.join(skillsDir, 'chef-demo');
  fs.mkdirSync(path.join(skill, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(skill, 'scripts', 'demo.mjs'), "console.log(JSON.stringify({ status: 'ok' }));\n");
  fs.writeFileSync(path.join(skill, 'smoke.json'), JSON.stringify([{ id: 'demo', script: 'scripts/demo.mjs', args: [], expect: { exit: 0, status: 'ok' } }]));
  const fixture = tmp();
  fs.writeFileSync(path.join(fixture, 'schema-version.json'), '{"schema_version":1}');
  const root = path.join(tmp(), 'chef');
  initDataRoot(root);
  return { skillsDir, fixture, root };
}

const check = (result, name) => result.checks.find((c) => c.name === name);

test('passes on a clean install and leaves the data root alone', () => {
  const { skillsDir, fixture, root } = install();
  const before = fs.readdirSync(root).sort();
  const result = verifyInstall(root, { skillsDir, fixture });
  assert.equal(result.status, 'pass', JSON.stringify(result.checks));
  assert.deepEqual(result.checks.map((c) => c.name), ['node', 'data-root', 'schema', 'smoke:chef-demo/demo']);
  assert.deepEqual(fs.readdirSync(root).sort(), before);
});

test('fails when the data root is missing', () => {
  const { skillsDir, fixture } = install();
  const result = verifyInstall(path.join(tmp(), 'missing'), { skillsDir, fixture });
  assert.equal(result.status, 'fail');
  assert.match(check(result, 'data-root').detail, /chef-setup init/);
});

test('fails on a schema mismatch with an update pointer', () => {
  const { skillsDir, fixture, root } = install();
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":9}');
  const result = verifyInstall(root, { skillsDir, fixture });
  assert.equal(result.status, 'fail');
  assert.match(check(result, 'schema').detail, /update Chef/);
});

test('fails on an old Node', () => {
  const { skillsDir, fixture, root } = install();
  const result = verifyInstall(root, { skillsDir, fixture, nodeVersion: 'v18.19.0' });
  assert.equal(result.status, 'fail');
  assert.match(check(result, 'node').detail, /20/);
});

test('fails when a bundled script fails its smoke', () => {
  const { skillsDir, fixture, root } = install();
  fs.writeFileSync(path.join(skillsDir, 'chef-demo', 'scripts', 'demo.mjs'), 'process.exit(1);\n');
  assert.equal(verifyInstall(root, { skillsDir, fixture }).status, 'fail');
});
