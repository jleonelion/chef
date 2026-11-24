import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runRep } from './run.mjs';
import { projectClaude, projectCodex, projectCopilot } from './trajectory.mjs';

const stream = (...events) => events.map((event) => JSON.stringify(event)).join('\n');
const projectors = [
  [projectClaude, (command) => stream(
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } },
    { type: 'result', is_error: false, result: 'Done' },
  )],
  [projectCodex, (command) => stream(
    { type: 'item.completed', item: { type: 'command_execution', command } },
    { type: 'turn.completed' },
  )],
  [projectCopilot, (command) => stream(
    { type: 'assistant.message', data: { toolRequests: [{ name: 'bash', arguments: { command } }] } },
    { type: 'result', exitCode: 0 },
  )],
];
const row = {
  id: 'chef-shopping-lists-provenance', turns: ['Make a shopping list.'],
  setup: JSON.parse(fs.readFileSync(new URL('./rows.json', import.meta.url), 'utf8'))
    .find(({ id }) => id === 'chef-shopping-lists-one-off-addresses-confirm-first').setup,
  scripts: { required: ['scripts/shopping-lists.mjs'], max: { 'scripts/shopping-lists.mjs': 1 } },
  git: { headUnchanged: true, clean: true },
};

async function replay(t, act, { transport = projectors[1], scenario = row, install } = {}) {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-provenance-'));
  t.after(() => fs.rmSync(logDir, { recursive: true, force: true }));
  const [project, transcript] = transport;
  const harness = {
    project,
    prepare({ env, pluginDir, workdir }) {
      const skillsDir = path.join(workdir, 'installed skills');
      fs.cpSync(path.join(pluginDir, 'skills'), skillsDir, { recursive: true });
      const entrypoint = path.join(skillsDir, 'chef-shopping-lists/scripts/shopping-lists.mjs');
      install?.(entrypoint);
      return {
        env, skillsDir,
        async runTurn() {
          // Commands here are authored synthetic fixtures, never extracted from transcripts.
          const execute = (command, childEnv = env) => execFileSync('/bin/sh', ['-c', command], { cwd: workdir, env: childEnv, encoding: 'utf8' });
          const command = await act({ entrypoint, skillsDir, workdir, env, execute });
          return { transcript: transcript(command), ext: 'jsonl', exitCode: 0, stderr: '', timedOut: false, signal: null };
        },
      };
    },
  };
  const run = await runRep(scenario, 1, { harness, logDir });
  return { run, records: fs.existsSync(path.join(logDir, `${scenario.id}-1-1.executions.json`))
    ? JSON.parse(fs.readFileSync(path.join(logDir, `${scenario.id}-1-1.executions.json`), 'utf8')) : [] };
}

const invocation = (entrypoint) => `node ${JSON.stringify(entrypoint)} build --week-start 2026-01-19`;

test('all Projectors retain genuine execution evidence without trusting quoted mentions', async (t) => {
  for (const transport of projectors) {
    await t.test(transport[0].name, async (t) => {
      const genuine = await replay(t, ({ entrypoint, execute }) => {
        const command = invocation(entrypoint);
        assert.equal(JSON.parse(execute(command)).delivery.mode, 'chat');
        return command;
      }, { transport });
      assert.equal(genuine.run.outcome, 'pass', JSON.stringify(genuine.run));
      const mention = await replay(t, ({ execute }) => {
        const command = "printf '%s' 'node scripts/shopping-lists.mjs build --week-start 2026-01-19'";
        execute(command);
        return command;
      }, { transport });
      assert.equal(mention.run.outcome, 'failed');
      assert.match(mention.run.failure.message, /provenance not established/);
    });
  }
});

test('modified or replaced installed files cannot pass, even when restored before turn end', async (t) => {
  for (const defect of ['modified entrypoint', 'restored entrypoint', 'replaced entrypoint', 'changed instructions']) {
    await t.test(defect, async (t) => {
      const { run } = await replay(t, ({ entrypoint, skillsDir, execute }) => {
        const target = defect === 'changed instructions' ? path.join(skillsDir, 'chef-shopping-lists/SKILL.md') : entrypoint;
        const original = fs.readFileSync(target);
        if (defect === 'replaced entrypoint') fs.unlinkSync(target);
        fs.writeFileSync(target, Buffer.concat([original, Buffer.from('\n// Changed by the agent.\n')]));
        execute(invocation(entrypoint));
        if (defect === 'restored entrypoint') fs.writeFileSync(target, original);
        return invocation(entrypoint);
      });
      assert.equal(run.outcome, 'invalid');
      assert.match(run.invalid.message, /installed pack was modified or replaced/);
    });
  }
});

test('a different installed pack is rejected before the first turn', async (t) => {
  let ran = false;
  const { run } = await replay(t, () => { ran = true; return ''; }, {
    install(entrypoint) { fs.appendFileSync(entrypoint, '\n// Different bundle.\n'); },
  });
  assert.equal(ran, false);
  assert.equal(run.outcome, 'invalid');
  assert.match(run.invalid.message, /differs from the evaluated bundle/);
});

