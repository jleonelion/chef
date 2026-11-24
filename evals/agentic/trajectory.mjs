// Trajectory: the runtime-neutral record of one agent turn (see GLOSSARY). Claude Code, Codex and
// Copilot projectors exist, so the shape is final.
//
//   {
//     response:   string,                                // the turn's final reply
//     skills:     string[],                              // chef skills fired, in order, "chef:" prefix dropped
//     toolCalls:  [{ name, command?, path? }],           // every tool call, Skill calls included
//     scriptRuns: [{ script, args }],                    // untrusted command-text candidates; the runner requires execution observations for presence checks
//     error:      {kind, message} | null,                 // structured invalid-execution cause; never an empty-but-valid response
//     model?:     string,                                // absent when the runtime does not report it (Codex; Copilot reports no cost)
//     cost_usd?:  number,                                // absent when the runtime does not report it (Codex; Copilot reports no cost)
//   }
//
// Each runtime has a projector that turns its raw transcript into a Trajectory. Checks and the
// runner consume Trajectories, never raw transcripts. The runner separately observes script processes.
import { invalid, runtimeInvalid } from './invalid.mjs';
import { codexSkillReads } from './codex-skill-reads.mjs';

function parseEvents(text) {
  const events = [];
  let error = null;
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event === null || typeof event !== 'object' || Array.isArray(event)) throw new Error('not an object');
      events.push(event);
    } catch {
      error ??= invalid('transcript', `transcript line ${index + 1} is not valid JSON`);
    }
  }
  return { events, error };
}

// Claude Code: one `claude -p --output-format stream-json` transcript → Trajectory. Subagent
// activity (parent_tool_use_id set) is part of the turn. A line that fails to parse, or a missing
// `result` event, sets `error`.
export function projectClaude(text) {
  const parsed = parseEvents(text);
  const { events } = parsed;
  let { error } = parsed;
  const result = events.find((event) => event.type === 'result');
  const blocks = events
    .filter((event) => event.type === 'assistant' && Array.isArray(event.message?.content))
    .flatMap((event) => event.message.content)
    .filter((block) => block?.type === 'tool_use');
  const toolCalls = blocks.map(({ name, input }) => ({
    name: String(name),
    ...(typeof input?.command === 'string' && { command: input.command }),
    ...(typeof (input?.file_path ?? input?.path) === 'string' && { path: input.file_path ?? input.path }),
  }));
  if (!result) error ??= invalid('transcript', 'transcript has no result event');
  else if (result.is_error === true) error ??= runtimeInvalid(`turn ended in error: ${String(result.result ?? 'no detail')}`);
  return {
    response: typeof result?.result === 'string' ? result.result : '',
    skills: blocks.filter((block) => block.name === 'Skill').map((block) => String(block.input?.skill ?? '').replace(/^[^:]*:/, '')),
    toolCalls,
    scriptRuns: toolCalls.flatMap((call) => (call.name === 'Bash' ? scriptsRunBy(call.command ?? '') : [])),
    error,
    model: events.find((event) => event.type === 'system' && event.subtype === 'init')?.model,
    cost_usd: result?.total_cost_usd ?? 0,
  };
}

// An interpreter running the script; reading it (cat, grep, ls) is not a run.
const SCRIPT = /\b(?:node|bun|bash|sh|python3?)\s+(?:[^\s"'|;&<>]*\/)?(scripts\/[\w-]+\.(?:mjs|js|sh|py))(?![\w.-])/g;

// Every `scripts/<name>` a shell command runs, with the arguments up to the next shell operator.
export function scriptsRunBy(command) {
  return [...command.matchAll(SCRIPT)].map((match) => ({
    script: match[1],
    args: shellWords(command.slice(match.index + match[0].length)),
  }));
}

// Words up to the first unquoted pipe, `;`, `&`, redirect or newline.
function shellWords(text) {
  const words = [];
  let word = null;
  let quote = null;
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      word ??= '';
    } else if (/[|;&<>\n]/.test(char)) {
      if (/[<>]/.test(char) && /^\d+$/.test(word ?? '')) word = null; // fd prefix of a redirect, as in 2>&1
      break;
    } else if (/\s/.test(char)) {
      if (word !== null) words.push(word);
      word = null;
    } else {
      word = (word ?? '') + char;
    }
  }
  if (word !== null) words.push(word);
  return words;
}

// Codex: one `codex exec --json` transcript → Trajectory. Codex has no skill tool: a skill fires
// when a shell command reads its SKILL.md. The transcript carries no model or cost. A line that fails
// to parse, a `turn.failed`/`error` event, or a missing `turn.completed` sets `error`.
export function projectCodex(text) {
  const parsed = parseEvents(text);
  const { events } = parsed;
  let { error } = parsed;
  const items = events.filter((event) => event.type === 'item.completed' && event.item).map((event) => event.item);
  const toolCalls = items.flatMap((item) => {
    if (item.type === 'command_execution') return [{ name: 'shell', command: String(item.command ?? '') }];
    if (item.type === 'file_change') return (item.changes ?? []).map((change) => ({ name: 'file_change', path: String(change.path) }));
    return [];
  });
  const failure = events.find((event) => event.type === 'turn.failed' || event.type === 'error');
  if (failure) error ??= runtimeInvalid(`turn ended in error: ${String(failure.error?.message ?? failure.message ?? 'no detail')}`);
  else if (!events.some((event) => event.type === 'turn.completed')) error ??= invalid('transcript', 'transcript has no turn.completed event');
  const messages = items.filter((item) => item.type === 'agent_message');
  return {
    response: String(messages.at(-1)?.text ?? ''),
    skills: toolCalls.flatMap((call) => codexSkillReads(call.command ?? '')),
    toolCalls,
    scriptRuns: toolCalls.flatMap((call) => (call.name === 'shell' ? scriptsRunBy(call.command) : [])),
    error,
  };
}

// Copilot: one `copilot -p --output-format json` transcript → Trajectory. Tool calls come from the
// non-delta `assistant.message` events (`skill` carries the skill name, `bash` a command, file tools
// a `path`); the final `result` event carries the exit code and only premium-request usage, so no
// cost. A bad line, a missing `result`, or a nonzero `exitCode` sets `error`.
export function projectCopilot(text) {
  const parsed = parseEvents(text);
  const { events } = parsed;
  let { error } = parsed;
  const messages = events.filter((event) => event.type === 'assistant.message').map((event) => event.data ?? {});
  const toolCalls = messages
    .flatMap((message) => message.toolRequests ?? [])
    .map(({ name, arguments: input }) => ({
      name: String(name),
      ...(typeof input?.command === 'string' && { command: input.command }),
      ...(typeof input?.path === 'string' && { path: input.path }),
    }));
  const skillCalls = messages.flatMap((message) => message.toolRequests ?? []).filter((call) => call.name === 'skill');
  const result = events.find((event) => event.type === 'result');
  if (!result) error ??= invalid('transcript', 'transcript has no result event');
  else if (result.exitCode !== 0) {
    const detail = String(result.error ?? result.message ?? `exit code ${result.exitCode}`);
    error ??= runtimeInvalid(`turn ended in error: ${detail}`);
  }
  return {
    response: String(messages.filter((message) => message.content).at(-1)?.content ?? ''),
    skills: skillCalls.map((call) => String(call.arguments?.skill ?? '').replace(/^[^:]*:/, '')),
    toolCalls,
    scriptRuns: toolCalls.flatMap((call) => (call.name === 'bash' ? scriptsRunBy(call.command ?? '') : [])),
    error,
    model: messages.find((message) => message.model)?.model,
  };
}
