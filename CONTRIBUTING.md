# Contributing

Thanks for helping. Changes land only through pull requests from forks; the maintainer reviews
and merges each one. Nobody else has push access to this repo.

## Workflow

1. Fork `jleonelion/chef` and clone your fork.
2. Branch off `main`: `git switch -c fix/short-description`.
3. Install and check:

   ```sh
   bun install --frozen-lockfile
   bun run check
   bun run build   # commit the built output; CI fails on drift
   ```

4. Push to your fork and open a PR into `jleonelion/chef:main`. Keep it to one logical change.
5. CI on fork PRs waits for maintainer approval before it runs.
6. The maintainer reviews. Address comments with new commits and resolve each conversation.
   All required checks must pass; there is no override. PRs are squash-merged.

## Rules

- No real names, addresses or personal emails anywhere. Use `example.com`.
- Never commit secrets, API keys or real household data. Use the synthetic fixtures.
- Tests run offline. Don't add calls to live APIs.
- Terms follow `GLOSSARY.md`; architectural decisions go in `docs/adr/`.

## Development commands

Contributor setup requires Node 20 or later and Bun. Use the Bun version declared in
`package.json`. Start with the [architecture guide](docs/architecture.md) for execution flow,
runtime adapters and the source layout. Change skill source under `src/`, not generated
files under `plugins/chef/skills/` directly.

| Command | What it does |
| --- | --- |
| `bun install --frozen-lockfile` | Install the locked source dependencies |
| `bun run build` | Bundle `src/skills/*` into `plugins/chef/skills/*`; commit the output, since CI rejects drift |
| `bun run check` | Skill-format lint, unit tests, eval dataset lint, tier1 evals, reproduction-case lint and migration regression |
| `bun run evals:new <tier1\|agentic> <skill> <slug> [--topic <t>]` | Scaffold an eval row; agentic reproduction rows also need `--expect-failure <check>` |
| `bun run evals:lint` | Validate tier1 and agentic datasets against `schemas/evals/` |
| `bun run repro` | Check reproduction-case schema, test links, known-failure age and private-data patterns |
| `bun run smoke` | Run tier1 against a copy of the built skills outside the repository |
| `bun run hygiene` | Scan files and commit metadata; `CHEF_HYGIENE_DENY` adds private deny-list patterns |
| `bun run agentic` | Run the agentic suite locally; uses authenticated CLI usage |

See the [eval guide](evals/README.md) for dataset authoring, supported harnesses, row selection,
result formats and fixture grounding; the [agentic guide](evals/agentic/README.md) for judge
setup, promotion criteria and local release gates; and the
[reproduction-case guide](evals/repro/README.md) for regression cases. Agentic runs do not run
in CI. Each repetition uses a fresh synthetic fixture and a headless runtime with the built
skills. Behavioral failures and invalid executions are distinct, and the runner never retries
a failed or invalid repetition. Archive summaries as directed by the release gate, not raw logs.

Agentic checks consume a runtime-neutral Trajectory, not raw transcripts. Per-runtime Projectors
produce the Trajectory; their recording fixtures and re-record instructions are documented in
[`trajectory.test.mjs`](evals/agentic/trajectory.test.mjs). Script-call assertions and
should-not-act checks are described in the eval guide.

Tests never call USDA. Tier1 clears `CHEF_USDA_FDC_KEY`, but on a Muse VM a USDA connector
takes precedence and could reach the live API. Run offline checks outside that connected runtime.
Use [synthetic and frozen schema fixtures](fixtures/README.md), never real household data.

Skill-format lint accepts the ten v1 skill names declared by `V1_SKILLS` in
[`scripts/lib/skill-format.mjs`](scripts/lib/skill-format.mjs). It imports source and built entry
scripts after dependencies are installed and compares exported modes, flags and statuses with
`SKILL.md` and the invocation fact registry. Missing skills are errors at plugin version 1.0.0
or later, or with `node scripts/lint-skills.mjs --release`.

## Required checks you can't pass from a fork

- `hygiene` needs a deny list stored as a repo secret. Fork PRs get no secrets, so this check
  fails on every fork PR. The maintainer runs it on a branch in this repo before merging. Run
  `bun run hygiene` locally to catch the `example.com` email rule early.
- `overlap-review-gate` passes unless the PR touches `evals/repro/`. In that case the maintainer
  runs the overlap review in feedback intake.

## Issues

Bugs and ideas go in GitHub Issues. Include steps to reproduce and the harness you used.
