import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanPii } from './pii-scan.mjs';

const rules = (text) => scanPii(text).map((finding) => finding.rule);

test('flags each planted kind of personal detail', () => {
  assert.deepEqual(rules(`mail sam.k${'@'}gmail.com`), ['email']);
  assert.deepEqual(rules('call (415) 555-0134 or +1 415.555.0134'), ['phone', 'phone']);
  assert.deepEqual(rules('lives at 42 Maple Grove Street'), ['street address']);
  assert.deepEqual(rules('see https://myblog.net/recipes/1'), ['url']);
  assert.deepEqual(rules('file /Users/sam/Desktop/chef.json and C:\\Users\\sam\\x'), ['file path', 'file path']);
  assert.deepEqual(rules('card 4111111111111111'), ['long digit run']);
});

test('lets synthetic fixture data through', () => {
  const synthetic = [
    'Send to shopper@example.com, from https://recipes.example.com/soup or http://example.org',
    '1 cup red lentils, 400 g crushed tomatoes, 2 Large Eggs',
    'Saved 2026-01-15 as 20260115-lemon-garlic-pasta.txt in knowledge/raw/receipts, id a86049add033951e',
    '{data_root}/settings.json and ../receipt.txt',
    '{"@context": "https://schema.org", "$schema": "https://json-schema.org/draft/2020-12/schema"}',
  ].join('\n');
  assert.deepEqual(scanPii(synthetic), []);
});

test('findings name the line and rule, never the matched text', () => {
  assert.deepEqual(scanPii(`ok\nmail sam.k${'@'}gmail.com`), [{ line: 2, rule: 'email' }]);
});
