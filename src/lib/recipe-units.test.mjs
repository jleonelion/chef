import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertRecipeBody } from './recipe-units.mjs';

const recipe = (ingredients, steps = ['Cook.']) =>
  `# Test\n\n## Ingredients\n\n${ingredients.map((line) => `- ${line}`).join('\n')}\n\n## Steps\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`;
const lines = (body, heading) => body.split(/^## /m).find((part) => part.startsWith(heading)).split('\n').slice(1).filter(Boolean);

test('metric shows US weights and volumes converted, the original in parens, under a note', () => {
  const body = convertRecipeBody(recipe(['1 cup milk', '8 oz cheddar, grated', '2 lb potatoes', '1 onion']), 'metric');
  assert.deepEqual(lines(body, 'Ingredients'), [
    "Amounts converted to metric units; steps keep the recipe's original amounts.",
    '- 235 ml (1 cup) milk',
    '- 225 g (8 oz) cheddar, grated',
    '- 910 g (2 lb) potatoes',
    '- 1 onion',
  ]);
});

test('US shows metric amounts in kitchen steps', () => {
  const body = convertRecipeBody(recipe(['400 g crushed tomatoes', '120 ml olive oil', '1 kg flour']), 'us');
  assert.deepEqual(lines(body, 'Ingredients').slice(1), ['- 14 oz (400 g) crushed tomatoes', '- 0.5 cup (120 ml) olive oil', '- 2.25 lb (1 kg) flour']);
  assert.match(lines(body, 'Ingredients')[0], /^Amounts converted to US units;/);
});

test('spoons below 1/4 cup and amounts already in the system are shown as written', () => {
  const source = recipe(['1 tsp cumin', '2 tbsp olive oil', '1 cup rice'], ['Cook at 350°F.']);
  assert.equal(convertRecipeBody(source, 'us'), source);
  const metric = convertRecipeBody(recipe(['2 tbsp olive oil', '8 tbsp butter', '200 g spinach']), 'metric');
  assert.deepEqual(lines(metric, 'Ingredients').slice(1), ['- 2 tbsp olive oil', '- 120 ml (8 tbsp) butter', '- 200 g spinach']);
});

test('lines that cannot be read or converted are shown as written; no note when nothing changed', () => {
  const source = recipe(['2-3 cups stock', '1 (15 oz) can chickpeas', 'salt to taste', '2 cloves garlic']);
  assert.equal(convertRecipeBody(source, 'metric'), source);
});

test('oven temperatures in steps get the household scale, rounded to the nearest 5', () => {
  const steps = ['Heat the oven to 350°F.', 'Or 400 degrees F for crisp.', 'Rest at 350 degrees.', 'Gas mark 4 works.', 'Already 180 °C.'];
  const metric = lines(convertRecipeBody(recipe(['1 onion'], steps), 'metric'), 'Steps');
  assert.deepEqual(metric, ['1. Heat the oven to 350°F (175°C).', '2. Or 400 degrees F (205°C) for crisp.', '3. Rest at 350 degrees.', '4. Gas mark 4 works.', '5. Already 180 °C.']);
  const us = lines(convertRecipeBody(recipe(['1 onion'], ['Bake at 180 °C, then 220°C.', 'Keep 350°F.']), 'us'), 'Steps');
  assert.deepEqual(us, ['1. Bake at 180 °C (355°F), then 220°C (430°F).', '2. Keep 350°F.']);
});

test('a temperature that already carries its conversion is left alone', () => {
  const source = recipe(['1 onion'], ['Heat to 350°F (175°C).']);
  assert.equal(convertRecipeBody(source, 'metric'), source);
  assert.equal(convertRecipeBody(source, 'us'), source);
});
