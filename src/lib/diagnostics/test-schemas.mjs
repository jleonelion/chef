// Test helper: JSON Schema validators built from schemas/feedback/, the single source of the
// feedback artifact shapes. Needs ajv from node_modules, so only tests import it.
import Ajv from 'ajv/dist/2020.js';
import bundle from '../../../schemas/feedback/diagnostic-bundle.v1.json' with { type: 'json' };
import report from '../../../schemas/feedback/feedback-report.v1.json' with { type: 'json' };
import event from '../../../schemas/feedback/invocation-event.v1.json' with { type: 'json' };
import trace from '../../../schemas/feedback/invocation-trace.v1.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addVocabulary(['x-max-bytes', 'x-max-age-days']);
for (const schema of [event, trace, bundle, report]) ajv.addSchema(schema);

function validator(id) {
  const validate = ajv.getSchema(id);
  return (value) => (validate(value) ? [] : validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`));
}

export const invocationEventProblems = validator(event.$id);
export const invocationTraceProblems = validator(trace.$id);
export const diagnosticBundleProblems = validator(bundle.$id);
const reportShapeProblems = validator(report.$id);

// The report schema's byte limit is an x- keyword, so it is checked here as feedback intake will.
export function feedbackReportProblems(value) {
  const problems = reportShapeProblems(value);
  const bytes = Buffer.byteLength(JSON.stringify(value));
  return bytes > report['x-max-bytes'] ? [...problems, `/ is ${bytes} bytes, over ${report['x-max-bytes']}`] : problems;
}
