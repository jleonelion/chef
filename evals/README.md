# Evals

| Suite | Command | What it proves |
| --- | --- | --- |
| `tier1/` | `bun run tier1` | Script contract: built skill scripts, given a data root and env, behave as specified. Harness-independent; no agent runs. |
| `agentic/` | `bun run agentic` | Harness behavior: a headless agent with the plugin fires the right skills and writes the right files. Local only (spends real usage). |
| `repro/`, `migration-regression.mjs` | `bun run repro`, `bun run migrations` | See `repro/README.md`. |

Agentic promotion criteria and the local subscription-backed release gate are documented in `agentic/README.md`. Scheduled and hosted promotion are disabled.

`bun run evals:lint` checks the tier1 and agentic datasets against `schemas/evals/` and runs in CI.

## Harness launchers (agentic)

`bun run agentic --harness claude|codex|copilot` (default claude). The runner is harness-neutral; each runtime has a launcher in `evals/agentic/harnesses/<name>.mjs` plus a Projector (raw transcript to Trajectory, `trajectory.mjs`).

Launcher contract: `name`, `launcherVersion`, `project(transcript)`, `detect()` (binary and version, throws "not installed"), `prepare({ pluginDir, workdir, env })` (installs the built skills the way that harness discovers them, isolated per rep, never touching the user's config; returns `{ skillsDir, env, runTurn }`), `runTurn({ prompt, session, resume, model, timeoutMs })` (returns `{ transcript, stderr, timedOut, exitCode, signal, ext, spawnError? }`). Same capability set everywhere: shell, file read/write/edit, skills, no MCP.

Result files are `chef-agentic` format 3 and carry the harness identity, models, dataset and fixture hashes, row selection, and a compact outcome for every rep. Each rep is a valid pass, valid behavioral failure with a stable check id, or invalid execution with a cause. Invalid causes are `timeout`, `rate_limit`, `process`, `transcript` and `harness`. The runner gives each summary a unique name under `agentic/archive/`; raw logs stay ignored under `agentic/results/logs/`. Commit release-gate summaries whether they pass or fail. Verify one against the relevant tree and requested gate with `bun run agentic:verify <result>`, passing the run's selection and repetition options. Compare harnesses by row, never by cost.

Pass rates use valid reps as the denominator. Among valid reps, all passes is `passing`, zero passes is `broken`, and mixed outcomes is `flaky`. A row with any invalid rep has overall classification `invalid` and keeps its valid-rep behavior classification separately. A failed rep records every behavioral check that failed, so an expected known failure cannot hide an unrelated failure. Invalid reps never satisfy the requested repetition count or a known failure. The command exits 0 for a passing suite, 1 for behavioral failure, and 2 when any rep is invalid. It never retries a failed or invalid rep.

Local smoke (not CI): `bun run agentic:smoke --harness <name>` installs the skills the way the launcher does and runs tier1 against that dir. Re-record a Projector fixture from a real turn's log, trimming skill outputs and replacing temp paths and ids; never commit a raw log.

| Harness | Skill loading | Unattended flags | Isolation |
|---|---|---|---|
| codex | built skills copied to a per-rep `CODEX_HOME/skills` (Codex has no skill tool: a skill fires when a command reads its `SKILL.md`) | `codex exec --json`, `-c sandbox_mode="workspace-write"` (writes confined to the rep workdir); stdin closed; `--ignore-user-config --ignore-rules --skip-git-repo-check`; turns resume via `codex exec resume <thread_id>` | `CODEX_HOME` and `HOME` inside the rep workdir; only `auth.json` is copied in, never written back; no login fails closed. No model or cost in the transcript: result `model` falls back to `--model` or "harness default", cost is 0. `CHEF_EVAL_CODEX_UNSANDBOXED=1` adds `--dangerously-bypass-approvals-and-sandbox` for environments where Codex's own sandbox cannot start (for example inside Copilot's sandbox); use only when already sandboxed. |
| copilot | `--plugin-dir` on a per-rep copy of the plugin | `copilot -p --output-format json --allow-all-tools --no-ask-user --no-auto-update --disable-builtin-mcps --no-custom-instructions`; first turn `--session-id=<id>`, later turns `--resume=<id>` | `COPILOT_HOME` per rep. Auth is `GH_TOKEN` (env or `gh auth token`), passed as env only, never written; none fails closed. User-level skill dirs such as `~/.agents/skills` stay visible (same skill names). Reports premium requests, not cost: result cost is 0. Inside a sandbox that intercepts TLS, Copilot cannot authenticate; run it outside. |
| claude | `--plugin-dir` on a per-rep copy of the plugin | `--permission-mode dontAsk --allowedTools 'Bash Read Write Edit Glob Grep Skill'`, `--strict-mcp-config`, `--setting-sources project` | per-rep plugin copy and sandbox env |
Unknown keys, assertions with no recognised check (`equals`, `absent`, `includes`, `excludes`, `min`),
duplicate ids, unknown skill names and badly shaped ids all fail it.

