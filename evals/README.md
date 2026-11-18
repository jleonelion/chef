# Evals

| Suite | Command | What it proves |
| --- | --- | --- |
| `tier1/` | `bun run tier1` | Script contract: built skill scripts, given a data root and env, behave as specified. Harness-independent; no agent runs. |
| `agentic/` | `bun run agentic` | Harness behavior: a headless agent with the plugin fires the right skills and writes the right files. Local only (spends real usage). |
| `repro/`, `migration-regression.mjs` | `bun run repro`, `bun run migrations` | See `repro/README.md`. |

`bun run evals:lint` checks the tier1 and agentic datasets against `schemas/evals/` and runs in CI.
Unknown keys, assertions with no recognised check (`equals`, `absent`, `includes`, `excludes`, `min`),
duplicate ids, unknown skill names and badly shaped ids all fail it.

## Tier1 is the cross-harness baseline

Tier1 runs `node <skills>/.../x.mjs` against a copy of `fixtures/data-root` with `CHEF_DATA_ROOT` set. It never starts Claude, so any harness can reuse it.

`--skills-dir <dir>` is the cross-harness input: a directory of built skill folders (default `plugins/chef/skills`, the Claude plugin layout). Point it at another harness's installed skills to check the same scripts there:

    node evals/tier1/run.mjs --skills-dir <dir> [--fixture <data root>] [--cases <cases.json>]

## Shared sandbox

`lib/sandbox.mjs` builds every rep sandbox for both suites: fixture copy, `seed`, git commit, `afterCommitSeed`, and the `CHEF_DATA_ROOT` env. Add sandbox setup there, not in a suite runner.

## Naming ids

Every row or case id is `<skill>-<scenario>`:

- lowercase kebab-case, at least two segments, unique within its dataset
- `<skill>` is the full name of a skill the item evaluates, as in `src/skills` (`chef-recipe-search`, not `recipe-search`)
- `<scenario>` says what is being checked (`chef-food-inventory-untrusted-sender-refused`)

Which skill counts as evaluated:

- tier1: a skill named in the `{skills}/<skill>/` paths of the case's `command` or `steps`. If several, prefix with the one under test; do not prefix with a feature name such as `dietary-gate`.
- agentic: one of the row's `skills`.

The lint rejects an id that does not start with one of those skills, so grep `chef-<skill>-` finds every item covering a skill.
Ids are referenced by `repro`, `known_failure` and result files, so renaming one means updating those too.
New datasets should follow the same rule and add a schema under `schemas/evals/`.

## Grounding

Rows must resolve against `fixtures/data-root`, checked by `evals/grounding.test.mjs` (runs with `node --test`, so in CI):

- `grounding` (optional, in tier1 cases and agentic rows) declares the fixture facts the item relies on: `recipes` (slugs), `inventory` (item keys), `mealPlans` (plan slugs). Each must exist in the fixture; a recipe the item's inputs name from the fixture must be declared.
- The test also scans `recipe`/`slug` values and `--recipe`/`--slug` flags in `seed`, `afterCommitSeed`, `setup`, `turns`, `stdin`, `command` and `steps`. A slug must be in the fixture or created by the item's own seed (a seeded recipe page, proposal or draft). Assertions are not scanned.
- Rows must not depend on the wall-clock date: use fixed dates, never `{today}` (the lint rejects it).
