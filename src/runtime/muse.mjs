// Muse runtime adapter: the only place that knows runtime specifics. Other runtimes
// (Claude Code, Muse Code) reuse it and override the data root with CHEF_DATA_ROOT.
import os from 'node:os';
import path from 'node:path';

const LOCALE_VARS = ['LC_ALL', 'LC_MEASUREMENT', 'LANG'];
const isUsable = (value) => Boolean(value) && value !== 'C' && value !== 'POSIX' && !value.startsWith('C.');

export const muse = {
  name: 'muse',
  defaultDataRoot: () => path.join(os.homedir(), 'workspace', 'chef'),
  locale(env = process.env) {
    const fromEnv = LOCALE_VARS.map((name) => env[name]).find(isUsable);
    return fromEnv ?? Intl.DateTimeFormat().resolvedOptions().locale;
  },
};
