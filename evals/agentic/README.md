# Agentic gates

## Promotion criteria

An agentic row starts with `gate: false`. Promote it to `gate: true` only when all of these are true:

- A normalizer emits valid result metadata, `evals:lint` passes, and the row has fixture-grounding metadata for every declared fixture fact.
- The row has a verified grounding review for the scenario, including exact fixture refs and fixed dates.
- Candidate rows collect the scheduled evidence: the scheduled run executes gated and candidate rows.
- The latest scheduled run is a `3/3` pass for at least three consecutive runs on the Claude harness with its default model.
- The passing summary is archived under `evals/agentic/archive/` and verifies against the evaluated tree.
- The row has no invalid reps and no unrelated behavioral failures.

Do not gate a known-failure row. Reassess gated rows after harness, Projector, dataset, fixture, or skill changes.

## Hosted workflow

Scheduled and GitHub-hosted agentic promotion is disabled. There is no active hosted workflow; do not treat prior hosted or scheduled results as local release evidence. Do not use API credentials or separately billed APIs for release judging.

## Local subscription-backed judge

The answer-quality judge runs through an authenticated CLI subscription. Select it independently from the row host:

```sh
bun run agentic --harness codex --judge-harness claude --judge-model <model> --reps 3
```

Authenticate Claude Code, Codex or Copilot before the run. Supported choices are `claude`, `codex` and `copilot`. There is no `OPENAI_API_KEY` fallback. Empty, malformed, unavailable or errored judge output fails that row; never retry a failed or invalid repetition.

## Release evidence

Use a clean prepared release tree and run the entire agentic dataset 3/3 on each local launcher:

```sh
bun run agentic --harness codex --judge-harness claude --judge-model <model> --reps 3
bun run agentic --harness claude --judge-harness claude --judge-model <model> --reps 3
bun run agentic --harness copilot --judge-harness claude --judge-model <model> --reps 3
bun run agentic:verify --release <codex.json> <claude.json> <copilot.json> --reps 3
```

Commit summaries and use an optional exception file only for a maintainer-approved subscription-limit exception:

```json
[{ "host": "codex", "approved_by": "maintainer", "reason": "subscription limit", "missing_rows": ["row-id"] }]
```

An exception is not a pass and must identify missing coverage. Raw transcripts and credentials remain local.
