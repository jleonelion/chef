import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combineLines, displayItems, subtractInventory } from './combine.mjs';

const use = (line, multiplier = 1, recipe = 'r') => ({ line, multiplier, recipe });
const shown = (rows) => rows.map(({ item, text }) => [item, text]);
const list = (uses, system, stock = []) => {
  const { items, covered } = subtractInventory(combineLines(uses).items, stock);
  return { items: displayItems(items, system), covered: displayItems(covered, system) };
};

test('same item in compatible units merges, scaled per meal, shown in the chosen system', () => {
  const uses = [use('1 cup rice', 2, 'a'), use('4 tbsp rice', 1, 'b')];
  assert.deepEqual(shown(list(uses, 'us').items), [['rice', '2 1/4 cups']]);
  assert.deepEqual(shown(list(uses, 'metric').items), [['rice', '550 ml']]);
  assert.deepEqual(list(uses, 'us').items[0].recipes, ['a', 'b']);
});

test('merged rows get the same unit no matter the recipe order', () => {
  const a = use('1 cup milk', 1, 'a');
  const b = use('250 ml milk', 1, 'b');
  for (const system of ['us', 'metric']) {
    assert.deepEqual(shown(list([a, b], system).items), shown(list([b, a], system).items));
  }
  assert.deepEqual(shown(list([a, b], 'us').items), [['milk', '2 1/4 cups']]);
  assert.deepEqual(shown(list([b, a], 'metric').items), [['milk', '500 ml']]);
});

test('rows keep each recipe\'s source amount and unit so the agent can answer on request', () => {
  const [row] = list([use('1 cup milk', 2, 'a'), use('250 ml milk', 1, 'b')], 'us').items;
  assert.deepEqual(row.sources, [{ recipe: 'a', amount: 2, unit: 'cup' }, { recipe: 'b', amount: 250, unit: 'ml' }]);
});

test('spoon lines stay spoons below 1/4 cup in metric too', () => {
  assert.deepEqual(shown(list([use('2 tsp cumin', 1, 'a'), use('1 tbsp cumin', 1, 'b')], 'metric').items), [['cumin', '2 tbsp']]);
});

test('units that cannot be converted are listed separately, never guessed', () => {
  const { items } = combineLines([use('1 bunch spinach'), use('150 g spinach'), use('2 clove garlic'), use('1 head garlic')]);
  assert.deepEqual(shown(displayItems(items, 'us')), [
    ['spinach', '1 bunch'],
    ['spinach', '6 oz'],
    ['garlic', '2 clove'],
    ['garlic', '1 head'],
  ]);
});

test('a bare count is "each"; lines with no quantity or a trace amount are unquantified', () => {
  const { items, unquantified } = combineLines([use('1 onion'), use('3 onion, diced'), use('salt to taste'), use('1 pinch nutmeg'), use('olive oil')]);
  assert.deepEqual(shown(displayItems(items, 'metric')), [['onion', '4 each']]);
  assert.deepEqual(unquantified.map((u) => u.item), ['salt', 'nutmeg', 'olive oil']);
});

const stock = (name, amount, unit) => ({ name, amount, unit, path: `pantry.x.${name}` });

test('inventory is subtracted in convertible units; fully covered items move to covered', () => {
  const result = list([use('500 g spaghetti'), use('3 can chickpeas'), use('2 cup milk')], 'us', [
    stock('spaghetti', 1, 'kg'), stock('chickpeas', 1, 'can'), stock('milk', 0.25, 'cup'),
  ]);
  assert.deepEqual(shown(result.items), [['chickpeas', '2 can'], ['milk', '1 3/4 cups']]);
  assert.deepEqual(result.covered.map((c) => [c.item, c.on_hand.text]), [['spaghetti', '2 1/4 lb']]);
});

test('inventory subtraction uses exact amounts, not the rounded display', () => {
  // 1.1 cup needed shows as 1 1/4 cups; 1.2 cups on hand covers it exactly.
  assert.deepEqual(shown(list([use('1.1 cup milk')], 'us', [stock('milk', 1.2, 'cup')]).covered), [['milk', '1 1/4 cups']]);
  // 1 cup + 1 tsp needed, 1 cup on hand: 1 tsp left, not the 1/4 cup rounding would leave.
  assert.deepEqual(shown(list([use('1 cup oil'), use('1 tsp oil')], 'us', [stock('oil', 1, 'cup')]).items), [['oil', '1 tsp']]);
  // 990 g needed rounds to 1 kg; 980 g on hand leaves 10 g, not 20 g.
  assert.deepEqual(shown(list([use('990 g flour')], 'metric', [stock('flour', 980, 'g')]).items), [['flour', '10 g']]);
});

test('inventory in a unit that cannot be converted is noted, not subtracted', () => {
  const [row] = list([use('150 g spinach')], 'metric', [stock('spinach', 1, 'bunch')]).items;
  assert.equal(row.text, '150 g');
  assert.deepEqual(row.on_hand, { amount: 1, unit: 'bunch', text: '1 bunch' });
});

test('citrus juice and zest by the fruit shop as the fruit', () => {
  const { items } = combineLines([use('Juice of 1 lemon', 1, 'a'), use('Zest and juice of 2 lemons', 1, 'b'), use('Zest of 1 lime', 1, 'b')]);
  assert.deepEqual(displayItems(items, 'us').map(({ item, amount, unit, recipes }) => ({ item, amount, unit, recipes })), [
    { item: 'lemon', amount: 3, unit: 'each', recipes: ['a', 'b'] },
    { item: 'lime', amount: 1, unit: 'each', recipes: ['b'] },
  ]);
});
