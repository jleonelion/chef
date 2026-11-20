import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseJudgeVerdict, judgeReply, createJudgeCacheKey } from './judge.mjs';

test('parseJudgeVerdict rejects empty and unparseable replies', () => {
  assert.equal(parseJudgeVerdict(''), null);
  assert.equal(parseJudgeVerdict('not json'), null);
  assert.equal(parseJudgeVerdict('{"score":2,"passes":true}'), null);
});

test('judgeReply returns fail-closed verdicts and caches identical calls', async () => {
  let calls = 0;
  const judge = judgeReply.bind(null, {
    callJudge: async () => {
      calls += 1;
      return '{"score":0.8,"passes":true,"reasoning":"complete","missing_critical_details":[],"unexpected_problems":[],"confidence":0.9}';
    },
  });

  const first = await judge({
    prompt: 'Plan dinner',
    expected: 'A grounded week plan',
    response: 'I planned Monday dinner.',
    threshold: 0.7,
  });
  const second = await judge({
    prompt: 'Plan dinner',
    expected: 'A grounded week plan',
    response: 'I planned Monday dinner.',
    threshold: 0.7,
  });

  assert.equal(first.pass, true);
  assert.equal(first.score, 0.8);
  assert.equal(second.pass, true);
  assert.equal(calls, 1);
});

test('empty replies score zero without calling the judge', async () => {
  let calls = 0;
  const result = await judgeReply({
    callJudge: async () => {
      calls += 1;
      return '{}';
    },
    prompt: 'Add a recipe',
    expected: 'A clear confirmation',
    response: '  ',
    threshold: 0.7,
  });
  assert.deepEqual(result, { pass: false, score: 0, verdict: null, reason: 'empty response' });
  assert.equal(calls, 0);
});

test('unparseable verdicts score zero', async () => {
  const result = await judgeReply({
    callJudge: async () => 'I think it passes',
    prompt: 'Plan dinner',
    expected: 'A grounded week plan',
    response: 'I planned dinner.',
    threshold: 0.7,
  });
  assert.equal(result.pass, false);
  assert.equal(result.score, 0);
  assert.equal(result.verdict, null);
});

test('cache key is based on prompt, semantic target and response', () => {
  assert.equal(
    createJudgeCacheKey({ prompt: 'p', expected: 'e', response: 'r' }),
    createJudgeCacheKey({ prompt: 'p', expected: 'e', response: 'r' }),
  );
  assert.notEqual(
    createJudgeCacheKey({ prompt: 'p', expected: 'e', response: 'r' }),
    createJudgeCacheKey({ prompt: 'p', expected: 'different', response: 'r' }),
  );
});
