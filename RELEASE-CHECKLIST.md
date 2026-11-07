# Release checklist

Muse-only behaviors have no automated test. After updating Chef on Muse, check each item below
by hand. Each item names what to check and the source path it maps to. Add new items under the
owning skill's section; keep edits append-only.

## chef-shopping-lists

- [ ] With `household_recipients` set, "make my shopping list" returns `delivery.mode: email` and Muse sends it through the Gmail connector to exactly those addresses; the list also shows in chat. Maps to `src/skills/chef-shopping-lists/scripts/lib/deliver.mjs` and `muse.householdEmail` in `src/runtime/muse.mjs`.
- [ ] With the Gmail connector disconnected, the list is shown in chat with an offer to forward it, and nothing fails silently. Maps to `muse.householdEmail` in `src/runtime/muse.mjs`.
- [ ] A recurring "Chef shopping list" task fires on schedule and emails the list unattended, using the send grant approved for the current recipients. Maps to `DELIVERY_TASKS` in `src/runtime/muse.mjs`.
- [ ] Changing recipients with `chef-setup` re-creates the "Chef shopping list" task, Muse asks to approve the new addresses, and Chef lists the re-created task; the old grant no longer sends to removed addresses. Maps to `muse.deliveryTasks` in `src/runtime/muse.mjs` and `src/skills/chef-setup/scripts/lib/write-settings.mjs`.
