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

    node evals/tier1/run.mjs --skills-dir <dir> [--fixture <data root>] [--cases <file or dir>]

## Layout and authoring

Tier1 rows live in `tier1/cases/<skill>.json` (`chef-setup.<topic>.json` when a skill outgrows 1,000 lines); keep every data file under 1,000 lines. `lib/load-cases.mjs` is the only reader: it concatenates the files and throws on a duplicate id across files. Agentic rows stay in `agentic/rows.json`.

Move multi-line text out of the JSON. A seed entry takes `seedFile` instead of `content`, and an agentic turn can be `{"turnFile": ...}`. Both are repo-relative paths under `evals/tier1/inputs/` or `evals/agentic/inputs/` (one folder per row id by convention); lint checks they exist. Short strings stay inline.

Every tier1 case needs `git` (`{headUnchanged, clean}` checked after the command). Use `git: false` with a short `gitReason` only when the case cannot be checked, e.g. `fixture: "none"` has no data root. A case whose command commits its own writes takes `{clean: true}`.

New rows: `bun run evals:new <tier1|agentic> <skill> <slug> [--topic <topic>] [--from-repro <case_id>]` appends a skeleton with id `<skill>-<slug>` to the right file and refuses an id that exists. `--from-repro` also sets `repro` and `known_failure` to the case id (the case file must exist in `repro/`). Fill in the TODOs, then run `bun run evals:lint`. `--topic` picks the file for a topic-split skill (`chef-setup`: `settings`, `dietary`, `maintenance`) and is required there.

## Shared sandbox

`lib/sandbox.mjs` builds every rep sandbox for both suites: fixture copy, `seed` (inline `content` or `seedFile`), git commit, `afterCommitSeed`, and the `CHEF_DATA_ROOT` env. Add sandbox setup there, not in a suite runner.

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
