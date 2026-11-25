# Chef v1.4.0

Draft release notes. This candidate is not a published or verified release.
It starts from main at `7e4c6f952d659728d44f4d54f25e51307f154f46`
and covers changes since published v1.3.1. The refreshed candidate also
includes main through `85b10b2d7a3cb0766fe96de08d2b437680991fc7`.

This preparation supersedes [draft #221](https://github.com/jleonelion/chef/pull/221).
That draft, its evaluated commit `12111a655d2fa22fd55d1da4bccec6aecc66073c`
and its failed evidence remain unchanged. No old result establishes a pass for
this candidate.

## Changes

- Plan meals out, simple foods and leftovers alongside saved recipes. Leftovers
  point to an earlier recipe meal in the same week. Shopping lists and batch
  prep count the servings to cook once; nutrition counts the servings eaten.
  Free-text food is shown but never shopped for, prepped or given estimated
  nutrition. (#89)
- Log planned recipes, free-text food and leftovers after confirmation with
  `log --from-plan`. Chef copies the planned fields in code, asks whether
  non-leftovers meals were cooked at home and refuses to mark leftovers as
  cooked. A whole-day operation logs all selected meals or none. Logging
  leftovers never deducts inventory again. (#70)
- Add an optional household roster and choose each meal's eaters. Meal plans
  include per-member nutrition at one serving per eater. Extra servings stay
  in household totals as unattributed servings. Missing recipe nutrition stays
  incomplete, and free-text food stays unmeasured. (#127)
- Set member-specific health goals and compare each member's planned nutrition
  with daily and weekly targets. Unknown members are rejected, missing nutrition
  is reported rather than estimated, and unattributed servings do not count
  toward anyone's targets. Legacy single-goal files remain supported. (#139)
- Add or remove dietary constraints, household recipients, trusted receipt
  senders and health targets without replacing the rest of each list. Existing
  replace flags keep their meaning; conflicting replace and merge flags are
  rejected. (#187)
- Give receipt items explicit inventory destinations and pass exact ingredient
  matches with `--match` for shopping and cooked-meal deductions. Existing
  placement fallback remains available. Invalid paths are rejected; incompatible
  units are not guessed or converted. Standing-rule guidance now asks Chef to
  expand the foods a rule covers. (#191)
- Inventory `health` redraws a page left in old units and reports whether it
  regenerated it. Shopping replies show the generated list text with its
  dietary notes once. Optional inventory reads must not replace the list's
  quantities, incomparable-stock details or request to check that stock.
  (#190, #235)
- Receipt sender refusals preserve the returned cause and exact sender. An
  untrusted sender is not misreported as merely missing authentication;
  refused email bodies remain unread and are not ingested. (#233)
- Saved-recipe confirmations use the recipe title without filesystem paths
  or links. Enrichment details remain part of the confirmation. (#256)
- Feedback reports rejected as `unsupported-schema-version` now explain that
  Chef needs updating and keep the approved report unchanged. (#121)

## Contributor and evaluation changes

- Agentic evaluations share Claude Code, Codex and GitHub Copilot launchers,
  runtime-neutral trajectories and sandbox preparation. Results archive
  provenance and distinguish invalid executions, behavioral failures and
  flakiness. (#148, #149, #150, #152, #155)
- Dataset lint, fixture grounding, split tier1 cases and `evals:new` support
  authoring. Coverage adds data-state pairs, routing and authorization cases,
  stronger file and PDF checks, and candidate rows. (#154, #157, #158, #159,
  #160, #161, #162)
- Reply deny lists and semantic judging supplement deterministic checks.
  Release judging uses an independently selected subscription-backed CLI,
  without an API-key fallback. The v1.4.0 gate requires the full dataset 3/3
  on all three local hosts. Hosted agentic runs are disabled, and no rows are
  promoted to gated status. (#151, #156, #212)
- Corrected assertions cover household-recipient wording, recurring-task consent,
  pasted-recipe storage and reply targets, Codex brace-expanded skill reads,
  dry versus canned lentils,
  grouped PDF dates, meal-slot case, unchanged leftovers inventory, grouped
  health targets, scoped dietary assent, explicit email confirmation and
  read-only skill use. Historical failed results remain failures.
  (#153, #222, #223, #224, #225, #226, #227, #228, #229, #230, #231, #232)
- Installed-script checks now observe entrypoint identity, hashes, arguments
  and installed-pack integrity. Modified or external copies cannot satisfy
  required Chef execution. This local instrumentation does not attest hostile
  agents or prove live connector behavior. (#234)
- Codex installs Chef separately from its managed system skills, preventing
  host initialization from falsely invalidating the installed pack.
  Integrity checks remain unchanged. Launcher version 4 introduced that
  layout; version 5 retains selected-model evidence. (#254, #258)
- Skill-contract lint checks documented script modes, flags and statuses.
  Contributor docs now describe fork-based PRs and merge-gated review; the
  README links to focused guides. (#193)
- Feedback intake's reproduction-case overlap review and sanitized issue
  authoring are separate service work, not new installed Chef commands.
  Chef PRs touching `evals/repro/` require the intake overlap-review status.
  Intake version-range controls, counts export and review procedures are also
  service-side work. Closed issues do not establish the production deployment
  or schema compatibility required for this candidate. (#84, #85, #121)

## Compatibility

The actual diff since v1.3.1 supports a minor release: it adds planned-meal
kinds, roster and goal fields, and flags. No skill is renamed or removed, and
no data-root schema-version bump or mandatory migration is introduced.
Without the optional roster, existing household serving defaults remain.
Existing replace flags, single-goal files and recurring-task prompts keep
their meanings. Inventory `health` now regenerates old-unit pages, so it
must not be treated as strictly read-only.

`schemas/feedback/facts.v1.json` adds operations, statuses and a recipe-search
status fact. The maintainer accepted the compatibility review as complete.
Actual candidate report builders, intake validation, older-client reports
and local storage checks passed. The live health endpoint responded, but
production deployment identity and version settings remain unverified.
This acceptance does not claim a production report submission or intake deploy.

## Release readiness

This draft must not merge until the release gates are satisfied:

- Fresh exact-tree, full-dataset 3/3 evaluations on Codex, Claude Code and
  GitHub Copilot, including every semantic judge row, are still missing.
  Archive every summary, including failures, and run the release verifier.
  A maintainer-approved subscription-limit exception is not a pass.
- The current dataset has 39 rows, eight judge-scored, zero gated and zero
  marked `known_failure`. Known-failure verification is N/A: zero marked rows,
  not a zero-row run presented as evidence.
- Tracker #163 remains open. Do not close it or the v1.4.0 milestone merely
  because offline checks pass.
- CI must pass on the eventual exact release commit. Offline deterministic
  checks do not prove live agent quality, connector delivery or intake
  compatibility. Changed launchers and Projectors also need the applicable
  local smoke and cross-host checks in `RELEASE-CHECKLIST.md`.
- The maintainer accepted the earlier Muse choice-card check in #138.
  The separate live fault-injection check in #145 was deferred, not passed.
  Neither disposition provides new three-host evidence for this candidate.

No live agent, judge, launcher-smoke or service checks were run for this
preparation. Nothing has been merged, tagged or published.

## Preparation checks

Offline checks used Bun 1.3.14 and Node v22.21.1. Test scratch directories
stayed inside the new preparation worktree via `TMPDIR`.

- `node scripts/lint-skills.mjs`: passed for all ten skills.
- `node --test`: 937 passed, one failed. The known #218 contract test expects
  empty stderr, but this session injects `NODE_USE_ENV_PROXY=1`, which emits
  Node's experimental proxy warning. No test or application code was changed.
- `env -u NODE_USE_ENV_PROXY node --test`: 938 passed, zero failed.
  This separate offline run removes the proxy configuration, not warnings or
  assertions. It does not fix #218 or erase the initial failed run.
- `node evals/lint-datasets.mjs`: passed, 96 tier1 cases and 39 agentic rows.
- `node evals/tier1/run.mjs`: 96/96 passed.
- `node evals/repro/lint.mjs`: passed, zero reproduction cases.
- `node evals/migration-regression.mjs`: passed, one frozen schema version
  with 96/96 tier1 cases.
- `node scripts/bundle-smoke.mjs`: passed, 96/96 tier1 cases and bundled
  install verification. This is not a live launcher smoke run.

`bun run build` could not initialize with the worktree as its startup
directory, reporting `CouldntReadCurrentDirectory`. Running the same build
entrypoint after changing directory inside Bun succeeded, from the main checkout:

```sh
bun -e 'process.chdir(".worktrees/release-1.4.0-refresh-20261125"); await import(process.cwd()+"/scripts/build.mjs");'
```

The resulting diff changes only the inlined version from 1.3.1 to 1.4.0 in
each of ten bundled entrypoints. A repeat build produced an identical diff.
The three release manifests agree on 1.4.0.
Dependencies and `bun.lock` are unchanged. The check-stage commands above
are the existing `bun run check` stages, run directly with Node because of
the Bun startup-directory problem; the aggregate command is not claimed
as a pass.

## Candidate refresh

The first Codex evaluation on the original prepared candidate stopped at
`chef-setup-receipt-intake`, repetition 1, with invalid installed-pack
provenance. That interrupted attempt remains invalid and incomplete.
Offline reproduction found that Codex created `.system` inside the monitored
directory without changing existing Chef entries. The historical temporary
directory was deleted, so its exact filesystem delta cannot be recovered.
The launcher fix in #254 requires fresh evaluation evidence; it does not
retrospectively pass the interrupted attempt.

Refresh checks passed with the command sandbox disabled:

- `bun run check`: ten skills linted, 939 tests passed, dataset lint passed,
  96/96 tier1 cases, reproduction lint and migration regression passed.
  This run needed no proxy-environment override and does not erase the
  original preparation's #218 failure.
- `node scripts/bundle-smoke.mjs`: 96/96 tier1 cases and bundled install
  verification passed.
- `node scripts/hygiene.mjs`: passed with zero local deny patterns.
  The CI secret deny-list check is still required.
- `node evals/agentic/smoke.mjs --harness <name>`: passed for Codex,
  Claude Code and Copilot, 96/96 tier1 cases each. These checks do not
  execute live model turns.
- All three release manifests still report 1.4.0. Bundles, source, schemas,
  fixtures and dependencies are unchanged from the original prepared
  candidate, so no rebuild was needed for the launcher-only fix.

## Evaluation repair

The next Codex attempt on `66158672e5b42a913eb5bc6ec1c44e6386856500`
completed six setup repetitions, then failed the pasted-recipe semantic
judge at 0.65 against the unchanged 0.7 threshold. The answer exposed an
absolute filesystem link. The judge also called Chef's mandatory first-use
invocation-trace notice unsolicited. The original judge verdict was recovered
from the local judge session without another call. The interrupted attempt
has no aggregate summary and remains failed and incomplete.

The recipe skill now confirms saved titles in plain text without filesystem
paths or links. Judges receive the exact required first-use notice as product
context; all other reply requirements remain. No row, required detail,
threshold or mechanical check was removed or relaxed. (#256)

Native `--fail-fast --concurrency 1` stops after the first failing, invalid or
judge-failed repetition and archives an honest partial summary. Unrun
repetitions are invalid as missing, not passes. Complete per-repetition judge
verdicts are saved locally before console reporting. Without the opt-in flag,
candidate-only exit behavior is unchanged. (#257)

Codex launcher version 5 observes its selected model from per-turn session
metadata before temporary-directory cleanup, without overriding its default.
Compact local evidence records the selected slug and session and turn IDs.
Missing or ambiguous evidence invalidates a completed turn rather than
guessing the model. This does not identify an undisclosed server-side revision.
(#258)

Only source and packaged skill documentation changed in the installed pack.
The files match; compiled entrypoints and all three 1.4.0 manifests remain
unchanged. No rebuild was needed or run for these repairs. Fresh exact-tree
checks and full Codex evaluation are required. Claude Code and Copilot host
evaluations remain outside this repair session's scope.
