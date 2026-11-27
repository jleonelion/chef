import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkResponse, checkScripts, checkSkills } from './report.mjs';
import { runRep } from './run.mjs';

const rows = JSON.parse(fs.readFileSync(new URL('./rows.json', import.meta.url), 'utf8'));
const missingPlan = rows.find(({ id }) => id === 'chef-meal-logging-plan-absent-logs-nothing');
const fallback = rows.find(({ id }) => id === 'chef-meal-logging-from-plan-no-plan');
const dormant = rows.find(({ id }) => id === 'chef-health-goals-check-in-goal-unset-stays-dormant');
const shopping = rows.find(({ id }) => id === 'chef-shopping-lists-natural-from-plan');
const dairyRefusal = rows.find(({ id }) => id === 'chef-meal-planning-dairy-constraint-present-refuses');
const dairyRefusalReply = 'No dinners were saved. Creamy Tomato Soup conflicts with the declared dairy constraint. Which safe saved recipe should replace it?';
const noPlanReply = 'There is no planned lunch for January 21, 2026. What did you eat and how many servings? I need those details before I can propose a manual meal-log entry.';
const lookup = { script: 'scripts/meal-planning.mjs', args: ['today', '--date', '2026-01-21'] };
const shoppingText = `# Shopping list: week of 2026-01-19

- 1.5 can chickpeas
- 0.75 each onion
- 1.5 clove garlic
- 11 oz crushed tomatoes
- 4 oz spinach (on hand: 1 bunch)
- 1 tsp ground cumin

No dietary constraints recorded. Tell me about any allergies or foods someone must never eat.
`;
const onHandCheck = 'Please check whether your 1 bunch of spinach covers the 4 oz needed; Chef cannot compare bunches with ounces.';

async function replay(t, row, act) {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-read-only-replay-'));
  t.after(() => fs.rmSync(logDir, { recursive: true, force: true }));
  const harness = {
    prepare({ env, workdir, pluginDir }) {
      t.after(() => fs.rmSync(workdir, { recursive: true, force: true }));
      const skillsDir = path.join(workdir, 'skills');
      fs.cpSync(path.join(pluginDir, 'skills'), skillsDir, { recursive: true });
      let index = 0;
      return {
        env, skillsDir,
        async runTurn() {
          const scriptRuns = [];
          const invoke = (skill, script, args, input) => {
            scriptRuns.push({ script: `scripts/${script}`, args });
            const result = spawnSync(process.execPath, [
              path.join(skillsDir, skill, 'scripts', script), ...args,
            ], { env, encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input) });
            assert.ok([0, 2].includes(result.status), result.stderr);
            return JSON.parse(result.stdout);
          };
          const turn = await act(index++, invoke, env);
          return {
            transcript: JSON.stringify({ scriptRuns, toolCalls: [], ...turn }),
            ext: 'json', exitCode: 0, stderr: '', timedOut: false, signal: null,
          };
        },
      };
    },
    project: JSON.parse,
  };
  const { judge, ...behaviorRow } = row;
  return runRep(behaviorRow, 1, { harness, logDir });
}

test('dietary refusal permits relevant skill reads after checking the real recipe gate', async (t) => {
  const run = await replay(t, dairyRefusal, (index, invoke) => {
    const output = invoke('chef-recipe-search', 'recipe-search.mjs', ['search', '--query', 'creamy tomato soup']);
    assert.ok(output.excluded.some(({ slug }) => slug === 'creamy-tomato-soup'));
    assert.equal(invoke('chef-meal-planning', 'meal-planning.mjs', ['today', '--date', '2026-01-19']).status, 'no-plan');
    return { response: dairyRefusalReply, skills: ['chef-recipe-search', 'chef-meal-planning'] };
  });
  assert.equal(run.outcome, 'pass', JSON.stringify(run.failures ?? run.invalid));
});

test('dietary refusal requires its gate and rejects override-bearing or non-read calls', () => {
  const search = { script: 'scripts/recipe-search.mjs', args: ['search'] };
  assert.throws(() => checkScripts([], dairyRefusal.scripts), /recipe-search.mjs search did not run/);
  for (const run of [
    { script: 'scripts/meal-planning.mjs', args: ['plan', '--week-start', '2026-01-19', '--override', 'Alex Example:dairy'] },
    { script: 'scripts/recipe-search.mjs', args: ['search', '--override', 'Alex Example:dairy'] },
    { script: 'scripts/meal-planning.mjs', args: ['today', '--override=Alex Example:dairy'] },
    { script: 'scripts/inventory.mjs', args: ['edit', '--path', 'fridge.dairy.whole_milk', '--amount', '0'] },
  ]) {
    assert.throws(() => checkScripts([search, run], dairyRefusal.scripts), (error) => error.check === 'scripts');
  }
  checkResponse(dairyRefusalReply, dairyRefusal.responses[0]);
  for (const reply of ['', 'I cannot do that.', dairyRefusalReply.replace('Creamy Tomato Soup', 'Another recipe'), dairyRefusalReply.replace('dairy', 'sesame')]) {
    assert.throws(() => checkResponse(reply, dairyRefusal.responses[0]), (error) => error.check === 'response');
  }
});

