import * as claude from './claude.mjs';
import * as codex from './codex.mjs';

const harnesses = { claude, codex };

export function loadHarness(name) {
  const harness = harnesses[name];
  if (!harness) throw new Error(`unknown harness "${name}" (expected ${Object.keys(harnesses).join('|')})`);
  return harness;
}
