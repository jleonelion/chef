import os from 'node:os';
import path from 'node:path';
import { muse } from '../runtime/muse.mjs';

// --data-root flag > CHEF_DATA_ROOT > the runtime adapter's default.
export function resolveDataRoot({ flag, env = process.env, adapter = muse } = {}) {
  const raw = flag ?? env.CHEF_DATA_ROOT ?? adapter.defaultDataRoot();
  return path.resolve(raw.replace(/^~(?=$|\/)/, os.homedir()));
}