test('setup invocations and calls with observation disabled are not agent execution evidence', async (t) => {
  for (const disabled of [false, true]) {
    await t.test(`observation disabled: ${disabled}`, async (t) => {
      const { run } = await replay(t, ({ entrypoint, env, execute }) => {
        if (disabled) execute(invocation(entrypoint), { ...env, NODE_OPTIONS: '' });
        return invocation(entrypoint);
      }, {
        scenario: {
          ...row,
          scripts: { required: [disabled ? 'scripts/shopping-lists.mjs' : 'scripts/meal-planning.mjs'] },
        },
      });
      assert.equal(run.outcome, 'failed');
      assert.match(run.failure.message, /did not run.*provenance not established/);
      if (disabled) assert.ok(!run.scriptRuns.some(({ script }) => script === 'scripts/meal-planning.mjs'));
    });
  }
});

test('genuine Bun, wrapped relative and variable-based calls preserve arguments and invocation counts', async (t) => {
  for (const style of ['bun', 'relative', 'variable', 'variable arguments']) {
    await t.test(style, async (t) => {
      const { run, records } = await replay(t, ({ entrypoint, skillsDir, execute }) => {
        const command = style === 'bun' ? invocation(entrypoint).replace(/^node /, 'bun ')
          : style === 'relative' ? `cd ${JSON.stringify(path.join(skillsDir, 'chef-shopping-lists'))} && /bin/sh -c 'node scripts/shopping-lists.mjs build --week-start 2026-01-19'`
            : style === 'variable arguments' ? `date=2026-01-19; cd ${JSON.stringify(path.join(skillsDir, 'chef-shopping-lists'))}; node scripts/shopping-lists.mjs build --week-start "$date"`
              : `script=${JSON.stringify(entrypoint)}; node "$script" build --week-start 2026-01-19`;
        assert.equal(JSON.parse(execute(command)).delivery.mode, 'chat');
        return command;
      }, {
        scenario: {
          ...row,
          scripts: { ...row.scripts, requiredCalls: [{ script: 'scripts/shopping-lists.mjs', args: ['build', '--week-start', '2026-01-19'] }] },
        },
      });
      assert.equal(run.outcome, 'pass', JSON.stringify({ run, records }));
      assert.equal(run.scriptRuns.filter(({ script }) => script === 'scripts/shopping-lists.mjs').length, 1);
    });
  }
});

test('source inspection never satisfies execution evidence', async (t) => {
  const { run, records } = await replay(t, ({ entrypoint, execute }) => {
    const command = `cat ${JSON.stringify(entrypoint)}`;
    execute(command);
    return command;
  });
  assert.equal(run.outcome, 'failed');
  assert.equal(run.failure.check, 'scripts');
  assert.match(run.failure.message, /provenance not established/);
  assert.deepEqual(records, []);
  const inspection = await replay(t, ({ entrypoint, execute }) => {
    const command = `cat ${JSON.stringify(entrypoint)}`;
    execute(command);
    return command;
  }, { scenario: { ...row, scripts: { forbidden: ['scripts/shopping-lists.mjs'] } } });
  assert.equal(inspection.run.outcome, 'pass', JSON.stringify(inspection.run));
});

test('syntax-only inspection cannot satisfy required entrypoints or argument prefixes', async (t) => {
  for (const flag of ['--check', '-c']) {
    await t.test(flag, async (t) => {
      const { run } = await replay(t, ({ entrypoint, execute }) => {
        const command = invocation(entrypoint).replace(/^node /, `node ${flag} `);
        execute(command);
        return command;
      }, {
        scenario: {
          ...row,
          scripts: { requiredCalls: [{ script: 'scripts/shopping-lists.mjs', args: ['build'] }] },
        },
      });
      assert.equal(run.outcome, 'failed');
      assert.match(run.failure.message, /provenance not established/);
    });
  }
});

test('altered external copy through a shell variable is observed but never accepted', async (t) => {
  const { run, records } = await replay(t, ({ entrypoint, workdir, execute }) => {
    const copy = path.join(workdir, 'shopping-lists.mjs');
    const original = fs.readFileSync(entrypoint, 'utf8');
    const altered = original.replace(
      'const delivery = deliverList(root, list, { recipients: settings.settings.household_recipients });',
      'const delivery = { mode: "chat", recipients: [], reason: "substituted" };',
    );
    assert.notEqual(altered, original);
    fs.writeFileSync(copy, altered);
    const command = `script=${JSON.stringify(copy)}; node "$script" build --week-start 2026-01-19`;
    assert.equal(JSON.parse(execute(command)).delivery.reason, 'substituted');
    return command;
  });
  assert.equal(run.outcome, 'failed');
  assert.match(run.failure.message, /provenance not established/);
  assert.ok(records.some((record) => record.entrypoint.endsWith('/shopping-lists.mjs') && !record.script));
  assert.ok(!run.scriptRuns.some(({ script }) => script === 'scripts/shopping-lists.mjs'));
});
