# Evals

| Suite | Command | What it proves |
| --- | --- | --- |
| `tier1/` | `bun run tier1` | Script contract: built skill scripts, given a data root and env, behave as specified. Harness-independent; no agent runs. |
| `agentic/` | `bun run agentic` | Harness behavior: a headless agent with the plugin fires the right skills and writes the right files. Local only (spends real usage). |
| `repro/`, `migration-regression.mjs` | `bun run repro`, `bun run migrations` | See `repro/README.md`. |

## Tier1 is the cross-harness baseline

Tier1 runs `node <skills>/.../x.mjs` against a copy of `fixtures/data-root` with `CHEF_DATA_ROOT` set. It never starts Claude, so any harness can reuse it.

`--skills-dir <dir>` is the cross-harness input: a directory of built skill folders (default `plugins/chef/skills`, the Claude plugin layout). Point it at another harness's installed skills to check the same scripts there:

    node evals/tier1/run.mjs --skills-dir <dir> [--fixture <data root>] [--cases <cases.json>]

## Shared sandbox

`lib/sandbox.mjs` builds every rep sandbox for both suites: fixture copy, `seed`, git commit, `afterCommitSeed`, and the `CHEF_DATA_ROOT` env. Add sandbox setup there, not in a suite runner.
