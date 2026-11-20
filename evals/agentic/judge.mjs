const cache = new Map();

export function createJudgeCacheKey({ prompt, expected, response }) {
  return JSON.stringify([prompt, expected, response]);
}

export function parseJudgeVerdict(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match?.[0] ?? text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (typeof parsed.score !== 'number' || !Number.isFinite(parsed.score) || parsed.score < 0 || parsed.score > 1) return null;
  if (typeof parsed.passes !== 'boolean') return null;
  if (typeof parsed.reasoning !== 'string') return null;
  if (!Array.isArray(parsed.missing_critical_details) || parsed.missing_critical_details.some((item) => typeof item !== 'string')) return null;
  if (!Array.isArray(parsed.unexpected_problems) || parsed.unexpected_problems.some((item) => typeof item !== 'string')) return null;
  if (typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) return null;
  return parsed;
}

export async function judgeReply(options, input) {
  const settings = input ?? options;
  const callJudge = input ? options.callJudge : options.callJudge;
  if (typeof settings.response !== 'string' || !settings.response.trim()) {
    return { pass: false, score: 0, verdict: null, reason: 'empty response' };
  }
  if (typeof callJudge !== 'function') throw new Error('judge call is required');
  const key = createJudgeCacheKey(settings);
  if (cache.has(key)) {
    const cached = cache.get(key);
    return cached.verdict
      ? { pass: cached.verdict.passes && cached.score >= settings.threshold, score: cached.score, verdict: cached.verdict }
      : cached;
  }
  const prompt = [
    'Judge the response against the semantic target.',
    'Return exactly one JSON object with score (0-1), passes (boolean), reasoning (string),',
    'missing_critical_details (string array), unexpected_problems (string array), and confidence (0-1).',
    `Semantic target: ${settings.expected}`,
    `User prompt: ${settings.prompt}`,
    `Response: ${settings.response}`,
  ].join('\n');
  const raw = await callJudge(prompt);
  const verdict = parseJudgeVerdict(raw);
  const result = verdict
    ? { pass: verdict.passes && verdict.score >= settings.threshold, score: verdict.score, verdict }
    : { pass: false, score: 0, verdict: null, reason: 'unparseable verdict' };
  cache.set(key, verdict
    ? { pass: result.pass, score: result.score, verdict }
    : result);
  return result;
}

export async function openAIJudgeCall(model, apiKey = process.env.OPENAI_API_KEY) {
  if (!model) throw new Error('judge model is required (use --judge-model or CHEF_EVAL_JUDGE_MODEL)');
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for the answer-quality judge');
  return async (prompt) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`judge call failed (${response.status})`);
    const body = await response.json();
    return body?.choices?.[0]?.message?.content ?? '';
  };
}
