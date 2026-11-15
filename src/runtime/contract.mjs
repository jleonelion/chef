// The runtime adapter contract as Chef core sees it: which adapter speaks for this runtime, and
// the checks core runs before trusting one. conformance.test.mjs is the contract every adapter
// must pass to ship.
import fs from 'node:fs';
import CAPABILITIES from '../../schemas/feedback/capabilities.v1.json' with { type: 'json' };
import { generic } from './generic.mjs';
import { muse } from './muse.mjs';

export const ADAPTER_CONTRACT_VERSION = 1;

// Muse is the only runtime Chef identifies; anything else is generic, never assumed to be Muse.
export const currentRuntime = ({ exists = fs.existsSync } = {}) => (muse.isMuse({ exists }) ? muse : generic);

// True when the adapter can do some `<prefix>.*` thing right now, e.g. hasCapability(a, 'submit').
export const hasCapability = (adapter, prefix) => adapter.feedback.capabilities().some((name) => name.startsWith(`${prefix}.`));

// Returns the adapter, or throws when core cannot trust it.
export function checkAdapter(adapter) {
  const major = adapter.adapterContractVersion;
  if (major !== ADAPTER_CONTRACT_VERSION) throw new Error(`unsupported adapter contract version ${major}`);
  for (const name of adapter.feedback.capabilities()) {
    if (!Object.hasOwn(CAPABILITIES.capabilities, name)) throw new Error(`unregistered capability "${name}"`);
  }
  return adapter;
}
