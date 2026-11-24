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

Judge targets describe reply quality, not proof of file writes or search results.
For `chef-add-recipe-pasted-text`, the reply confirms the saved title and reports
enrichment, as `chef-add-recipe` instructs. It need not explain how to find the
recipe or repeat ingredients and steps. The row checks search separately.
It requires exactly five raw sources, four fixture files plus one new source,
and checks the new source's name, ingredients and steps. A count check's optional
`pattern` filters relative file names; its `assertions` check every matched file's
text. Keep a positive exact count so content checks cannot pass without a match.

Per-repetition console lines and the final failure digest include judge failures,
even when deterministic behavior passes. Judge failures do not change behavioral
pass counts or turn valid executions into invalid ones.

## Codex skill reads

Codex has no skill tool. Its Projector detects `SKILL.md` file operands read by
`cat`, `sed`, `head`, `tail`, `rg` or `grep`, including commands wrapped in
`sh`, `bash` or `zsh` with `-c` or `-lc`. It recognizes literal
`skills/<name>/SKILL.md` paths and one unquoted comma-list brace group in the
skill directory, such as `skills/chef-{meal-planning,recipe-search}/SKILL.md`
or `skills/{chef-meal-planning,chef-recipe-search}/SKILL.md`.
Names retain command and brace-list order. Quoted or escaped braces are literal,
not expansions. Reply text, tool output, comments, output destinations and
commands that only mention paths do not fire skills. Parsing never executes
transcript commands. Command substitutions and here-documents are unsupported
and skipped; this is not a general shell interpreter.

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

The v1.4.0 Codex evaluation reported in [#223](https://github.com/jleonelion/chef/issues/223)
used a stale two-source baseline and an ambiguous reply target for the pasted
recipe. Its completed repetition's five sources do not show a Chef storage
failure, but its archived judge failure remains a failure under that run's
target. Do not edit or retrospectively pass that evidence. Dataset and judge
changes require fresh evidence against the corrected tree. Focused deterministic
regressions or a selected-row run cannot establish the full three-host release
gate. The other repetitions' timeouts remain unresolved by this correction.

The same run missed brace-expanded skill reads, tracked in
[#224](https://github.com/jleonelion/chef/issues/224). Static reprojection can
identify those reads but cannot recover deleted data-root snapshots or establish
a new release pass. Keep the archived summary and judge verdicts unchanged.
Dietary denial assertions remain in force; the override-consent assertion
mismatches in [#230](https://github.com/jleonelion/chef/issues/230) are separate.
A Projector correction requires fresh exact-tree, full three-host 3/3 evidence,
not retrospective reclassification of the old run.
