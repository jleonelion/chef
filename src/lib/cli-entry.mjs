import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const canonicalPath = (file) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};

export const isDirectExecution = (url, entry = process.argv[1]) => entry !== undefined
  && canonicalPath(entry) === canonicalPath(fileURLToPath(url));

export const invalidMode = (mode, modes, dataRoot) => ({
  status: 'invalid-input',
  ...(dataRoot && { data_root: dataRoot }),
  problems: [`unsupported command "${mode ?? ''}"; supported commands: ${modes.join(', ')}`],
});
