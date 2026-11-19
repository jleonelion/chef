import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harnessInvalid, invalid, launchInvalid, turnInvalid } from './invalid.mjs';

test('launchInvalid distinguishes timeout, rate limit and process failures', () => {
  assert.deepEqual(launchInvalid({ timedOut: true, exitCode: null, signal: 'SIGTERM', stderr: '' }), {
    kind: 'timeout',
    message: 'turn timed out and ended with signal SIGTERM',
  });
  assert.deepEqual(launchInvalid({ timedOut: false, exitCode: 1, signal: null, stderr: '429 Too Many Requests' }), {
    kind: 'rate_limit',
    message: 'turn exited 1: 429 Too Many Requests',
  });
  assert.equal(launchInvalid({ timedOut: false, exitCode: 1, signal: null, stderr: `${'x'.repeat(250)} quota exceeded` }).kind, 'rate_limit');
  assert.deepEqual(launchInvalid({ timedOut: false, exitCode: null, signal: 'SIGKILL', stderr: '' }), {
    kind: 'process',
    message: 'turn ended with signal SIGKILL',
  });
  assert.deepEqual(launchInvalid({ timedOut: false, exitCode: -2, signal: null, stderr: '', spawnError: 'spawn agent ENOENT' }), {
    kind: 'process',
    message: 'turn process failed: spawn agent ENOENT',
  });
  assert.equal(launchInvalid({ timedOut: false, exitCode: 0, signal: null, stderr: 'warning' }), null);
});

test('harnessInvalid retains setup and runner failures as harness errors', () => {
  assert.deepEqual(harnessInvalid(new Error('could not prepare sandbox')), {
    kind: 'harness',
    message: 'could not prepare sandbox',
  });
});

test('turnInvalid preserves a process failure over a transcript parsing error', () => {
  const launch = { timedOut: false, exitCode: 1, signal: null, stderr: '' };
  assert.equal(turnInvalid(launch, invalid('transcript', 'missing result event')).kind, 'process');
});
