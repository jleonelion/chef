import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanReply } from './deny-list.mjs';

test('deny-list catches internal script and environment vocabulary', () => {
  assert.deepEqual(scanReply('Run scripts/add-recipe.mjs from CHEF_DATA_ROOT.'), [
    'CHEF_DATA_ROOT',
    'scripts/',
  ]);
  assert.deepEqual(scanReply('The planning monologue exposes internal tool names.'), [
    'planning monologue',
  ]);
});

test('deny-list does not fire for ordinary product language', () => {
  assert.deepEqual(scanReply('Chef saved the recipe and planned the week.'), []);
  assert.deepEqual(scanReply('chef-add-recipe is a skill name'), []);
});
