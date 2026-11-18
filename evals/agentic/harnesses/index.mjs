import * as claude from './claude.mjs';
import * as codex from './codex.mjs';
import * as copilot from './copilot.mjs';

const harnesses = { claude, codex, copilot };

export function loadHarness(name) {
  const harness = harnesses[name];
  if (!harness) throw new Error(`unknown harness "${name}" (expected ${Object.keys(harnesses).join('|')})`);
  return harness;
}
