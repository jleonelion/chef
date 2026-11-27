import fs from 'node:fs';
import path from 'node:path';

function parseLines(text, label) {
  return text.split('\n').flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      throw new Error(`invalid Codex ${label} JSON on line ${index + 1}`);
    }
  });
}

function rolloutFiles(directory, threadId) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return rolloutFiles(file, threadId);
    return entry.isFile() && entry.name.endsWith(`-${threadId}.jsonl`) ? [file] : [];
  });
}

// Codex 0.171.0 persists its selected model_info.slug in turn_context.payload.model.
// These internal JSONL records can also hold prompts and tool output; return only model evidence.
export function createCodexModelReader(codexHome) {
  const seenTurns = new Set();
  let threadId;
  return (transcript) => {
    const evidence = { source: 'codex-rollout' };
    try {
      const events = parseLines(transcript, 'transcript');
      const threads = [...new Set(events.filter((event) => event?.type === 'thread.started').map((event) => event.thread_id))];
      if (threads.length !== 1 || typeof threads[0] !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(threads[0])) {
        throw new Error('missing or ambiguous Codex thread.started identity');
      }
      evidence.threadId = threads[0];
      if (threadId && evidence.threadId !== threadId) throw new Error('Codex thread identity changed during resume');
      threadId = evidence.threadId;
      const files = rolloutFiles(path.join(codexHome, 'sessions'), evidence.threadId);
      if (files.length !== 1) throw new Error(`expected one Codex rollout, found ${files.length}`);
      evidence.rollout = path.relative(codexHome, files[0]);
      const rows = parseLines(fs.readFileSync(files[0], 'utf8'), 'rollout');
      const meta = rows.filter((row) => row?.type === 'session_meta');
      if (meta.length !== 1 || meta[0].payload?.id !== evidence.threadId) throw new Error('Codex rollout session identity mismatch');
      const contexts = rows.filter((row) => row?.type === 'turn_context' && !seenTurns.has(row.payload?.turn_id)).map((row) => row.payload);
      if (!contexts.length) throw new Error('missing new Codex turn_context model evidence');
      if (contexts.some((context) => typeof context?.model !== 'string' || !context.model.trim() || typeof context.turn_id !== 'string' || !context.turn_id.trim())) {
        throw new Error('missing Codex turn_context model or turn identity');
      }
      if (new Set(contexts.map((context) => context.turn_id)).size !== 1 || new Set(contexts.map((context) => context.model)).size !== 1) {
        throw new Error('conflicting or ambiguous Codex turn_context model evidence');
      }
      const context = contexts[0];
      seenTurns.add(context.turn_id);
      return { ...evidence, turnId: context.turn_id, model: context.model };
    } catch (error) {
      return { ...evidence, error: error.message };
    }
  };
}
