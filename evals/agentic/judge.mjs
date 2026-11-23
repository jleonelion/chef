const cache = new Map();
import { spawnSync } from 'node:child_process';

function passesJudge(verdict, threshold) {
  return verdict.passes && verdict.score >= threshold;
}

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

export async function judgeReply(settings) {
  const callJudge = settings.callJudge;
  if (typeof settings.response !== 'string' || !settings.response.trim()) {
    return { pass: false, score: 0, verdict: null, reason: 'empty response' };
  }
  if (typeof callJudge !== 'function') throw new Error('judge call is required');
  const key = createJudgeCacheKey(settings);
  if (cache.has(key)) {
    const cached = cache.get(key);
    return cached.verdict
      ? { pass: passesJudge(cached.verdict, settings.threshold), score: cached.score, verdict: cached.verdict }
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
    ? { pass: passesJudge(verdict, settings.threshold), score: verdict.score, verdict }
    : { pass: false, score: 0, verdict: null, reason: 'unparseable verdict' };
  cache.set(key, verdict
    ? { pass: result.pass, score: result.score, verdict }
    : result);
  return result;
}

function extractCLIOutput(harness, stdout) {
  const text = stdout?.trim();
  if (!text) throw new Error('malformed judge output');
  if (harness === 'claude') {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.result === 'string') return parsed.result;
    } catch {}
  }
  if (harness === 'codex') {
    const events = text.split('\n').map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    const message = events.findLast((event) => event.type === 'item.completed' && typeof event.item?.text === 'string');
    if (message) return message.item.text;
  }
  if (harness === 'copilot') {
    const events = text.split('\n').map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    const message = events.findLast((event) => event.type === 'assistant.message');
    if (typeof message?.data?.content === 'string') return message.data.content;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.result === 'string') return parsed.result;
      if (typeof parsed.output === 'string') return parsed.output;
      if (typeof parsed.response === 'string') return parsed.response;
    } catch {}
  }
  if (/^\s*[\[{]/.test(text)) return text;
  throw new Error('malformed judge output');
}

export function createSubscriptionJudgeCall({ harness, model, runCli } = {}) {
  if (!['claude', 'codex', 'copilot'].includes(harness)) {
    return async () => { throw new Error(`unsupported judge harness "${harness}"`); };
  }
  if (!model) throw new Error('judge model is required (use --judge-model or CHEF_EVAL_JUDGE_MODEL)');
  const runner = runCli ?? (async (prompt) => {
    const args = harness === 'claude'
      ? ['-p', prompt, '--output-format', 'json', '--strict-mcp-config', '--setting-sources', 'user', '--permission-mode', 'dontAsk', '--model', model]
      : harness === 'codex'
        ? ['exec', '--json', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-c', 'sandbox_mode="read-only"', '-m', model, prompt]
        : ['-p', prompt, '--output-format', 'json', '--allow-all-tools', '--no-ask-user', '--no-auto-update', '--disable-builtin-mcps', '--no-custom-instructions', '--model', model];
    const result = spawnSync(harness === 'copilot' ? 'copilot' : harness, args, { encoding: 'utf8', timeout: 10 * 60 * 1000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${harness} judge call failed (${result.status}): ${result.stderr?.trim() || 'no error output'}`);
    return extractCLIOutput(harness, result.stdout);
  });
  return async (prompt) => {
    const output = await runner(prompt);
    if (typeof output !== 'string' || !output.trim()) throw new Error('malformed judge output');
    if (!parseJudgeVerdict(output)) throw new Error('malformed judge output');
    return output;
  };
}
