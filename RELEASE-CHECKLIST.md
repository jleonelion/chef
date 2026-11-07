# Release checklist

Muse-only behaviors with no automated test. Check each on Muse before tagging a release. Each item names the source it maps to. Append items under your skill's section.

## chef-health-goals

- [ ] With no goal declared, asking about health or planning a week gets no health advice, report or "not medical advice" footer, and Chef does not suggest setting a goal. (`src/skills/chef-health-goals/SKILL.md`, `src/skills/chef-meal-planning/SKILL.md`)
- [ ] Declaring a first goal shows the training-setting notice once, verbatim with its link; it does not show again if the dietary flow already showed it. (`src/skills/chef-health-goals/scripts/lib/goals.mjs`, `src/lib/notices.mjs`)
- [ ] The weekly report, goal confirmations and plan suggestions each end with "Chef gives general information, not medical advice." (`src/lib/safety-text.mjs`)
- [ ] Asked for a clinician-prescribed limit or medical advice, Chef declines and points to a clinician instead of setting a target. (`src/skills/chef-health-goals/SKILL.md`)
- [ ] A weekly recurring task running `report` produces the report; unmeasured days are listed, not estimated. (`src/skills/chef-health-goals/scripts/lib/report.mjs`)

## chef-meal-logging

- [ ] Asked to log a meal, Chef previews the exact entry and writes only after an explicit yes. (`src/skills/chef-meal-logging/SKILL.md`)
- [ ] A restaurant or takeaway meal is not marked cooked, and inventory is unchanged. (`src/skills/chef-meal-logging/SKILL.md`)
- [ ] Logging a cooked recipe with an ingredient missing from inventory reports it and keeps the entry. (`src/skills/chef-meal-logging/SKILL.md`)
- [ ] Asked to edit or delete a logged meal, Chef says there is no such command and does not reverse the inventory deduction. (`src/skills/chef-meal-logging/SKILL.md`)

## chef-shopping-lists

- [ ] With household recipients set, asking for the shopping list returns `delivery.mode: email`, and Muse sends it through the Gmail connector to exactly those addresses; the list also shows in chat. (`src/skills/chef-shopping-lists/scripts/lib/deliver.mjs`, `muse.householdEmail` in `src/runtime/muse.mjs`)
- [ ] With the Gmail connector disconnected, the list is shown in chat with an offer to forward it, and nothing fails silently. (`muse.householdEmail` in `src/runtime/muse.mjs`)
- [ ] A recurring "Chef shopping list" task fires on schedule and emails the list unattended, using the send grant approved for the current recipients. (`DELIVERY_TASKS` in `src/runtime/muse.mjs`)
- [ ] Changing recipients with `chef-setup` re-creates the "Chef shopping list" task, Muse asks to approve the new addresses, Chef lists the re-created task, and nothing is sent to removed addresses. (`muse.deliveryTasks` in `src/runtime/muse.mjs`, `src/skills/chef-setup/scripts/lib/write-settings.mjs`)
