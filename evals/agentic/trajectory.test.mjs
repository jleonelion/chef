import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { projectClaude, projectCodex, projectCopilot, scriptsRunBy } from './trajectory.mjs';

const fixture = (name) => fs.readFileSync(path.join(import.meta.dirname, 'testdata', name), 'utf8');
const stream = (...events) => events.map((event) => JSON.stringify(event)).join('\n');
const result = { type: 'result', subtype: 'success', result: 'Done', total_cost_usd: 0.25, is_error: false };

// Re-record: run a row with `bun run agentic --rows <id> --reps 1`, copy the turn's log from
// evals/agentic/results/logs/, keep only init (model), assistant text/tool_use and result, and
// replace temp paths and ids. Never commit a raw log.
test('projects a recorded skill-firing turn', () => {
  const trajectory = projectClaude(fixture('claude-skill-firing.jsonl'));
  assert.equal(trajectory.error, null);
  assert.equal(trajectory.model, 'claude-opus-5-5');
  assert.deepEqual(trajectory.skills, ['chef-add-recipe']);
  assert.deepEqual(trajectory.toolCalls.map((call) => call.name), ['Skill', 'Bash']);
  assert.match(trajectory.response, /Tomato Lentil Soup/);
  assert(trajectory.scriptRuns.every((run) => run.script.startsWith('scripts/')));
  assert(trajectory.scriptRuns.some((run) => run.script === 'scripts/add-recipe.mjs'));
});

test('projects a recorded should-not-act turn', () => {
  const trajectory = projectClaude(fixture('claude-should-not-act.jsonl'));
  assert.equal(trajectory.error, null);
  assert.deepEqual(trajectory.skills, ['chef-meal-planning', 'chef-recipe-search']);
  assert.deepEqual(trajectory.scriptRuns, [{ script: 'scripts/recipe-search.mjs', args: ['search', '--query', 'lemon garlic pasta'] }]);
  assert.match(trajectory.response, /didn't save the plan/);
});

test('includes nested subagent tool calls and non-Bash tool paths', () => {
  const trajectory = projectClaude(
    stream(
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Task', input: {} }] } },
      { type: 'assistant', parent_tool_use_id: 'toolu_1', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'chef:chef-meal-logging' } }] } },
      { type: 'assistant', parent_tool_use_id: 'toolu_1', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node /p/skills/chef-meal-logging/scripts/meal-logging.mjs log --food "apple pie" | head' } }] } },
      { type: 'assistant', parent_tool_use_id: 'toolu_1', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/p/notes.md' } }] } },
      { type: 'assistant', message: { content: 'not an array' } },
      result,
    ),
  );
  assert.equal(trajectory.error, null);
  assert.deepEqual(trajectory.skills, ['chef-meal-logging']);
  assert.deepEqual(trajectory.toolCalls.map((call) => call.name), ['Task', 'Skill', 'Bash', 'Read']);
  assert.equal(trajectory.toolCalls[3].path, '/p/notes.md');
  assert.deepEqual(trajectory.scriptRuns, [{ script: 'scripts/meal-logging.mjs', args: ['log', '--food', 'apple pie'] }]);
});

test('an unparseable line sets an error naming the line, blank lines are ignored', () => {
  const text = `${JSON.stringify({ type: 'system', subtype: 'init' })}\n\n{"type":"assis\n${JSON.stringify(result)}`;
  assert.deepEqual(projectClaude(text).error, { kind: 'transcript', message: 'transcript line 3 is not valid JSON' });
  assert.equal(projectClaude(`\n${JSON.stringify(result)}\n\n`).error, null);
  assert.deepEqual(projectClaude(`${JSON.stringify(result)}\n42`).error, { kind: 'transcript', message: 'transcript line 2 is not valid JSON' });
});

test('a missing result event or an error result sets an error', () => {
  assert.deepEqual(projectClaude('').error, { kind: 'transcript', message: 'transcript has no result event' });
  assert.deepEqual(projectClaude(stream({ type: 'system', subtype: 'init' })).error, { kind: 'transcript', message: 'transcript has no result event' });
  assert.deepEqual(projectClaude(stream({ ...result, is_error: true, result: 'boom' })).error, { kind: 'process', message: 'turn ended in error: boom' });
  assert.deepEqual(projectClaude(stream({ ...result, is_error: true, result: 'API usage limit reached' })).error, {
    kind: 'rate_limit',
    message: 'turn ended in error: API usage limit reached',
  });
});