test('dietary refusal permits the refused plan attempt and detects a saved plan', async (t) => {
  const attempt = (invoke) => {
    invoke('chef-recipe-search', 'recipe-search.mjs', ['search', '--query', 'creamy tomato soup']);
    return invoke('chef-meal-planning', 'meal-planning.mjs', ['plan', '--week-start', '2026-01-19'], [
      { date: '2026-01-19', slot: 'dinner', recipe: 'creamy-tomato-soup' },
    ]);
  };
  const run = await replay(t, dairyRefusal, (index, invoke) => {
    assert.equal(attempt(invoke).status, 'refused');
    return { response: dairyRefusalReply, skills: ['chef-recipe-search', 'chef-meal-planning'] };
  });
  assert.equal(run.outcome, 'pass', JSON.stringify(run.failures ?? run.invalid));
  const saved = await replay(t, dairyRefusal, (index, invoke, env) => {
    attempt(invoke);
    const plans = path.join(env.CHEF_DATA_ROOT, 'knowledge/wiki/meal-plans');
    fs.mkdirSync(plans, { recursive: true });
    fs.writeFileSync(path.join(plans, '2026-01-19.md'), 'saved\n');
    return { response: dairyRefusalReply, skills: ['chef-recipe-search', 'chef-meal-planning'] };
  });
  assert.equal(saved.outcome, 'failed', JSON.stringify(saved.invalid));
  assert.ok(saved.failures.some(({ check }) => check === 'files'), JSON.stringify(saved.failures));
});

test('dietary refusal protects stored data, household rules and settings', async (t) => {
  for (const relative of ['data/food-inventory/current.json', 'knowledge/wiki/household/dietary-ruleset.md', 'settings.json']) {
    await t.test(relative, async (t) => {
      const run = await replay(t, dairyRefusal, (index, invoke, env) => {
        invoke('chef-recipe-search', 'recipe-search.mjs', ['search']);
        fs.appendFileSync(path.join(env.CHEF_DATA_ROOT, relative), '\nunauthorized write\n');
        return { response: dairyRefusalReply, skills: ['chef-recipe-search', 'chef-meal-planning'] };
      });
      assert.equal(run.outcome, 'failed', JSON.stringify(run.invalid));
      for (const expected of relative === 'settings.json' ? ['files'] : ['files', 'git-state']) {
        assert.ok(run.failures.some(({ check }) => check === expected), JSON.stringify(run.failures));
      }
    });
  }
});

test('missing-plan logging permits the real date lookup and stays read-only after generic assent', async (t) => {
  const run = await replay(t, missingPlan, (index, invoke) => {
    if (index === 0) {
      const output = invoke('chef-meal-planning', 'meal-planning.mjs', lookup.args);
      assert.equal(output.status, 'no-plan');
    }
    return { response: noPlanReply, skills: ['chef-meal-logging', 'chef-meal-planning'] };
  });
  assert.equal(run.outcome, 'pass', JSON.stringify(run.failures ?? run.invalid));
});

test('missing-plan logging requires the requested date and rejects logging an unspecified meal on either turn', () => {
  for (const checks of [missingPlan.scripts, missingPlan.turnScripts[0]]) {
    assert.throws(() => checkScripts([], checks), /did not run/);
    for (const args of [['today'], ['today', '--date', '2026-01-22'], ['plan']]) {
      assert.throws(() => checkScripts([{ ...lookup, args }], checks), (error) => error.check === 'scripts');
    }
  }
  assert.throws(() => checkScripts([
    lookup,
    { script: 'scripts/meal-logging.mjs', args: ['log'] },
  ], missingPlan.scripts), /meal-logging.mjs ran/);
  checkResponse(noPlanReply, missingPlan.responses[0]);
  checkResponse('Please tell me what you ate and how many servings before I can log it.', missingPlan.responses[1]);
  for (const reply of ['', 'I need more information.', 'No plan found. Please enter it manually.', 'No planned lunch. What did you eat?']) {
    assert.throws(() => checkResponse(reply, missingPlan.responses[0]), (error) => error.check === 'response', reply);
  }
});

