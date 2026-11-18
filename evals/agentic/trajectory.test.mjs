import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { projectClaude, projectCodex, scriptsRunBy } from './trajectory.mjs';

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
  assert.match(projectClaude(text).error, /line 3 is not valid JSON/);
  assert.equal(projectClaude(`\n${JSON.stringify(result)}\n\n`).error, null);
  assert.match(projectClaude(`${JSON.stringify(result)}\n42`).error, /line 2/);
});

test('a missing result event or an error result sets an error', () => {
  assert.match(projectClaude('').error, /no result event/);
  assert.match(projectClaude(stream({ type: 'system', subtype: 'init' })).error, /no result event/);
  assert.match(projectClaude(stream({ ...result, is_error: true, result: 'boom' })).error, /turn ended in error: boom/);
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
  assert.match(projectCodex(lines({ type: 'turn.started' })).error, /no turn.completed/);
  assert.match(projectCodex(lines({ type: 'turn.failed', error: { message: 'rate limited' } })).error, /rate limited/);
  assert.match(projectCodex('not json').error, /not valid JSON/);
});
