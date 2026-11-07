import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUARANTEE_LINE, SAFETY_SCREEN, TRAINING_NOTICE } from './safety-text.mjs';

test('the guarantee line is the spec wording, word for word', () => {
  assert.equal(
    GUARANTEE_LINE,
    "Chef never suggests a recipe that its ingredient list shows conflicts with a hard constraint you've declared, and leaves out recipes it can't verify. It can't see product labels, brands, or cross-contact, so always check labels.",
  );
});

test('the safety screen covers medical advice, the guarantee line and the training setting', () => {
  assert.equal(SAFETY_SCREEN.length, 3);
  assert.match(SAFETY_SCREEN[0], /not medical advice/);
  assert.equal(SAFETY_SCREEN[1], GUARANTEE_LINE);
  assert.match(SAFETY_SCREEN[2], /Help improve our AI models.*https:\/\//);
  assert.match(TRAINING_NOTICE, /data root.*https:\/\//);
});
