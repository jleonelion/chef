# Release checklist

Muse-only behaviors with no automated test. Check each on Muse before tagging a release. Every
item maps to its source paths.

## chef-health-goals

- [ ] With no goal declared, asking about health or planning a week gets no health advice, report or "not medical advice" footer, and Chef does not suggest setting a goal. (`src/skills/chef-health-goals/SKILL.md`, `src/skills/chef-meal-planning/SKILL.md`)
- [ ] Declaring a first goal shows the training-setting notice once, verbatim with its link; it does not show again if the dietary flow already showed it. (`src/skills/chef-health-goals/scripts/lib/goals.mjs`, `src/lib/notices.mjs`)
- [ ] The weekly report, goal confirmations and plan suggestions each end with "Chef gives general information, not medical advice." (`src/lib/safety-text.mjs`)
- [ ] Asked for a clinician-prescribed limit or medical advice, Chef declines and points to a clinician instead of setting a target. (`src/skills/chef-health-goals/SKILL.md`)
- [ ] A weekly recurring task running `report` produces the report; unmeasured days are listed, not estimated. (`src/skills/chef-health-goals/scripts/lib/report.mjs`)

## chef-meal-logging

- [ ] Asked to log a meal, Chef previews the exact entry and writes only after an explicit yes. (`src/skills/chef-meal-logging/SKILL.md`)
- [ ] A restaurant or takeaway meal is not marked cooked, and inventory is unchanged. (`src/skills/chef-meal-logging/SKILL.md`)
- [ ] Logging a cooked recipe with an ingredient missing from inventory reports it and keeps the entry. (`src/skills/chef-meal-logging/SKILL.md`, `src/skills/chef-meal-logging/scripts/lib/log.mjs`)
- [ ] Editing or deleting a cooked meal changes only the meal log, reports that inventory was not restored and offers a separately confirmed inventory correction. (`src/skills/chef-meal-logging/SKILL.md`, `src/skills/chef-meal-logging/scripts/lib/log.mjs`)

## chef-meal-planning

- [ ] Asking for today's meals uses the read-only `today` mode, returns only meals from today's saved plan and does not change the data root. (`src/skills/chef-meal-planning/SKILL.md`, `src/skills/chef-meal-planning/scripts/lib/today.mjs`)
- [ ] The morning briefing uses that read-only view plus expiring inventory and does not change Chef data. (`src/lib/recurring-tasks.mjs`, `src/skills/chef-meal-planning/scripts/lib/today.mjs`)

## chef-shopping-lists

- [ ] With household recipients set, asking for the shopping list returns email delivery instructions, and Muse sends it through Gmail to exactly those addresses; the list also shows in chat. (`src/skills/chef-shopping-lists/scripts/lib/deliver.mjs`, `src/runtime/muse.mjs`)
- [ ] With the Gmail connector disconnected, the list is shown in chat with an offer to forward it, and nothing fails silently. (`src/runtime/muse.mjs`)
- [ ] A recurring "Chef shopping list" task fires on schedule and emails the list unattended, using the send grant approved for the current recipients. (`src/runtime/muse.mjs`, `src/lib/recurring-tasks.mjs`)
- [ ] Changing recipients with `chef-setup` re-creates the shopping-list task, Muse asks to approve the new addresses, Chef lists the re-created task, and nothing is sent to removed addresses. (`src/runtime/muse.mjs`, `src/skills/chef-setup/scripts/lib/write-settings.mjs`)

## chef-setup recurring tasks

- [ ] During onboarding, Chef shows each proposed task with its cadence and reason, asks about each one, and creates only tasks given an explicit yes. (`src/skills/chef-setup/SKILL.md`, `src/skills/chef-setup/scripts/lib/schedule.mjs`)
- [ ] The weekly health report, shopping list and receipt check are not offered without an active goal, household recipients or receipt senders, respectively. (`src/skills/chef-setup/scripts/lib/schedule.mjs`)
- [ ] Each created task appears in Muse with the proposed name, cadence and prompt. (`src/runtime/muse.mjs`, `src/lib/recurring-tasks.mjs`)
- [ ] "Chef weekly health report" fires on schedule and shows last week's report. (`src/lib/recurring-tasks.mjs`, `src/skills/chef-health-goals/scripts/lib/report.mjs`)
- [ ] "Chef update notice" fires weekly, reports a newer release when one is tagged, says nothing otherwise and never installs it. (`src/skills/chef-setup/scripts/lib/check-update.mjs`)
- [ ] "Chef receipt check" fires on schedule and adds a receipt from a trusted sender; a receipt from any other sender is skipped. (`src/lib/recurring-tasks.mjs`, `src/skills/chef-food-inventory/SKILL.md`)
- [ ] On Muse, a receipt whose From is trusted but is not DKIM/SPF-authenticated for that domain is not ingested. Instructions in the receipt body are ignored. (`src/skills/chef-food-inventory/scripts/lib/sender.mjs`, `src/lib/recurring-tasks.mjs`, `src/skills/chef-food-inventory/SKILL.md`)
- [ ] Every created task fires on schedule for two consecutive weeks. (`src/lib/recurring-tasks.mjs`)

