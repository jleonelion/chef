import * as claude from './claude.mjs';

const harnesses = { claude };

export function loadHarness(name) {
  const harness = harnesses[name];
  if (!harness) throw new Error(`unknown harness "${name}" (expected ${Object.keys(harnesses).join('|')})`);
  return harness;
}
