import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkResponse, checkScripts, checkSkills } from './report.mjs';
import { runRep } from './run.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const rows = JSON.parse(fs.readFileSync(new URL('./rows.json', import.meta.url), 'utf8'));
const missingPlan = rows.find(({ id }) => id === 'chef-meal-logging-plan-absent-logs-nothing');
const dormant = rows.find(({ id }) => id === 'chef-health-goals-check-in-goal-unset-stays-dormant');
const shopping = rows.find(({ id }) => id === 'chef-shopping-lists-natural-from-plan');
const noPlanReply = 'There is no planned lunch for January 21, 2026. What did you eat and how many servings? I need those details before I can propose a manual meal-log entry.';
const lookup = { script: 'scripts/meal-planning.mjs', args: ['today', '--date', '2026-01-21'] };

async function replay(t, row, act) {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-read-only-replay-'));
  t.after(() => fs.rmSync(logDir, { recursive: true, force: true }));
  const harness = {
    prepare({ env, workdir }) {
      t.after(() => fs.rmSync(workdir, { recursive: true, force: true }));
      let index = 0;
      return {
        env, skillsDir: path.join(repo, 'src/skills'),
        async runTurn() {
          const scriptRuns = [];
          const invoke = (skill, script, args) => {
            scriptRuns.push({ script: `scripts/${script}`, args });
            const result = spawnSync(process.execPath, [
              path.join(repo, 'src/skills', skill, 'scripts', script), ...args,
            ], { env, encoding: 'utf8' });
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
        return { response: output.text, skills: ['chef-shopping-lists', ...(view ? ['chef-food-inventory'] : [])] };
      });
      assert.equal(run.outcome, 'pass', JSON.stringify(run.failures ?? run.invalid));
    });
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
    return { response: output.text, skills: ['chef-shopping-lists', 'chef-food-inventory'] };
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
