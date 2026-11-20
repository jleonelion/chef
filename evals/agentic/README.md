# Agentic gates

## Promotion criteria

An agentic row starts with `gate: false`. Promote it to `gate: true` only when all of these are true:

- A normalizer emits valid result metadata, `evals:lint` passes, and the row has fixture-grounding metadata for every declared fixture fact.
- The row has a verified grounding review for the scenario, including exact fixture refs and fixed dates.
- The latest scheduled run is a `3/3` pass for at least three consecutive runs on the default model.
- The passing summary is archived under `evals/agentic/archive/` and verifies against the evaluated tree.
- The row has no invalid reps and no unrelated behavioral failures.

Do not gate a known-failure row. Reassess gated rows after harness, Projector, dataset, fixture, or skill changes.

## Scheduled workflow

`.github/workflows/agentic.yml` runs weekly and supports manual dispatch. It runs `bun run agentic --gates-only --reps 3` for a selected harness. It must never run agentic evals in PR CI or push CI.

Configure repository Actions secrets:

- `CHEF_EVAL_CLAUDE_API_KEY`: Anthropic API key for the Claude harness.
- `CHEF_EVAL_CODEX_AUTH_JSON`: Base64-encoded Codex `auth.json` for the Codex harness.
- `CHEF_EVAL_COPILOT_TOKEN`: GitHub token accepted by Copilot for the Copilot harness.

Use environment variable names only through the workflow; never commit credentials or raw harness transcripts. The workflow maps secrets to `ANTHROPIC_API_KEY`, `CODEX_HOME/auth.json`, or `GH_TOKEN` inside the runner.

The workflow uploads `evals/agentic/archive/*.json` and fails when any gated row fails or produces an invalid rep.
