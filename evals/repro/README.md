# Reproduction cases

One file per case: `evals/repro/<case_id>.json`, validated against
`schemas/feedback/reproduction-case.v1.json`. A case is hand-written against synthetic data and
holds no text from any feedback report. `provenance_refs` are the random IDs feedback intake
minted for the reports behind it, never a `report_id`. `bun run repro` lints every case; CI runs it.

## Scenario and test

`scenario.fixture` names the base synthetic fixture under `fixtures/` (`data-root`, or a frozen
`schema-v<n>` for a schema-specific case). `scenario.test` points at the test that reproduces it:

| `target` | `scenario.test` |
|---|---|
| `deterministic-test` | `tier1:<row id>` (`evals/tier1/cases.json`) or `conformance:<id>` (adapter conformance suite, not built yet) |
| `agentic-eval` | `agentic:<row id>` (`evals/agentic/rows.json`) |
| `docs` | `docs:<repo path>`; no regression check, kept for provenance and counting |
| `none` | no test: a reproduced won't-fix, or a Muse-only manual reproduction recorded in `steps` |

The row carries `repro: <case_id>`, and any case-specific data as an inline `seed` overlay on the
shared fixture. The lint fails when the two links disagree in either direction, or when a row's
fixture differs from `scenario.fixture`.

## Landing a case before its fix

Mark the row `known_failure: <case_id>` (same value as `repro`). tier1 then reports the row
without failing CI and fails if it passes, so the fix PR drops the marker. An agentic
`known_failure` row passes the suite while it fails at least one rep. The lint fails a marker
more than 60 days after the case's `created_on`. Agentic repro and `known_failure` rows run in
`RELEASE-CHECKLIST.md` with `bun run agentic --repro --reps 5`, since the agentic suite never
runs in CI.

## Privacy

The lint runs the PII pattern scan (`src/lib/pii-scan.mjs`: email, URL, phone, street address,
home-directory path, long digit runs) over every case, every tier1 and agentic seed, and
`fixtures/`. Only reserved example domains (`example.com`) and schema vocabularies pass.
Findings name the file, line and rule, never the matched text.

`testdata/` holds the synthetic example case and row that `example.test.mjs` runs end to end.