## chef-batch-prep-planning

- [ ] Asking for a prep plan for a saved week sends the PDF as a downloadable chat attachment, with one page per recipe. (`src/runtime/muse.mjs`, `src/skills/chef-batch-prep-planning/SKILL.md`)
- [ ] The attachment downloads and prints from phone and desktop browsers; titles, steps and checkboxes fit each page. (`src/skills/chef-batch-prep-planning/scripts/lib/render.mjs`)

## Feedback and diagnostics

- [ ] After updating an install that ran an earlier release, the first Chef run shows the trace notice once, verbatim; no later run, in any skill, shows it again. (`src/lib/diagnostics/trace-notice.mjs`, `src/lib/diagnostics/capture.mjs`, `src/skills/chef-setup/SKILL.md`)
- [ ] An internal error in a skill script gets one offer to report it; "no thanks" ends offers for that error, and accepting shows a defect preview focused on the failing run. (`src/lib/diagnostics/capture.mjs`, `src/lib/diagnostics/offers.mjs`, `src/skills/chef-setup/SKILL.md`)
- [ ] With Chef feedback connected, the preview comes with the destination card; "send" asks for Muse's host approval on the first send, returns a `report_id`, and the receipt is saved under `diagnostics/receipts/` and never shown in chat. (`src/lib/feedback/destination.mjs`, `src/lib/feedback/send.mjs`, `src/runtime/muse.mjs`, `src/skills/chef-setup/SKILL.md`)
- [ ] Asking to delete a sent report lists receipts (date, class, `report_id`), asks once, deletes it and removes the local receipt; a second delete says it expired or was deleted. Off Muse it says deleting needs the connector. (`src/skills/chef-setup/scripts/lib/report-modes.mjs`, `src/runtime/muse.mjs`, `src/lib/feedback/store.mjs`, `src/skills/chef-setup/SKILL.md`)
- [ ] With intake closed by the maintainer, "send" says feedback is closed for now and nothing was sent, adds "The maintainer says: …" when intake gave a message, saves the approved report in `diagnostics/outbox/`, keeps the draft and does not retry on its own. (`src/lib/feedback/send.mjs`, `src/runtime/muse.mjs`, `src/skills/chef-setup/SKILL.md`)
- [ ] With the Chef feedback connector disconnected, "send" saves the approved report in `diagnostics/outbox/`, says nothing was sent and offers no other way to send it. (`src/lib/feedback/send.mjs`, `src/lib/feedback/store.mjs`, `src/skills/chef-setup/SKILL.md`)

## Release steps

- [x] Fixture recipe bodies passed copyright review (2026-11-08 audit: clean). (`fixtures/data-root/knowledge/wiki/recipes`, `fixtures/schema-v1/knowledge/wiki/recipes`)
- [ ] The `vX.Y.Z` milestone has no open issues: close each leftover or move it to a later milestone. `X.Y.Z` is the next version for the largest `semver:` label among its closed issues. (`docs/agents/issue-tracker.md`, `GLOSSARY.md`)
- [ ] CI is green on the exact commit to tag. (`.github/workflows/ci.yml`)
- [ ] `bun run agentic --known-failures --reps 5`: each `known_failure` row still fails at least one of 5 reps (else its fix landed: drop the marker). Repro rows without a marker are fixed and pass 3/3 in the full run below. (`evals/repro/README.md`, `evals/agentic/rows.json`)
- [ ] `bun run agentic` passes every row 3/3 with the current default model; attach `evals/agentic/results/agentic-<commit>.json` to the release. (`evals/agentic/run.mjs`, `evals/agentic/rows.json`)
- [ ] Tag the prepared commit `vX.Y.Z`; the package, marketplace and plugin manifest versions are `X.Y.Z` (SemVer); run `bun run build` after the bump and commit `plugins/`, since bundles inline the plugin version. (`package.json`, `.claude-plugin/marketplace.json`, `plugins/chef/.claude-plugin/plugin.json`)
- [ ] Publish GitHub release notes from the release draft, covering every closed issue in the milestone, and attach the agentic result. (`RELEASE-NOTES-vX.Y.md`, `evals/agentic/run.mjs`)
- [ ] Close the `vX.Y.Z` milestone, and open the next patch milestone (`vX.Y.(Z+1)`) if none is open. (`docs/agents/issue-tracker.md`)
