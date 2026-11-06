import os from 'node:os';
import path from 'node:path';

// Muse's default; other runtimes pass --data-root or set CHEF_DATA_ROOT.
export const DEFAULT_DATA_ROOT = path.join(os.homedir(), 'workspace', 'chef');

export function resolveDataRoot({ flag, env = process.env } = {}) {
  const raw = flag ?? env.CHEF_DATA_ROOT ?? DEFAULT_DATA_ROOT;
  return path.resolve(raw.replace(/^~(?=$|\/)/, os.homedir()));
}
