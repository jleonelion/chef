import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftFromHtml, htmlToText, minutesFromIso } from './jsonld.mjs';

const page = (data) => `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body><p>Hi &amp; bye</p></body></html>`;

test('minutesFromIso reads schema.org durations', () => {
  assert.equal(minutesFromIso('PT15M'), 15);
  assert.equal(minutesFromIso('PT1H30M'), 90);
  assert.equal(minutesFromIso('P1DT2H'), 1560);
  assert.equal(minutesFromIso('PT0S'), 0);
  assert.equal(minutesFromIso('15 minutes'), undefined);
  assert.equal(minutesFromIso(undefined), undefined);
});

test('maps a Recipe in an @graph to a draft', () => {
  const html = page({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'ignored' },
      {
        '@type': ['Recipe'],
        name: 'Garlic &amp; Herb <b>Rice</b>',
        description: 'Fluffy rice.',
        recipeYield: ['4', '4 servings'],
        prepTime: 'PT5M',
        cookTime: 'PT20M',
        recipeCuisine: ['Persian'],
        keywords: 'rice, side dish',
        recipeIngredient: ['1 cup rice', '2 cloves garlic'],
        recipeInstructions: [
          { '@type': 'HowToSection', name: 'Cook', itemListElement: [{ '@type': 'HowToStep', text: 'Rinse rice.' }, { '@type': 'HowToStep', text: 'Simmer.' }] },
          'Fluff with a fork.',
        ],
      },
    ],
  });
  assert.deepEqual(draftFromHtml(html), {
    title: 'Garlic & Herb Rice',
    description: 'Fluffy rice.',
    servings: 4,
    prep_minutes: 5,
    cook_minutes: 20,
    cuisine: 'Persian',
    tags: ['rice', 'side dish'],
    ingredients: ['1 cup rice', '2 cloves garlic'],
    steps: ['Rinse rice.', 'Simmer.', 'Fluff with a fork.'],
  });
});

test('splits a single instructions string into steps', () => {
  const draft = draftFromHtml(page({ '@type': 'Recipe', name: 'X', recipeIngredient: ['a'], recipeInstructions: 'Mix.\nBake.' }));
  assert.deepEqual(draft.steps, ['Mix.', 'Bake.']);
});

test('returns null when no Recipe JSON-LD exists or it is malformed', () => {
  assert.equal(draftFromHtml('<html><script type="application/ld+json">{bad</script></html>'), null);
  assert.equal(draftFromHtml(page({ '@type': 'Article', name: 'Not a recipe' })), null);
});

test('htmlToText drops scripts and tags and decodes entities', () => {
  assert.equal(htmlToText('<head><title>t</title></head><script>x()</script><h2>Soup</h2><ul><li>salt &amp; pepper</li></ul>'), '## Soup\n- salt & pepper');
});
