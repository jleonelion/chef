import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'schemas', 'evals', 'agentic-result.v2.json'), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

export function validateResult(result) {
  if (validate(result)) return [];
  return validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`);
}
