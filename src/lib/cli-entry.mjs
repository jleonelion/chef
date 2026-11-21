import { fileURLToPath } from 'node:url';

export const isDirectExecution = (url) => process.argv[1] !== undefined && process.argv[1] === fileURLToPath(url);

export const invalidMode = (mode, modes, dataRoot) => ({
  status: 'invalid-input',
  ...(dataRoot && { data_root: dataRoot }),
  problems: [`unsupported command "${mode ?? ''}"; supported commands: ${modes.join(', ')}`],
});
