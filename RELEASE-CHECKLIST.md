# Release checklist

Gates to pass before tagging a release. None needs a Muse VM: Muse-only behaviors are not
release-gated, and a live-VM check is a maintainer follow-up, not a prerequisite. Every item maps
to its source paths.

## Release steps

- [x] Fixture recipe bodies passed copyright review (2026-11-08 audit: clean). (`fixtures/data-root/knowledge/wiki/recipes`, `fixtures/schema-v1/knowledge/wiki/recipes`)
- [ ] The `vX.Y.Z` milestone has no open issues: assess completed work before closing, or propose moving unfinished work to a later milestone. Compare the exact release commit with the previous tag; its changes determine the minimum version, cross-checked against issue assessments and `semver:` labels. Intake-only prerequisites do not set the Chef version. Resolve discrepancies before tagging. (`docs/release-planning.md`, `GLOSSARY.md`)
- [ ] If the release changes `schemas/feedback/`, the intake release that accepts the new schema is live in production before this release is published; otherwise skip. See the intake repo's `docs/compatibility.md` for the support window and deploy order. (`schemas/feedback/`, `jleonelion/chef-feedback-intake` `docs/compatibility.md`)
- [ ] CI is green on the exact commit to tag. (`.github/workflows/ci.yml`)
- [ ] Major or minor releases only; skip for patch releases. `bun run agentic --known-failures --reps 5`: each `known_failure` row still fails at least one of 5 reps (else its fix landed: drop the marker). Commit the passing or failed summary from `evals/agentic/archive/`, then verify it with `bun run agentic:verify <result> --known-failures --reps 5`. Repro rows without a marker are fixed and pass 3/3 in the full run below. (`evals/repro/README.md`, `evals/agentic/rows.json`)
- [ ] For v1.4.0, run the entire agentic dataset 3/3 locally on Codex, Claude Code and GitHub Copilot from a clean prepared tree. Authenticate each subscription-backed launcher and choose the independent CLI judge with `--judge-harness` and `--judge-model`; no API key or separately billed API is required. Commit every summary, including failures, under `evals/agentic/archive/`. Verify all three summaries with `bun run agentic:verify --release <codex.json> <claude.json> <copilot.json> --reps 3`. Every behavioral row, every semantic judge row and every repetition must pass; invalid or missing reps, zero rows and partial selection fail the gate. If subscription limits prevent coverage, use a maintainer-approved exception file naming the host and missing rows; record it as an exception, never as a pass. (`evals/agentic/README.md`, `evals/agentic/rows.json`)
- [ ] Only when a Harness launcher or Projector changed: `bun run agentic:smoke --harness <name>` passes for each changed harness (local, not CI), and `bun run agentic --harness <name>` rows match across harnesses by row. (`evals/agentic/smoke.mjs`, `evals/README.md`)
- [ ] Tag the prepared commit `vX.Y.Z`; the package, marketplace and plugin manifest versions are `X.Y.Z` (SemVer); run `bun run build` after the bump and commit `plugins/`, since bundles inline the plugin version. (`package.json`, `.claude-plugin/marketplace.json`, `plugins/chef/.claude-plugin/plugin.json`)
- [ ] Publish GitHub release notes from the release draft, covering every closed issue in the milestone, and (major or minor releases) attach the agentic result. (`RELEASE-NOTES-vX.Y.md`, `evals/agentic/run.mjs`)
- [ ] Close the `vX.Y.Z` milestone, and open the next patch milestone (`vX.Y.(Z+1)`) if none is open. (`docs/agents/issue-tracker.md`)