Agentic rows can forbid exact Trajectory tool names with `tools: {forbidden: [...]}`. The check covers every turn in a rep and reports failures under the stable `tools` check id.
Script checks can match argument prefixes with `requiredCalls` and `forbiddenCalls`, for scripts that expose both read-only and mutating commands. Use `turnScripts` with one script-check object per turn when consent timing matters; `scripts` still checks the whole rep.

## Tier1 is the cross-harness baseline

Tier1 runs `node <skills>/.../x.mjs` against a copy of `fixtures/data-root` with `CHEF_DATA_ROOT` set. It never starts Claude, so any harness can reuse it.

`--skills-dir <dir>` is the cross-harness input: a directory of built skill folders (default `plugins/chef/skills`, the Claude plugin layout). Point it at another harness's installed skills to check the same scripts there:

    node evals/tier1/run.mjs --skills-dir <dir> [--fixture <data root>] [--cases <file or dir>]

## Layout and authoring

Tier1 rows live in `tier1/cases/<skill>.json` (`chef-setup.<topic>.json` when a skill outgrows 1,000 lines); keep every data file under 1,000 lines. `lib/load-cases.mjs` is the only reader: it concatenates the files and throws on a duplicate id across files. Agentic rows stay in `agentic/rows.json`.

Move multi-line text out of the JSON. A seed entry takes `seedFile` instead of `content`, and an agentic turn can be `{"turnFile": ...}`. Both are repo-relative paths under `evals/tier1/inputs/` or `evals/agentic/inputs/` (one folder per row id by convention); lint checks they exist. Short strings stay inline.

Every tier1 case needs `git` (`{headUnchanged, clean}` checked after the command). Use `git: false` with a short `gitReason` only when the case cannot be checked, e.g. `fixture: "none"` has no data root. A case whose command commits its own writes takes `{clean: true}`.

New rows: `bun run evals:new <tier1|agentic> <skill> <slug> [--topic <topic>] [--from-repro <case_id>] [--expect-failure <check>]` appends a skeleton with id `<skill>-<slug>` to the right file and refuses an id that exists. `--from-repro` also sets `repro` and `known_failure` to the case id (the case file must exist in `repro/`). Agentic repro rows require `--expect-failure` with one of `response`, `skills`, `scripts`, `tools`, `files`, `git-state` or `post-run`. A marked row passes only when a valid rep fails that check, no valid rep fails another check, and no rep is invalid. Fill in the TODOs, then run `bun run evals:lint`. `--topic` picks the file for a topic-split skill (`chef-setup`: `settings`, `dietary`, `maintenance`) and is required there.

## Flip pairs (agentic)

A flip pair is two rows with `pair: <id>`, the exact same `turns`, and different `seed`/`setup`, so the same prompt must end differently because of data state (constraint declared or not, plan present or not, goal set or not, proposal rejected or new). The opposite outcomes must show in each row's own checks (skills, scripts, files, git). `evals:lint` fails if a pair id has other than two rows or the turns differ. Pairs avoid `{today}`, start ungated, and follow the id rule below; give both rows a scenario that says which side they are (`...-present-refuses`, `...-absent-saves`). Keep them as `chef-meal-planning-dairy-constraint-*`, `chef-meal-logging-plan-*`, `chef-health-goals-check-in-goal-*` and `chef-recipe-decisions-*`.

The fixture holds a dairy-flagged recipe (`creamy-tomato-soup`) and one with no allergen flags (`roasted-vegetable-quinoa-bowl`), both over 60 minutes and without garlic, rice or tags the tier1 searches use. Tier1 assertions on recipe counts use `min` so the frozen `schema-v<n>` fixtures (fewer recipes) still pass `bun run migrations`.

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

## Grounding

Rows must resolve against `fixtures/data-root`, checked by `evals/grounding.test.mjs` (runs with `node --test`, so in CI):

- `grounding` (optional, in tier1 cases and agentic rows) declares the fixture facts the item relies on: `recipes` (slugs), `inventory` (item keys), `mealPlans` (plan slugs). Each must exist in the fixture; a recipe the item's inputs name from the fixture must be declared.
- The test also scans `recipe`/`slug` values and `--recipe`/`--slug` flags in `seed`, `afterCommitSeed`, `setup`, `turns`, `stdin`, `command` and `steps`. A slug must be in the fixture or created by the item's own seed (a seeded recipe page, proposal or draft). Assertions are not scanned.
- Rows must not depend on the wall-clock date: use fixed dates, never `{today}` (the lint rejects it).
