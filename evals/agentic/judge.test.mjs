import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseJudgeVerdict, judgeReply, createJudgeCacheKey, createSubscriptionJudgeCall } from './judge.mjs';

const pastedRecipeRow = JSON.parse(fs.readFileSync(new URL('./rows.json', import.meta.url), 'utf8'))
  .find(({ id }) => id === 'chef-add-recipe-pasted-text');

test('parseJudgeVerdict rejects empty and unparseable replies', () => {
  assert.equal(parseJudgeVerdict(''), null);
  assert.equal(parseJudgeVerdict('not json'), null);
  assert.equal(parseJudgeVerdict('{"score":2,"passes":true}'), null);
});

test('judgeReply returns fail-closed verdicts and caches identical calls', async () => {
  let calls = 0;
  const callJudge = async () => {
    calls += 1;
    return '{"score":0.8,"passes":true,"reasoning":"complete","missing_critical_details":[],"unexpected_problems":[],"confidence":0.9}';
  };

  const first = await judgeReply({
    callJudge,
    prompt: 'Plan dinner',
    expected: 'A grounded week plan',
    response: 'I planned Monday dinner.',
    threshold: 0.7,
  });
  const second = await judgeReply({
    callJudge,
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

test('pasted-recipe judge grades the reply, not storage proof or unsolicited findability instructions', async () => {
  const row = pastedRecipeRow;
  await judgeReply({
    prompt: fs.readFileSync(new URL(`../../${row.turns[0].turnFile}`, import.meta.url), 'utf8'),
    expected: row.judge.expected,
    response: 'Saved Tomato Lentil Soup. No dietary flags were found in the ingredients. Nutrition was not computed because USDA is not connected.',
    threshold: row.judge.threshold,
    callJudge: async (prompt) => {
      assert.match(prompt, /semantic target, not a literal template/i);
      assert.match(prompt, /confirms that Tomato Lentil Soup was saved.*ignore enrichment details, notices/i);
      assert.match(prompt, /findability.*checked mechanically/i);
      assert.match(prompt, /do not require.*how to find.*ingredients or steps/i);
      return '{"score":1,"passes":true,"reasoning":"reply meets target","missing_critical_details":[],"unexpected_problems":[],"confidence":1}';
    },
  });
});

test('a judge veto or a below-threshold score fails even when the other condition passes', async () => {
  for (const [score, passes] of [[0.9, false], [0.6, true]]) {
    const result = await judgeReply({
      prompt: 'Save Tomato Lentil Soup',
      expected: 'A save confirmation and enrichment summary',
      response: `Saved. Verdict case ${score}.`,
      threshold: pastedRecipeRow.judge.threshold,
      callJudge: async () => JSON.stringify({
        score, passes, reasoning: 'insufficient', missing_critical_details: [],
        unexpected_problems: [], confidence: 1,
      }),
    });
    assert.equal(result.pass, false);
  }
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

test('subscription CLI judge is fail-closed when unavailable or malformed', async () => {
  await assert.rejects(
    createSubscriptionJudgeCall({ harness: 'missing', model: 'test' }),
    /unsupported judge harness/,
  );

  let calls = 0;
  const unavailable = createSubscriptionJudgeCall({
    harness: 'claude',
    model: 'test',
    runCli: async () => {
      calls += 1;
      throw new Error('claude not authenticated');
    },
  });
  await assert.rejects(unavailable('judge prompt'), /claude not authenticated/);
  assert.equal(calls, 1);

  const malformed = createSubscriptionJudgeCall({
    harness: 'claude',
    model: 'test',
    runCli: async () => 'not json',
  });
  await assert.rejects(malformed('judge prompt'), /malformed judge output/);
});
