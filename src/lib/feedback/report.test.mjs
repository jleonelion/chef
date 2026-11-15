import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generic } from '../../runtime/generic.mjs';
import { feedbackReportProblems } from '../diagnostics/test-schemas.mjs';
import { buildBundle } from './bundle.mjs';
import { bytesFromPreview, renderPreview } from './preview.mjs';
import { editItem, newDraft, removeItem, serialize } from './report.mjs';

const event = (n, minute, extra = {}) => ({
  schema_version: 1,
  invocation_id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`,
  started_at: `2026-11-15T10:0${minute}:00.000Z`,
  duration_ms: 40,
  chef_version: '1.1.0',
  skill_id: 'chef-recipe-search',
  script_id: 'recipe-search',
  operation: 'search',
  outcome: 'ok',
  error_code: null,
  runtime: 'unknown',
  adapter_version: 1,
  facts: { results: 0 },
  ...extra,
});
const bundle = () =>
  buildBundle({
    events: [event(1, 1), event(2, 2), event(3, 3, { outcome: 'internal-error', error_code: 'unclassified', facts: {} })],
    adapter: generic,
    traceOn: true,
    skills: [{ id: 'chef-recipe-search', version: '1.1.0' }],
    engine: { name: 'node', version: '22.21.1' },
    platform: 'linux',
  });
const defect = (overrides = {}) =>
  newDraft({
    class: 'defect',
    summary: 'Recipe search finds nothing for a dairy item',
    expected: 'Recipes that use the item',
    actual: 'An empty list',
    frequency: 'always',
    skill_ids: ['chef-recipe-search'],
    bundle: bundle(),
    ...overrides,
  });
const numberOf = (preview, path) => Number(preview.match(new RegExp(`^\\[\\s*(\\d+)\\] ${path.replace(/[[\]]/g, '\\$&')} = `, 'm'))?.[1]);

test('a defect draft is a schema-valid, user-initiated report with nothing removed yet', () => {
  const { report } = defect();
  assert.deepEqual(feedbackReportProblems(report), []);
  assert.equal(report.trigger, 'user-initiated');
  assert.deepEqual(report.removed_fields, []);
  assert.match(report.submission_nonce, /^[0-9a-f-]{36}$/);
  assert.equal('report_id' in report, false);
});

test('the preview is lossless: bytes -> preview -> the same bytes', () => {
  const draft = defect({ summary: 'Quotes " and = signs, a\nnewline and ünïcode' });
  assert.equal(bytesFromPreview(renderPreview(draft)), serialize(draft.report));
  const trimmed = removeItem(removeItem(draft, numberOf(renderPreview(draft), 'diagnostic_bundle.events[inv-2]')), numberOf(renderPreview(draft), 'skill_ids'));
  assert.equal(bytesFromPreview(renderPreview(trimmed)), serialize(trimmed.report));
});

test('the preview is deterministic', () => {
  const draft = defect();
  assert.equal(renderPreview(draft), renderPreview(structuredClone(draft)));
});

test('removing an item keeps every other number and records it in removed_fields', () => {
  const draft = defect();
  const before = renderPreview(draft);
  const n = numberOf(before, 'diagnostic_bundle.events[inv-2]');
  const after = renderPreview(removeItem(draft, n));
  assert.ok(!after.includes(`[${String(n).padStart(2)}]`), 'the removed number leaves a gap');
  for (const path of ['summary', 'diagnostic_bundle.events[inv-1]', 'diagnostic_bundle.events[inv-3]', 'submission_nonce']) {
    assert.equal(numberOf(after, path), numberOf(before, path), path);
  }
  assert.deepEqual(removeItem(draft, n).report.removed_fields, ['diagnostic_bundle.events[inv-2]']);
  assert.match(after, /^Not sent \(you removed\): diagnostic_bundle\.events\[inv-2\]$/m);
});

test('removing the whole bundle records only the bundle', () => {
  const draft = defect();
  const withoutEvent = removeItem(draft, numberOf(renderPreview(draft), 'diagnostic_bundle.events[inv-2]'));
  const withoutBundle = removeItem(withoutEvent, numberOf(renderPreview(draft), 'diagnostic_bundle'));
  assert.equal('diagnostic_bundle' in withoutBundle.report, false);
  assert.deepEqual(withoutBundle.report.removed_fields, ['diagnostic_bundle']);
  assert.deepEqual(feedbackReportProblems(withoutBundle.report), []);
});

test('any change mints a new submission nonce; the draft it came from is unchanged', () => {
  const draft = defect();
  const edited = editItem(draft, numberOf(renderPreview(draft), 'summary'), 'Search misses a dairy item');
  assert.notEqual(edited.report.submission_nonce, draft.report.submission_nonce);
  assert.equal(edited.report.summary, 'Search misses a dairy item');
  assert.equal(draft.report.summary, 'Recipe search finds nothing for a dairy item');
  assert.notEqual(removeItem(draft, numberOf(renderPreview(draft), 'skill_ids')).report.submission_nonce, draft.report.submission_nonce);
});

test('required fields are edit-only, and evidence is neither editable nor invented', () => {
  const draft = defect();
  const preview = renderPreview(draft);
  for (const path of ['summary', 'expected', 'class', 'submission_nonce', 'removed_fields', 'diagnostic_bundle.evidence_gaps']) {
    assert.throws(() => removeItem(draft, numberOf(preview, path)), /cannot be removed/, path);
  }
  for (const path of ['diagnostic_bundle.events[inv-1]', 'class', 'submission_nonce']) {
    assert.throws(() => editItem(draft, numberOf(preview, path), 'x'), /cannot be edited/, path);
  }
  assert.throws(() => editItem(draft, numberOf(preview, 'frequency'), 'often'), /frequency/);
  assert.throws(() => removeItem(draft, 999), /no item 999/);
});

test('preview shows what was not observed', () => {
  assert.match(renderPreview(defect()), /^Not observed: .*\(correlation_unavailable\)/m);
});

test('the pattern scan flags personal details in user-approved text and changes nothing', () => {
  const email = `sam${'@'}gmail.com`;
  const draft = defect({ actual: `It emailed ${email} and showed /Users/sam/recipes` });
  const preview = renderPreview(draft);
  const n = numberOf(preview, 'actual');
  assert.match(preview, new RegExp(`^Check item ${n} \\(actual\\): may contain an email address, a file path\\.`, 'm'));
  assert.ok(draft.report.actual.includes(email), 'never edited silently');
  assert.equal(bytesFromPreview(preview), serialize(draft.report));
});

test('oversized text is refused by the same limits feedback intake uses', () => {
  const tooLong = 'a'.repeat(501);
  assert.throws(() => defect({ summary: tooLong }), /summary: at most 500 characters/);
  const { report } = defect();
  assert.notDeepEqual(feedbackReportProblems({ ...report, summary: tooLong }), []);
  assert.throws(() => defect({ expected: 'b'.repeat(2001) }), /expected: at most 2000 characters/);
});

test('an oversized payload is refused at the schema byte limit', () => {
  const { report } = defect();
  const wideFacts = Object.fromEntries(Array.from({ length: 16 }, (_, j) => [`f${j}`.padEnd(64, 'x'), 'v'.repeat(64)]));
  const events = Array.from({ length: 50 }, (_, i) => ({ ...report.diagnostic_bundle.events[0], invocation_id: `inv-${i + 1}`, facts: wideFacts }));
  const big = { ...report, diagnostic_bundle: { ...report.diagnostic_bundle, events } };
  assert.ok(Buffer.byteLength(JSON.stringify(big)) > 65536);
  assert.match(feedbackReportProblems(big).join('\n'), /over 65536/);
  assert.throws(() => newDraft({ class: 'defect', summary: 's', expected: 'e', actual: 'a', frequency: 'once', bundle: big.diagnostic_bundle }), /over 65536 bytes/);
});
