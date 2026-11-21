import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scriptContractErrors } from './script-contract.mjs';

const contract = {
  modes: ['search'],
  flags: ['ingredient'],
  statuses: { ok: ['ok'], errors: ['invalid-input'] },
};
const ENTRY_SCRIPTS = [
  'chef-add-recipe/scripts/add-recipe.mjs',
  'chef-batch-prep-planning/scripts/batch-prep.mjs',
  'chef-food-inventory/scripts/inventory.mjs',
  'chef-health-goals/scripts/health-goals.mjs',
  'chef-meal-logging/scripts/meal-logging.mjs',
  'chef-meal-planning/scripts/meal-planning.mjs',
  'chef-recipe-decisions/scripts/recipe-decisions.mjs',
  'chef-recipe-search/scripts/recipe-search.mjs',
  'chef-setup/scripts/setup.mjs',
  'chef-shopping-lists/scripts/shopping-lists.mjs',
];

test('rejects a documented mode the script does not export', () => {
  const skill = 'node scripts/recipe-search.mjs show --ingredient beans\n';

  assert.deepEqual(scriptContractErrors(skill, contract, ['ok']), ['documented mode "show" is not exported by the script']);
});

test('rejects a documented flag the script does not export', () => {
  const skill = 'node scripts/recipe-search.mjs search --ingredient beans --limit 5\n';

  assert.deepEqual(scriptContractErrors(skill, contract, ['ok']), ['documented flag "--limit" is not exported by the script']);
});

test('rejects a documented status the script does not export', () => {
  const skill = 'Exit code 2 means `status` is `refused` or `invalid-input`.\n- `ok`: report the results.\n';

  assert.deepEqual(scriptContractErrors(skill, contract, ['ok']), ['documented status "refused" is not exported by the script']);
});

test('parses inline status handling forms used by real skills', () => {
  const skills = [
    'On `status: refused`: stop.\n',
    '- **Clear trace**: run `node scripts/setup.mjs clear-trace`. `refused`: stop.\n',
  ];

  for (const skill of skills) {
    assert.deepEqual(scriptContractErrors(skill, contract, ['ok']), ['documented status "refused" is not exported by the script']);
  }
  const inline = 'Act on `status`: `invalid-input` (show `problems`), `refused` (stop).\n';
  assert.deepEqual(scriptContractErrors(inline, contract, ['ok']), ['documented status "refused" is not exported by the script']);
});

test('rejects an ok script status missing from the facts registry', () => {
  assert.deepEqual(scriptContractErrors('', contract, []), ['ok status "ok" is missing from the facts registry']);
});

test('entry scripts export their contract without running the CLI', () => {
  const entry = new URL('../../src/skills/chef-add-recipe/scripts/add-recipe.mjs', import.meta.url).href;
  const source = `const { SCRIPT_CONTRACT } = await import(${JSON.stringify(entry)}); console.log(JSON.stringify(SCRIPT_CONTRACT));`;
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' });

  assert.deepEqual(JSON.parse(output), {
    modes: ['url', 'draft', 'enrich', 'verify'],
    flags: ['data-root', 'url', 'html', 'draft', 'kind', 'source', 'dry-run', 'slug', 'unenriched', 'constraint'],
    statuses: {
      ok: ['added', 'would-add', 'exists', 'needs-draft', 'enriched', 'unchanged', 'verified'],
      errors: ['refused', 'invalid-input', 'fetch-failed', 'not-found'],
    },
  });
});

test('every entry script can be imported without running its CLI', () => {
  for (const root of ['src/skills', 'plugins/chef/skills']) {
    for (const entry of ENTRY_SCRIPTS) {
      const url = new URL(`../../${root}/${entry}`, import.meta.url).href;
      const source = `const { SCRIPT_CONTRACT } = await import(${JSON.stringify(url)}); console.log(JSON.stringify(SCRIPT_CONTRACT));`;
      const output = execFileSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' });
      const exported = JSON.parse(output);
      assert.ok(exported.modes.length > 0, `${root}/${entry}`);
      assert.ok(exported.flags.includes('data-root'), `${root}/${entry}`);
      assert.ok(exported.statuses.ok.length > 0, `${root}/${entry}`);
    }
  }
});

test('every entry script rejects an unknown mode as invalid input', () => {
  for (const entry of ENTRY_SCRIPTS) {
    const file = fileURLToPath(new URL(`../../src/skills/${entry}`, import.meta.url));
    const result = spawnSync(process.execPath, [file, 'unknown-mode'], { encoding: 'utf8' });
    assert.equal(result.status, 2, entry);
    assert.equal(result.stderr, '', entry);
    assert.equal(JSON.parse(result.stdout).status, 'invalid-input', entry);
  }
});

test('the real repository satisfies every script contract', () => {
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  const output = execFileSync(process.execPath, ['scripts/lint-skills.mjs'], { cwd: repo, encoding: 'utf8' });
  assert.match(output, /skill-format lint passed: 10 skill\(s\)/);
});
