import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const ajv = new Ajv({ allErrors: true });
const validators = new Map(
  [2, 3].map((format) => {
    const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'schemas', 'evals', `agentic-result.v${format}.json`), 'utf8'));
    return [format, ajv.compile(schema)];
  }),
);

export function validateResult(result) {
  const validate = validators.get(result?.format);
  if (!validate) return [`/format unsupported result format ${result?.format}`];
  if (validate(result)) return [];
  return validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`);
}