test('scriptsRunBy finds only skill-relative script references with their arguments', () => {
  assert.deepEqual(scriptsRunBy('cd skills/x && node scripts/a.mjs one "two words" 2>&1 | head'), [{ script: 'scripts/a.mjs', args: ['one', 'two words'] }]);
  assert.deepEqual(scriptsRunBy('echo \'{"a":1}\' | node /abs/scripts/b.mjs plan --week-start 2026-01-19; node scripts/c.mjs'), [
    { script: 'scripts/b.mjs', args: ['plan', '--week-start', '2026-01-19'] },
    { script: 'scripts/c.mjs', args: [] },
  ]);
  assert.deepEqual(scriptsRunBy('ls scripts && node scripts/*.mjs today && cat my-scripts/x.mjs && cat scripts/d.mjs && grep x scripts/e.mjs'), []);
});

// Codex fixture: a real `codex exec --json` turn (chef-meal-logging-from-plan prompt), outputs trimmed.
test('projects a recorded Codex turn', () => {
  const trajectory = projectCodex(fixture('codex-skill-firing.jsonl'));
  assert.equal(trajectory.error, null);
  assert.deepEqual(trajectory.skills, ['chef-meal-logging', 'chef-meal-planning']);
  assert.deepEqual(trajectory.scriptRuns, [{ script: 'scripts/meal-planning.mjs', args: ['today', '--date', '2026-01-20'] }]);
  assert.match(trajectory.response, /no saved meal plan/);
  assert.equal(trajectory.model, undefined);
});

test('Codex: failures and truncated transcripts set error', () => {
  const lines = (...events) => events.map((event) => JSON.stringify(event)).join('\n');
  assert.deepEqual(projectCodex(lines({ type: 'turn.started' })).error, { kind: 'transcript', message: 'transcript has no turn.completed event' });
  assert.deepEqual(projectCodex(lines({ type: 'turn.failed', error: { message: 'rate limited' } })).error, {
    kind: 'rate_limit',
    message: 'turn ended in error: rate limited',
  });
  assert.deepEqual(projectCodex(lines({ type: 'turn.failed', error: { message: 'child crashed' } })).error, {
    kind: 'process',
    message: 'turn ended in error: child crashed',
  });
  assert.deepEqual(projectCodex('not json').error, { kind: 'transcript', message: 'transcript line 1 is not valid JSON' });
});

// Copilot fixture: a real `copilot -p --output-format json` turn, reduced to its assistant.message and result events.
test('projects a recorded Copilot turn', () => {
  const trajectory = projectCopilot(fixture('copilot-skill-firing.jsonl'));
  assert.equal(trajectory.error, null);
  assert.equal(trajectory.model, 'claude-sonnet-5.5');
  assert.deepEqual(trajectory.skills, ['chef-meal-logging']);
  assert.deepEqual(trajectory.toolCalls.map((call) => call.name), ['skill', 'bash']);
  assert.match(trajectory.response, /no meal plan covers 2026-01-20/);
  assert.equal(trajectory.cost_usd, undefined);
});

test('Copilot: a failed or truncated transcript sets error', () => {
  const lines = (...events) => events.map((event) => JSON.stringify(event)).join('\n');
  assert.deepEqual(projectCopilot(lines({ type: 'assistant.message', data: {} })).error, { kind: 'transcript', message: 'transcript has no result event' });
  assert.deepEqual(projectCopilot(lines({ type: 'result', exitCode: 1 })).error, { kind: 'process', message: 'turn ended in error: exit code 1' });
  assert.deepEqual(projectCopilot(lines({ type: 'result', exitCode: 1, error: '429 Too Many Requests' })).error, {
    kind: 'rate_limit',
    message: 'turn ended in error: 429 Too Many Requests',
  });
  assert.deepEqual(projectCopilot('not json').error, { kind: 'transcript', message: 'transcript line 1 is not valid JSON' });
});

test('all Projectors detect a rate limit beyond the retained message prefix', () => {
  const detail = `${'x'.repeat(250)} 429 Too Many Requests`;
  const errors = [
    projectClaude(stream({ ...result, is_error: true, result: detail })).error,
    projectCodex(stream({ type: 'turn.failed', error: { message: detail } })).error,
    projectCopilot(stream({ type: 'result', exitCode: 1, error: detail })).error,
  ];
  assert.deepEqual(errors.map((error) => error.kind), ['rate_limit', 'rate_limit', 'rate_limit']);
});