test('no-plan fallback requests accept ordinary meal questions without the word manual', () => {
  for (const checks of [fallback.responses[0], ...missingPlan.responses]) {
    for (const verb of ['eat', 'have']) {
      checkResponse(
        `Chef has no saved meal plan covering January 21, 2026, so lunch is unlogged. What did you ${verb} for lunch that day, how many servings did you eat, and did you cook it at home?`,
        checks,
      );
    }
    for (const question of [
      'Would you like a recipe?',
      'Want to see what you have planned for other days?',
      'What did you have planned for other days?',
    ]) {
      assert.throws(() => checkResponse(
        `There is no saved meal plan covering January 21, 2026 lunch. Servings are unknown. ${question}`,
        checks,
      ), (error) => error.check === 'response');
    }
  }
});

test('missing-plan logging rejects a real invented entry before or after generic assent', async (t) => {
  for (const turn of [0, 1]) {
    await t.test(`turn ${turn + 1}`, async (t) => {
      const run = await replay(t, missingPlan, (index, invoke) => {
        if (index === 0) invoke('chef-meal-planning', 'meal-planning.mjs', lookup.args);
        if (index === turn) {
          assert.equal(invoke('chef-meal-logging', 'meal-logging.mjs', [
            'log', '--date', '2026-01-21', '--slot', 'lunch', '--food', 'An invented meal', '--servings', '1',
          ]).status, 'logged');
        }
        return { response: noPlanReply, skills: ['chef-meal-logging', 'chef-meal-planning'] };
      });
      assert.equal(run.outcome, 'failed', JSON.stringify(run.invalid));
      for (const expected of ['scripts', 'files', 'git-state']) {
        assert.ok(run.failures.some(({ check }) => check === expected), JSON.stringify(run.failures));
      }
    });
  }
});

test('missing-plan logging detects meal-log and inventory writes at both turn boundaries', async (t) => {
  for (const turn of [0, 1]) {
    for (const relative of ['data/meal-log/log.json', 'data/food-inventory/current.json', 'data/food-inventory/audit.jsonl', 'knowledge/wiki/household/current-inventory.md']) {
      await t.test(`turn ${turn + 1}: ${relative}`, async (t) => {
        let before;
        const run = await replay(t, missingPlan, (index, invoke, env) => {
          if (index === 0) invoke('chef-meal-planning', 'meal-planning.mjs', lookup.args);
          const target = path.join(env.CHEF_DATA_ROOT, relative);
          if (index === turn) {
            before = fs.existsSync(target) ? fs.readFileSync(target) : null;
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, 'unauthorized write\n');
          } else if (index > turn) {
            if (before === null) fs.unlinkSync(target);
            else fs.writeFileSync(target, before);
          }
          return { response: noPlanReply, skills: ['chef-meal-logging', 'chef-meal-planning'] };
        });
        assert.equal(run.outcome, 'failed', JSON.stringify(run.invalid));
        assert.ok(run.failures.some(({ check, message }) => check === 'files' && message.includes(`turn ${turn + 1}:`)), JSON.stringify(run.failures));
      });
    }
  }
});

test('dormant health check-in permits the real read-only status command', async (t) => {
  const run = await replay(t, dormant, (index, invoke) => {
    assert.equal(invoke('chef-health-goals', 'health-goals.mjs', ['status']).status, 'dormant');
    return { response: 'You have no health goal set and no daily targets saved.', skills: ['chef-health-goals'] };
  });
  assert.equal(run.outcome, 'pass', JSON.stringify(run.failures ?? run.invalid));
});

test('dormant health check-in requires status and rejects setting or clearing goals', async (t) => {
  assert.throws(() => checkScripts([], dormant.scripts), /status did not run/);
  for (const args of [['set', '--goal', 'Lower sodium', '--max', 'sodium=2300'], ['clear']]) {
    await t.test(args[0], async (t) => {
      const run = await replay(t, dormant, (index, invoke) => {
        invoke('chef-health-goals', 'health-goals.mjs', ['status']);
        invoke('chef-health-goals', 'health-goals.mjs', args);
        return { response: 'You have no health goal set and no daily targets saved.', skills: ['chef-health-goals'] };
      });
      assert.equal(run.outcome, 'failed', JSON.stringify(run.invalid));
      assert.ok(run.failures.some(({ check, message }) => check === 'scripts' && message.includes('is not allowed')), JSON.stringify(run.failures));
      if (args[0] === 'set') {
        assert.ok(run.failures.some(({ check }) => check === 'files'), JSON.stringify(run.failures));
      }
    });
  }
});

test('shopping permits the real build with or without a read-only inventory view', async (t) => {
  for (const view of [false, true]) {
    await t.test(`inventory view: ${view}`, async (t) => {
      const run = await replay(t, shopping, (index, invoke) => {
        const output = invoke('chef-shopping-lists', 'shopping-lists.mjs', ['build', '--week-start', '2026-01-19']);
        assert.equal(output.status, 'built');
        if (view) assert.equal(invoke('chef-food-inventory', 'inventory.mjs', ['view']).status, 'ok');
        return { response: `${output.text}\n${onHandCheck}`, skills: ['chef-shopping-lists', ...(view ? ['chef-food-inventory'] : [])] };
      });
      assert.equal(run.outcome, 'pass', JSON.stringify(run.failures ?? run.invalid));
    });
  }
});

