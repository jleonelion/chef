// The canonical preview of a feedback report draft: one numbered line per item, `[n] path = json`,
// in payload order. It is lossless, so the bytes Chef sends are parsed back from the preview the
// user approved. Lines without a number are notes (removed, not observed, scan matches) and are
// never part of the payload.
import { scanPii } from '../pii-scan.mjs';

// Parts shown item by item; everything else is one line holding its whole value.
const CONTAINERS = new Set(['diagnostic_bundle', 'diagnostic_bundle.environment', 'diagnostic_bundle.events']);
export const TEXT_FIELDS = ['summary', 'expected', 'actual', 'desired_outcome', 'current_behavior', 'desired_behavior'];
const ITEM_LINE = /^\[\s*\d+\] (\S+) = (.*)$/;
const GAPS = {
  pre_launch_unobserved: 'what happened before a Chef script started',
  host_action_unconfirmed: 'whether the runtime carried out what a script asked',
  post_return_unobserved: 'what happened after a script returned',
  runtime_extension_unavailable: 'evidence from the runtime itself',
  correlation_unavailable: 'which conversation turn each run belonged to',
  trace_unavailable: 'Chef script runs (the invocation trace is off)',
};
const RULE_NAMES = {
  email: 'an email address',
  phone: 'a phone number',
  'street address': 'a street address',
  url: 'a URL',
  'file path': 'a file path',
  'long digit run': 'a long number',
};

function walk(node, prefix, items) {
  for (const [key, value] of Object.entries(node)) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (!CONTAINERS.has(id)) items.push({ id, value });
    else if (Array.isArray(value)) {
      items.push({ id, value: [] });
      for (const element of value) items.push({ id: `${id}[${element.invocation_id}]`, value: element });
    } else {
      items.push({ id, value: {} });
      walk(value, id, items);
    }
  }
  return items;
}

// The report's items in payload order: { id, value }.
export const itemsOf = (report) => walk(report, '', []);

function itemLine(numbers, { id, value }) {
  if (!Object.hasOwn(numbers, id)) throw new Error(`item ${id} has no number in this draft`);
  return `[${String(numbers[id]).padStart(2)}] ${id} = ${JSON.stringify(value)}`;
}

function scanNotes(numbers, report) {
  return TEXT_FIELDS.filter((field) => typeof report[field] === 'string').flatMap((field) => {
    const rules = [...new Set(scanPii(report[field]).map((finding) => finding.rule))];
    if (!rules.length) return [];
    const what = rules.map((rule) => RULE_NAMES[rule] ?? rule).join(', ');
    return [`Check item ${numbers[field]} (${field}): may contain ${what}. Chef changed nothing; ask to edit or remove it if it is personal.`];
  });
}

// Shown while the diagnostics it explains are still in the report.
function fallbackNote(report, fallback) {
  if (!fallback || !report.diagnostic_bundle) return [];
  const missing = fallback.skill ? `runs of ${fallback.skill}` : 'Chef runs';
  const runs = report.diagnostic_bundle.events.length;
  const taken = runs === 1 ? 'this is the last run' : `these are the last ${runs} runs`;
  return [`Diagnostics: no ${missing} in the last hour, so ${taken} of any skill. Ask to drop them if they don't help.`];
}

export function renderPreview({ report, numbers, notes = {} }) {
  const gaps = report.diagnostic_bundle?.evidence_gaps ?? [];
  return [
    `Chef feedback report (${report.class}, ${report.trigger}). Nothing has been sent.`,
    'Each numbered line is exactly what the report holds. Ask to remove or change an item by its number.',
    '',
    ...itemsOf(report).map((item) => itemLine(numbers, item)),
    '',
    ...report.removed_fields.map((field) => `Not sent (you removed): ${field}`),
    ...gaps.map((gap) => `Not observed: ${GAPS[gap]} (${gap})`),
    ...fallbackNote(report, notes.diagnostics_fallback),
    ...scanNotes(numbers, report),
  ].join('\n');
}

// Where an item id points: its parent node and either a key or an array element.
// `diagnostic_bundle.events[inv-2]` -> { parent: bundle, key: 'events', element: 'inv-2' }.
export function locate(root, id) {
  const segments = id.split('.');
  const last = segments.pop();
  const parent = segments.reduce((node, key) => node[key], root);
  const element = /^([a-z_]+)\[([^\]]+)\]$/.exec(last);
  return element ? { parent, key: element[1], element: element[2] } : { parent, key: last };
}

function place(root, id, value) {
  const { parent, key, element } = locate(root, id);
  if (element) parent[key].push(value);
  else parent[key] = value;
}

// The exact payload bytes a preview shows.
export function bytesFromPreview(text) {
  const root = {};
  for (const line of text.split('\n')) {
    const match = ITEM_LINE.exec(line);
    if (match) place(root, match[1], JSON.parse(match[2]));
  }
  return JSON.stringify(root);
}
