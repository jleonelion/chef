// Test helper: JSON Schema validators built from schemas/feedback/, the single source of the
// feedback artifact shapes. Needs ajv from node_modules, so only tests import it.
import Ajv from 'ajv/dist/2020.js';
import event from '../../../schemas/feedback/invocation-event.v1.json' with { type: 'json' };
import trace from '../../../schemas/feedback/invocation-trace.v1.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addVocabulary(['x-max-bytes', 'x-max-age-days']);
ajv.addSchema(event);
ajv.addSchema(trace);

function validator(id) {
  const validate = ajv.getSchema(id);
  return (value) => (validate(value) ? [] : validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`));
}

export const invocationEventProblems = validator(event.$id);
export const invocationTraceProblems = validator(trace.$id);
