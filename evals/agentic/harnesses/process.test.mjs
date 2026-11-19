import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { collectProcess } from './process.mjs';

test('collectProcess retains transcript, stderr and exit code', async () => {
  const child = spawn(process.execPath, ['-e', "process.stdout.write('transcript'); process.stderr.write('warning'); process.exit(7)"]);
  assert.deepEqual(await collectProcess(child, { timeoutMs: 1000, ext: 'jsonl' }), {
    transcript: 'transcript',
    stderr: 'warning',
    timedOut: false,
    exitCode: 7,
    signal: null,
    ext: 'jsonl',
  });
});

test('collectProcess force-kills a child that ignores the timeout signal', async () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"]);
  const result = await collectProcess(child, { timeoutMs: 20, killGraceMs: 20, ext: 'jsonl' });
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, null);
  assert.equal(result.signal, 'SIGKILL');
});

test('collectProcess retains a real spawn error', async () => {
  const child = spawn('chef-agentic-command-that-does-not-exist', []);
  const result = await collectProcess(child, { timeoutMs: 1000, ext: 'jsonl' });
  assert.match(result.spawnError, /ENOENT|not found/i);
});
