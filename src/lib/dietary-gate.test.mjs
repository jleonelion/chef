import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gateRecipe } from './dietary-gate.mjs';
import { rulesetFromPage } from './dietary-ruleset.mjs';

const ruleset = (...members) => rulesetFromPage({ type: 'dietary-ruleset', members });
const alex = (hard, avoidances = []) => ({ name: 'Alex Example', hard_constraints: hard, avoidances });
const recipe = (ingredients, extra = {}) => ({
  slug: 'dish',
  frontmatter: { type: 'recipe', title: 'Dish', dietary_flags: [], ...extra },
  body: `# Dish\n\n## Ingredients\n\n${ingredients.map((i) => `- ${i}`).join('\n')}\n\n## Steps\n\n1. Cook.\n`,
});
const whys = (verdict) => verdict.reasons.map((r) => r.why);

test('no ruleset or no rules: nothing is excluded', () => {
  assert.equal(gateRecipe(recipe(['1 egg']), rulesetFromPage({ type: 'dietary-ruleset' })).excluded, false);
  assert.equal(gateRecipe(recipe(['1 egg'], { dietary_flags: undefined }), ruleset()).excluded, false);
});

test('excluded when flagged, even if the wording no longer shows it', () => {
  const verdict = gateRecipe(recipe(['1 cup rice'], { dietary_flags: ['contains-sesame'] }), ruleset(alex(['sesame'])));
  assert.equal(verdict.excluded, true);
  assert.deepEqual(verdict.reasons, [{ member: 'Alex Example', constraint: 'sesame', why: 'flagged', detail: 'contains-sesame' }]);
});

test('excluded when the ingredient text matches, even if stored flags are stale', () => {
  const verdict = gateRecipe(recipe(['2 tbsp peanut butter', '1 cup rice']), ruleset(alex(['peanuts'])));
  assert.deepEqual(verdict.reasons, [{ member: 'Alex Example', constraint: 'peanuts', why: 'ingredient-text', detail: '2 tbsp peanut butter' }]);
});

test('gluten-free wording never clears a match', () => {
  assert.deepEqual(whys(gateRecipe(recipe(['200 g gluten-free spaghetti']), ruleset(alex(['gluten'])))), ['ingredient-text']);
});

test('constraints outside the flag set match on ingredient text only', () => {
  const r = ruleset(alex(['mustard']));
  assert.deepEqual(whys(gateRecipe(recipe(['1 tsp Dijon mustard']), r)), ['ingredient-text']);
  assert.equal(gateRecipe(recipe(['1 onion'], { dietary_flags: undefined }), r).excluded, false);
});

test('excluded when flags were never checked, until the user verifies that constraint', () => {
  const r = ruleset(alex(['gluten']));
  assert.deepEqual(whys(gateRecipe(recipe(['1 onion'], { dietary_flags: undefined }), r)), ['not-checked']);
  const verified = recipe(['1 onion'], { dietary_flags: undefined, verified_by_user: { gluten: '2026-11-07' } });
  assert.equal(gateRecipe(verified, r).excluded, false);
  const otherConstraint = recipe(['1 onion'], { dietary_flags: undefined, verified_by_user: { dairy: '2026-11-07' } });
  assert.equal(gateRecipe(otherConstraint, r).excluded, true);
});

test('a verification never clears a conflict the recipe shows', () => {
  const r = ruleset(alex(['gluten']));
  const verdict = gateRecipe(recipe(['200 g spaghetti'], { verified_by_user: { gluten: '2026-11-07' } }), r);
  assert.deepEqual(whys(verdict), ['ingredient-text']);
});

test('excluded when there is no ingredient list to check', () => {
  const r = ruleset(alex(['mustard']));
  const empty = { slug: 'dish', frontmatter: { type: 'recipe', title: 'Dish', dietary_flags: [] }, body: '# Dish\n' };
  assert.deepEqual(whys(gateRecipe(empty, r)), ['no-ingredients']);
});

test('with auto flags not trusted, every flag-set constraint needs a verification', () => {
  const r = ruleset(alex(['gluten']));
  assert.deepEqual(whys(gateRecipe(recipe(['1 onion']), r, { autoFlagsCount: false })), ['unverified']);
  assert.equal(gateRecipe(recipe(['1 onion'], { verified_by_user: { gluten: '2026-11-07' } }), r, { autoFlagsCount: false }).excluded, false);
});

test('an override lifts only that member and constraint, for this call', () => {
  const r = ruleset(alex(['dairy']), { name: 'Sam Example', hard_constraints: ['egg'] });
  const dish = recipe(['30 g parmesan', '1 egg'], { dietary_flags: ['contains-dairy', 'contains-egg'] });
  const verdict = gateRecipe(dish, r, { overrides: [{ member: 'Alex Example', constraint: 'dairy' }] });
  assert.equal(verdict.excluded, true);
  assert.deepEqual([...new Set(verdict.reasons.map((x) => x.constraint))], ['egg']);
  assert.deepEqual([...new Set(verdict.overridden.map((x) => x.constraint))], ['dairy']);
  assert.equal(gateRecipe(dish, r).overridden.length, 0);
});

test('avoidances are reported, never excluded', () => {
  const verdict = gateRecipe(recipe(['1 bunch cilantro']), ruleset(alex([], ['cilantro'])));
  assert.equal(verdict.excluded, false);
  assert.deepEqual(verdict.avoidances, [{ member: 'Alex Example', avoidance: 'cilantro', detail: '1 bunch cilantro' }]);
});

test('an unreadable ruleset leaves every recipe out', () => {
  const verdict = gateRecipe(recipe(['1 onion']), rulesetFromPage({ type: 'dietary-ruleset', members: 'everyone' }));
  assert.deepEqual(whys(verdict), ['ruleset-unreadable']);
});
