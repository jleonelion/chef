import assert from 'node:assert/strict';
import { test } from 'node:test';
import { turnInvalid } from './invalid.mjs';
import { aggregate } from './report.mjs';
import { projectClaude, projectCodex, projectCopilot } from './trajectory.mjs';

const stream = (...events) => events.map((event) => JSON.stringify(event)).join('\n');
const launch = { timedOut: false, exitCode: 0, signal: null, stderr: '' };

test('invalid output from every Projector cannot reproduce a known failure', () => {
  const errors = [
    projectClaude(stream({ type: 'result', is_error: true, result: 'usage limit reached' })).error,
    projectCodex(stream({ type: 'turn.failed', error: { message: 'rate limited' } })).error,
    projectCopilot(stream({ type: 'result', exitCode: 1, error: '429 Too Many Requests' })).error,
  ];
  for (const [index, error] of errors.entries()) {
    const cause = turnInvalid(launch, error);
    const result = aggregate({
      meta: {},
      reps: 1,
      rows: [{ id: 'known', flow: 'core', known_failure: 'case-one', expect_failure: 'response' }],
      runs: [{ row: 'known', rep: 1, outcome: 'invalid', invalid: cause }],
    });
    assert.equal(result.invalid, true, `Projector ${index + 1}`);
    assert.equal(result.rows[0].pass, false, `Projector ${index + 1}`);
    assert.equal(result.rows[0].known_failure_reproduced, false, `Projector ${index + 1}`);
    assert.equal(result.rows[0].invalid[0].kind, 'rate_limit', `Projector ${index + 1}`);
  }
});
