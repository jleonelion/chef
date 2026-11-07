import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { deliverList } from './deliver.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-shopping-deliver-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":1}\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Shop Test', '-c', 'user.email=shop-test@example.com', 'commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

const list = { week_start: '2026-01-19', text: '# Shopping list: week of 2026-01-19\n\n- 4 can chickpeas\n' };
const head = (root) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });

test('no recipients: chat only, on Muse or off, and nothing is written', () => {
  const root = makeRoot();
  const before = head(root);
  for (const onMuse of [true, false]) assert.deepEqual(deliverList(root, list, { recipients: [], onMuse }), { mode: 'chat' });
  assert.equal(head(root), before);
  assert.equal(fs.existsSync(path.join(root, 'data')), false);
});

test('recipients on Muse: an email payload for the Gmail connector; the script sends nothing', () => {
  const root = makeRoot();
  const delivery = deliverList(root, list, { recipients: ['cook@example.com'], onMuse: true });
  assert.equal(delivery.mode, 'email');
  assert.equal(delivery.connector, 'gmail');
  assert.deepEqual(delivery.to, ['cook@example.com']);
  assert.equal(delivery.subject, 'Shopping list: week of 2026-01-19');
  assert.equal(delivery.body, list.text);
  assert.match(delivery.instruction, /Gmail connector/);
  assert.equal(fs.existsSync(path.join(root, 'data')), false);
});

test('recipients off Muse: the list is written to the data root and committed', () => {
  const root = makeRoot();
  const delivery = deliverList(root, list, { recipients: ['cook@example.com'], onMuse: false });
  assert.deepEqual(delivery, { mode: 'file', path: 'data/shopping-lists/2026-01-19.md' });
  assert.equal(fs.readFileSync(path.join(root, delivery.path), 'utf8'), list.text);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }), '');
});

test('off Muse, a schema mismatch refuses the write', () => {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, 'schema-version.json'), '{"schema_version":99}\n');
  const delivery = deliverList(root, list, { recipients: ['cook@example.com'], onMuse: false });
  assert.equal(delivery.status, 'refused');
  assert.equal(fs.existsSync(path.join(root, 'data')), false);
});
