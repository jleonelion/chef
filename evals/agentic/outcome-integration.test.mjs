import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorOutcome, turnInvalid } from './invalid.mjs';
import { aggregate, checkResponse, checkSkills } from './report.mjs';
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

test('a Projector rate limit is more specific than a nonzero launcher exit', () => {
  const error = projectCodex(stream({ type: 'turn.failed', error: { message: '429 Too Many Requests' } })).error;
  const cause = turnInvalid({ ...launch, exitCode: 1 }, error);
  assert.equal(cause.kind, 'rate_limit');
});

test('behavior from every Projector reproduces only the expected known-failure check', () => {
  const trajectories = [
    projectClaude(stream({ type: 'result', is_error: false, result: 'wrong response' })),
    projectCodex(stream({ type: 'item.completed', item: { type: 'agent_message', text: 'wrong response' } }, { type: 'turn.completed' })),
    projectCopilot(stream({ type: 'assistant.message', data: { content: 'wrong response' } }, { type: 'result', exitCode: 0 })),
  ];
  for (const [index, trajectory] of trajectories.entries()) {
    const fail = (row, check) => {
      try {
        if (check === 'response') checkResponse(trajectory.response, [{ path: '$.content', includes: 'expected response' }]);
        else checkSkills(trajectory.skills, { skills: ['chef-add-recipe'] });
      } catch (error) {
        return { row, rep: 1, ...errorOutcome(error) };
      }
      throw new Error('check unexpectedly passed');
    };
    const expected = fail('expected', 'response');
    const unexpected = fail('unexpected', 'skills');
    const multiple = fail('multiple', 'response');
    multiple.failures = [multiple.failure, fail('multiple', 'skills').failure];
    const result = aggregate({
      meta: {},
      reps: 1,
      rows: [
        { id: 'expected', flow: 'core', known_failure: 'case-one', expect_failure: 'response' },
        { id: 'unexpected', flow: 'core', known_failure: 'case-two', expect_failure: 'response' },
        { id: 'multiple', flow: 'core', known_failure: 'case-three', expect_failure: 'response' },
      ],
      runs: [expected, unexpected, multiple],
    });
    assert.equal(result.rows[0].pass, true, `Projector ${index + 1}`);
    assert.equal(result.rows[0].known_failure_reproduced, true, `Projector ${index + 1}`);
    assert.equal(result.rows[1].pass, false, `Projector ${index + 1}`);
    assert.equal(result.rows[1].known_failure_reproduced, false, `Projector ${index + 1}`);
    assert.equal(result.rows[2].pass, false, `Projector ${index + 1}`);
    assert.equal(result.rows[2].known_failure_reproduced, true, `Projector ${index + 1}`);
  }
});
