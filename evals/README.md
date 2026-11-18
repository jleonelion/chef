# Evals

| Suite | Command | What it proves |
| --- | --- | --- |
| `tier1/` | `bun run tier1` | Script contract: built skill scripts, given a data root and env, behave as specified. Harness-independent; no agent runs. |
| `agentic/` | `bun run agentic` | Harness behavior: a headless agent with the plugin fires the right skills and writes the right files. Local only (spends real usage). |
| `repro/`, `migration-regression.mjs` | `bun run repro`, `bun run migrations` | See `repro/README.md`. |

`bun run evals:lint` checks the tier1 and agentic datasets against `schemas/evals/` and runs in CI.

## Harness launchers (agentic)

`bun run agentic --harness claude` (default; codex and copilot land later). The runner is harness-neutral; each runtime has a launcher in `evals/agentic/harnesses/<name>.mjs` plus a Projector (raw transcript to Trajectory, `trajectory.mjs`).

Launcher contract: `name`, `launcherVersion`, `project(transcript)`, `detect()` (binary and version, throws "not installed"), `prepare({ pluginDir, workdir, env })` (installs the built skills the way that harness discovers them, isolated per rep, never touching the user's config; returns `{ skillsDir, env, runTurn }`), `runTurn({ prompt, session, resume, model, timeoutMs })` (returns `{ out, err, ext }`, the raw transcript written to the log dir). Same capability set everywhere: shell, file read/write/edit, skills, no MCP.

Result files are `chef-agentic` format 2 and carry `harness: {name, launcherVersion, cliVersion}` and `models`. Compare harnesses by row, never by cost.

| Harness | Skill loading | Unattended flags | Isolation |
|---|---|---|---|
| claude | `--plugin-dir` on a per-rep copy of the plugin | `--permission-mode dontAsk --allowedTools 'Bash Read Write Edit Glob Grep Skill'`, `--strict-mcp-config`, `--setting-sources project` | per-rep plugin copy and sandbox env |
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