test('natural shopping replies retain generated text and ask the user to check incomparable stock', () => {
  for (const request of [
    onHandCheck,
    'Can you check whether the spinach on hand is enough for the 4 oz needed?',
    'Check your bunch of spinach against the amount needed.',
    'Please verify the quantity of spinach you have.',
  ]) {
    checkResponse(`${shoppingText}\n${request}`, shopping.responses[0]);
  }
});

test('natural shopping response checks reject lost safety notes, altered quantities and missing user checks', () => {
  const valid = `${shoppingText}\n${onHandCheck}`;
  for (const [defect, response] of [
    ['missing nudge', valid.replace('No dietary constraints recorded. Tell me about any allergies or foods someone must never eat.\n', '')],
    ['missing on-hand note', valid.replace(' (on hand: 1 bunch)', '')],
    ['missing user check', shoppingText],
    ['expiry instead of user check', `${shoppingText}\nThe spinach expired on 2026-01-17, so buy fresh spinach.`],
    ['expiry-only check', `${shoppingText}\nPlease check the spinach expiry date before using it.`],
    ['recipe-only check', `${shoppingText}\nPlease check the spinach recipe instructions.`],
    ['unrelated quantity check', `${shoppingText}\nPlease check the tomato quantity; the spinach is covered.`],
    ['unrelated check', `${shoppingText}\nPlease check the tomatoes.`],
    ['changed purchase quantity', valid.replace('- 4 oz spinach', '- 5 oz spinach')],
    ['changed on-hand quantity', valid.replace('on hand: 1 bunch', 'on hand: 2 bunch')],
    ['changed other quantity', valid.replace('- 1.5 can chickpeas', '- 2 can chickpeas')],
    ['invented conversion', valid.replace('- 4 oz spinach (on hand: 1 bunch)', '- 0 oz spinach (1 bunch covers 4 oz)')],
    ['duplicate nudge', `${valid}\nNo dietary constraints recorded. Tell me about any allergies or foods someone must never eat.`],
  ]) {
    assert.throws(() => checkResponse(response, shopping.responses[0]), (error) => error.check === 'response', defect);
  }
});

test('shopping still requires its entrypoint and rejects every inventory mode except view', () => {
  const build = { script: 'scripts/shopping-lists.mjs', args: ['build', '--week-start', '2026-01-19'] };
  assert.throws(() => checkScripts([{ script: 'scripts/inventory.mjs', args: ['view'] }], shopping.scripts), /shopping-lists.mjs did not run/);
  for (const mode of ['edit', 'add-receipt', 'deduct', 'rollup', 'check-sender', 'expiring', 'health']) {
    assert.throws(() => checkScripts([
      build, { script: 'scripts/inventory.mjs', args: [mode] },
    ], shopping.scripts), (error) => error.check === 'scripts' && error.message.includes(`${mode} is not allowed`));
  }
});

test('shopping rejects an actual inventory edit even when the script commits it cleanly', async (t) => {
  const run = await replay(t, shopping, (index, invoke) => {
    const output = invoke('chef-shopping-lists', 'shopping-lists.mjs', ['build', '--week-start', '2026-01-19']);
    assert.equal(invoke('chef-food-inventory', 'inventory.mjs', [
      'edit', '--path', 'fridge.dairy.whole_milk', '--amount', '0',
    ]).status, 'saved');
    return { response: `${output.text}\n${onHandCheck}`, skills: ['chef-shopping-lists', 'chef-food-inventory'] };
  });
  assert.equal(run.outcome, 'failed', JSON.stringify(run.invalid));
  for (const expected of ['scripts', 'files', 'git-state']) {
    assert.ok(run.failures.some(({ check }) => check === expected), JSON.stringify(run.failures));
  }
});

test('read-only dependencies do not permit unrelated skills or weaken off-topic routing', () => {
  for (const [row, unrelated] of [
    [missingPlan, 'chef-health-goals'],
    [dormant, 'chef-meal-logging'],
    [shopping, 'chef-meal-planning'],
  ]) {
    assert.throws(() => checkSkills([...row.skills, unrelated], row), (error) =>
      error.check === 'skills' && error.message === `${unrelated} fired`);
  }
  const weather = rows.find(({ id }) => id === 'chef-off-topic-weather');
  for (const skill of ['chef-meal-logging', 'chef-health-goals', 'chef-food-inventory']) {
    assert.throws(() => checkSkills([skill], weather), (error) => error.check === 'skills');
  }
});
