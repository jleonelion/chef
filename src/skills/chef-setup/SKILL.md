---
name: chef-setup
description: Create, adopt, update and verify Chef, onboard the user, and change Chef settings. Use when the user installs Chef or asks to set it up or update it, restores Chef from a backup or moves it to a new machine, wants to change units, household recipients, receipt senders or the calendar, tells Chef about an allergy, celiac disease, a food someone must never eat or a dislike, wants nutrition computed or asks to connect, rotate or remove USDA FoodData Central, wants Chef recurring tasks (morning briefing, weekly report, shopping-list delivery, update notice, receipt check) set up, asks to show or clear Chef's invocation trace ("Chef's log") or turn it off, wants to report a problem with Chef (a bug, something that went wrong) or delete a report they sent, asks to check that Chef works, or when another chef- skill reports a missing data root, a settings warning, a schema mismatch, a USDA connection hint or a `report_offer` after an internal error.
---

# Chef setup

Chef stores all of its state in one folder, the **data root**. Per-user settings live in `settings.json` inside it. This skill is the only writer of that file.

Run every command from this skill's directory. Each prints one JSON object. Exit code 2 means `status` is `refused` or `invalid-input`; exit code 1 means `verify` found a problem.

## Create the data root

```sh
node scripts/setup.mjs init
```

The script picks the location in this order:

1. `--data-root <path>`, if the user named a folder. Pass the same flag to every later command.
2. The `CHEF_DATA_ROOT` environment variable.
3. `~/workspace/chef`, the default on Muse.

Act on `status`:

- `created`: tell the user the data root now exists at `data_root`, then run onboarding.
- `exists`: a data root is already there and nothing was changed. Ask whether they want to review their settings; if so, run onboarding.
- `refused`: the folder holds files that are not a Chef data root. Do not delete or move anything. Tell the user, ask for a different folder, and rerun with `--data-root`.

If the user already has a Chef data root elsewhere (a backup, another machine, or a migration hand-off repo), adopt it instead of running `init`.

## Adopt an existing data root

```sh
node scripts/setup.mjs adopt --source <git URL or folder>
```

`--source` takes an `https://` or `ssh://` git URL, `git@host:path`, a `file:///` URL, or a local folder. The script clones it into the data root, checks its schema version, then removes the clone's git remotes so the data root stays local-only.

- `adopted`: tell the user Chef now uses the data root at `data_root` and that its history came with it. Settings are not part of a data root's history, so run onboarding.
- `refused`: show `reason`. Nothing was changed. If the target folder is not empty, ask for a different folder and rerun with `--data-root`. If `reason` mentions "update Chef", the source was written by a different Chef version; tell the user and stop.
- `invalid-input`: show `problems` and ask for a corrected source.

## Onboarding

First show the safety screen, once, as one short message:

```sh
node scripts/setup.mjs safety
```

Show each line of `screen` as given, keeping the link. Do not reword the second line; it is Chef's allergen guarantee.

Every question is optional. If the user skips one, or all of them, leave that setting at its default; Chef still works. Ask in this order, one at a time:

1. **Units.** Run `node scripts/setup.mjs settings` and read `settings.units` (the default from the user's locale). Ask: "Chef will show shopping lists and pantry amounts in US units (cups, ounces, pounds). Would you rather use metric (grams, milliliters)?" Swap the wording if the default is `metric`. Recipes keep the amounts they were written in unless the user opts in next.
2. **Recipe amounts.** Ask right after units, naming the system they chose (here US): "Recipes show amounts as they were written. Do you also want recipe ingredients shown in US units, with the original amount in brackets?" Only a yes sets `--convert-recipe-units true`.
3. **Household recipients.** Ask: "Who should Chef email shopping lists to by default? Chef emails them automatically only if you approve the Chef shopping list recurring task. You can still ask Chef to email a shopping list to anyone. Give me their email addresses, or skip to see lists here in chat."
4. **Receipt intake.** Ask verbatim: "Should Chef check your Gmail daily for grocery receipts and update your pantry?" Only if they say yes, ask verbatim: "Which stores' receipt emails should it trust?" Chef reads receipts only from those senders.

Then save every answer in one call, passing only the settings the user gave:

```sh
node scripts/setup.mjs set --units metric --convert-recipe-units true --household-recipients "a@example.com,b@example.com" --trusted-receipt-senders "receipts@example.com"
```

Confirm what was saved from the `settings` field of the output. If the user skipped everything, do not run `set`.

5. **Allergies.** Ask: "Does anyone in your household have allergies or foods they must never eat?" This is household data, not a setting.
   - **No:** run `node scripts/setup.mjs set-dietary --none`.
   - **Yes:** record each person as in **Dietary ruleset** below.
   - **Skipped:** run nothing. Plans and lists will keep nudging the user until they answer.

Then offer **Connect USDA nutrition**, then **Connect Chef feedback** (Muse only), then **Recurring tasks**, and finish onboarding with **Verify install**.

## Connect USDA nutrition

Optional. Chef computes recipe nutrition only from USDA FoodData Central; without it, nutrition is marked "not computed" and Chef never estimates it. Ask: "Do you want Chef to compute nutrition for your recipes? It needs a free USDA FoodData Central key, which you enter privately, never in this chat." If they decline, move on.

1. The user gets a free key at https://fdc.nal.usda.gov/api-key-signup (USDA emails it).
2. Store it where scripts never see it:
   - **Muse app:** create a custom connector with your connector tools, with exactly these details: provider `usda-fdc`, API host `api.nal.usda.gov`, auth scheme `api_key`, placement query parameter `api_key`. Start Muse's secure entry card so the user types the key there, and have them allow the host when asked.
   - **Claude Code or Muse Code:** the user sets the environment variable `CHEF_USDA_FDC_KEY` in their own shell or runtime settings. Do not run that command for them or put the key in any file.
3. Check it with one harmless search:

   ```sh
   node scripts/setup.mjs usda
   ```

   - `connected`: tell the user nutrition is on (`food` is the test match). Offer to fill in nutrition for saved recipes with `chef-add-recipe`'s `enrich --unenriched`.
   - `failed` (exit code 0, since USDA access is optional): act on `reason`. `not-connected`: the connector or variable is missing; repeat step 2. `wrong-placement`: the connector's placement differs from step 2; reconnect it with those details. `rejected`: USDA refused the key; reconnect with the key from USDA's email. `rate-limited` or `unreachable`: try again later.

**Rotate** the key by reconnecting the connector (Muse) or changing the variable, then run `usda` again. **Remove** it by disconnecting the connector in Muse's connector settings or unsetting the variable; Chef then marks new nutrition "not computed".

## Connect Chef feedback

Optional, Muse only; skip it on any other runtime, where approved reports are saved on this machine. Ask: "Do you want to be able to send Chef problem reports to the maintainer from here? Nothing is ever sent without your explicit 'send', and you can skip this." If they decline, move on.

1. Create a custom connector with your connector tools, with exactly these details: provider `chef-feedback`, API host `chef-feedback-intake.vercel.app`, auth scheme custom header, header name `X-Chef-Intake-Key`. Start Muse's secure entry card so the user types the install key there, never in this chat, and have them allow the host when asked.
2. Check it:

   ```sh
   node scripts/setup.mjs feedback
   ```

   - `connected`: tell the user they can now send reports; Muse will ask to allow the host on the first send.
   - `failed` (exit code 0, since feedback is optional): act on `reason`. `not-connected`: the connector is missing; repeat step 1. `wrong-placement`: the connector's header differs from step 1; reconnect it with those details. `unsupported`: this runtime cannot send feedback.

**Disconnect** only in Muse's Settings > Connectors; deleting the connector folder under `custom-connectors/` does not remove the stored key, which outlives it. **Uninstall Chef** the same way: the key stays until it is disconnected in Settings > Connectors.

## Recurring tasks

Optional. Chef's scripts never schedule anything; you create each task with the runtime's scheduler, and only the ones the user says yes to. Get the proposal:

```sh
node scripts/setup.mjs schedule
```

It writes nothing. `tasks` lists what Chef recommends for this user, each with `name`, `cadence`, `prompt` and `why`; `not_offered` lists the rest with a `reason` (no health goal, no household recipients, receipt intake off).

1. Show the tasks one at a time: name, cadence and `why`. Ask "Do you want this one?" for each. The update notice is opt-in: offer it, never recommend it by default.
2. A task gets created only after an explicit yes to that task. Silence, "sure, whatever you think" about the list, or a yes to a different task is not a yes. Never create a task the user did not confirm, and never create one from `not_offered`.
3. Create each confirmed task following `runtime.instruction`, with exactly the given `name`, `cadence` and `prompt`. The user can ask for a different time; keep the name and prompt.
4. List the tasks you created. If the runtime has no recurring tasks, tell the user and create nothing.

When the user later asks to add, change or stop a Chef task, run `schedule` again and repeat these steps for that task only. Stop a task through the runtime's scheduler; Chef keeps no record of tasks.

## Update notice check

The "Chef update notice" task runs:

```sh
node scripts/setup.mjs check-update
```

It compares the installed release with the newest release tag and installs nothing. `update-available`: tell the user `latest` is out and that they can say "update Chef". `current`: say nothing. `refused`: say nothing in a recurring run; show `reason` if the user ran it.

## Change settings

When the user asks to change a setting, run `set` with only that flag:

| Setting | Flag | Reset to default |
|---|---|---|
| Units for shopping lists and pantry amounts, and recipes when converted (`us` or `metric`) | `--units metric` | `--units default` (from locale) |
| Show recipe ingredients in those units, original in brackets (`true` or `false`) | `--convert-recipe-units true` | `--convert-recipe-units default` (off) |
| Default recipients for emailed shopping lists | `--household-recipients "a@example.com,b@example.com"` | `--household-recipients ""` (show in chat) |
| Senders Chef accepts receipts from | `--trusted-receipt-senders "receipts@example.com"` | `--trusted-receipt-senders ""` (receipt intake off) |
| Calendar Chef adds meal plans to | `--calendar "Family"` | `--calendar none` (no calendar writes) |
| Invocation trace of script runs (`on` or `off`) | `--trace off` | `--trace default` (on) |
| Offer to report an internal error right after it happens (`on` or `off`) | `--post-error-offers off` | `--post-error-offers default` (on) |

A list flag replaces the whole list, so to add one address, pass the current list plus the new one. Read the current values with `node scripts/setup.mjs settings`.

Act on the `set` output:

- `saved`: confirm the new values. If the result has `delivery_tasks`, follow its `instruction`: re-create each listed recurring Chef task that exists so the runtime asks the user to approve the new recipients, then list the tasks you re-created. If household recipients or receipt senders went from none to some, offer **Recurring tasks** again for the task that is now offered. A `units` change affects shopping lists and pantry amounts from now on, and `inventory_page` reports the inventory page redrawn in the new units; recipes and the inventory store are never converted or rewritten. With `convert_recipe_units` on, shown recipes follow `units` too; the recipe files stay as written.
  With `trace_cleared` in the result, the trace is off and the kept trace is deleted; say so.
- `invalid-input`: show the `problems` and ask the user for a corrected value.
- `refused` with `content`: the settings file is broken or was written by a newer Chef. Show the user `reason` and `content`, and ask whether to replace it. Only if they agree, rerun the same command with `--rewrite`; that discards the old file's values.
- `refused` without `content`: tell the user `reason` and change nothing.

When another chef- skill reports a settings warning, run `node scripts/setup.mjs settings`. If `status` is `invalid` or `unknown-version`, show the user `warning` and `content`, then offer to fix it with `set ... --rewrite`.

## Dietary ruleset

The household's hard constraints (allergies, celiac disease, anything someone must never eat) and avoidances (dislikes) live on one data-root page. The rules Chef follows are in `references/dietary-safety.md`. Show the current ruleset with `node scripts/setup.mjs dietary`.

Record or change one person at a time. A flag replaces that person's whole list, so pass their current list plus the change:

```sh
node scripts/setup.mjs set-dietary --member "Alex Example" --hard "peanuts,tree nuts" --avoid "olives"
```

Use the name the user gives for each person. Pass hard constraints in the user's own words (`peanut allergy`, `celiac`, `tree-nut`, `dairy-free`); Chef maps any allergen wording to its flags, and leans toward more flags when unsure.

- `saved`: show how each entry was read from `read_as`, one per line, for example "peanut allergy -> peanuts", and ask the user to correct anything read wrong. Then confirm `ruleset.members`. Pass on every `caveats` line. If there is a `notice`, show it once, as given, with its link. If `removed_hard_constraints` is present, confirm the user meant to remove them.
- Before removing anyone's hard constraint (`--hard ""` clears the list), ask the user to confirm; removing one lets those recipes back into plans.
- `refused` with `content`: the ruleset page is broken. Until it is fixed Chef leaves every recipe out. Show `reason`, then rerun the change with `--rewrite` only if the user agrees to replace the page.
- `refused` without `content`: show `reason`. `--none` is refused while constraints are declared.
- `invalid-input`: show `problems`.

## Verify install

Run at the end of onboarding, after every Chef update, and whenever the user asks to check that Chef works:

```sh
node scripts/setup.mjs verify
```

It checks Node, that the data root is writable and on this Chef's schema version, and runs every bundled script against a throwaway copy of a sample data root. It never changes the user's data.

- `pass`: tell the user Chef is installed and working.
- `fail`: for each entry in `checks` with `ok: false`, tell the user its `name` and `detail`. A `data-root` failure means run `init` or fix folder permissions. A `schema` failure means Chef needs updating. A `node` failure means the runtime needs Node 20 or later. A `smoke:` failure means the install is damaged; reinstall Chef.

## Update Chef

How updates work, for explaining to the user: the install is a git clone of the Chef repository. Releases are semver tags. `check-update` fetches tags from the clone's `origin` remote and compares the newest with the installed `plugin.json` version; it installs nothing, and with no `origin` remote it refuses. `update` checks out the newest tag and installs its skills, then waits for `--confirm` before running migrations.

Run the preview first, without `--confirm`:

```sh
node scripts/setup.mjs update
```

This commits all pending tracked and untracked files in the data root before changing the install, checks out the newest semver release tag, and makes the installed `chef-` skills match that release exactly. On Muse, the runtime adapter updates the flattened `custom-skills` folders; on Claude Code and Muse Code it updates the plugin path. It never removes anything from the data root, and `settings.json` remains git-ignored.

For `confirmation-required`, show the user `release` and every entry under `changes`: added, replaced and removed skills, pending data-root and settings migrations, and recurring task prompt changes. Ask whether to apply those migrations. Do not imply that the migrations have already run.

Only after the user explicitly agrees, run:

```sh
node scripts/setup.mjs update --confirm
```

- `updated`: report the release and that verify-install passed. If the result has `recurring_tasks`, follow its `instruction`: for each listed task that already exists, ask for explicit approval to re-create it with the new prompt while preserving its name and the user's chosen time. Never create a task the user did not already have. Then list the tasks you re-created.
- `fail`: the update ran but verify-install found problems. Show each failed check from `verify.checks`.
- `refused`: show `reason` and change nothing manually. Never delete user data to repair an update.

Settings key renames and removals are major-release migrations and run only in the confirmed step, with the data-root schema migrations. Additive settings migrations (such as 1 -> 2, which adds `diagnostics.trace: on`) also apply when settings are read, and are saved by the next `set`.

## Invocation trace

Chef keeps an **invocation trace** of its script runs (in plain words, a short local technical log): which script ran, how long it took and how it ended. It never records what the user asked for, recipes, household, health or dietary details, and it never leaves the machine on its own. It holds at most 200 runs, 256 KiB and 14 days; older runs drop off. It lives in the data root's `diagnostics/` folder, which git never commits.

- **Show trace** ("show me Chef's log", "what has Chef been doing"): run `node scripts/setup.mjs trace`. Render `trace.events` as a table, newest last: time (`started_at`), skill (`skill_id`), operation, outcome, error code, duration. Mention `tracing` (on or off) and the bounds. If there are no events, say the trace is empty.
- **Clear trace** ("delete Chef's log"): run `node scripts/setup.mjs clear-trace`. `cleared`: say the trace is deleted from this machine. `empty`: say there was nothing to delete. Nothing is sent anywhere either way.
- **Turn tracing off or on**: `node scripts/setup.mjs set --trace off` (or `on`). Turning it off stops capture and deletes the trace right away.

When any chef- script's result has `trace_notice`, show its `text` once, exactly as given, with your answer. It comes once per machine, on the first run with the trace on.

## Report a problem

When the user wants to report a problem, ask for something new or ask Chef to behave differently, build a **feedback report** with them. Nothing leaves the machine without their explicit "send". Muse can send when its Chef feedback connector is connected; other runtimes save an approved report on this machine.

1. **Classify.** From the user's words, propose one class and ask once: "That sounds like a **defect** (Chef got something wrong). Is that right, or is it an **enhancement** (something new) or a **behavior change** (Chef works, but should work differently)?" Never pick a class without asking. Then ask that class's questions:
   - `defect`: what they expected, what happened instead, how often (`once`, `sometimes`, `always` or `unknown`).
   - `enhancement`: what they want to be able to do.
   - `behavior_change`: what Chef does now, what it should do, and which skill (at least one).
2. **Draft.** Write a one-line summary (at most 500 characters) and the class answers (at most 2,000 each) in general terms: "a dairy item", not "milk"; "a household member", not a name. Never copy recipes, household, health, dietary or conversation content into them. Then say in one line what you generalized ("I wrote 'a dairy item' instead of the food you named") and that they can restore any detail in one reply. A restored detail goes in as they say it; never refuse or re-generalize it. Run:

   ```sh
   node scripts/setup.mjs report-draft --class defect --summary "..." --expected "..." --actual "..." --frequency always --skill-ids chef-recipe-search
   node scripts/setup.mjs report-draft --class enhancement --summary "..." --desired-outcome "..."
   node scripts/setup.mjs report-draft --class behavior_change --summary "..." --current-behavior "..." --desired-behavior "..." --skill-ids chef-meal-planning
   ```

   `--skill-ids` names the skill the report is about (infer it from the conversation when you can). **Diagnostics** attach to defects only, by default: runs of that skill from the last hour. When there are none, Chef attaches the last 10 runs of any skill and the preview says so. `--diagnostics wide` takes every skill's runs from the last hour, `--diagnostics off` leaves them out, and `--diagnostics on` adds them to an enhancement or behavior change. To widen or drop diagnostics after the preview, run `report-draft` again with the same answers and the new `--diagnostics`.

   **Contact.** If the result is `contact-question`, ask once whether the user wants to leave a way for the maintainer to reply or would rather decline. Do not show a preview yet. On an answer, run `report-draft` again with the same report answers and either `--contact "..."` or `--declined`. If contact was already offered, pass it with `--contact` without asking again. Contact is separate from the report and is not pattern-scanned. If the user offers contact on a runtime that cannot take it, the result has `contact_notice`; tell them it was dropped and is not in the report.
3. **Preview.** If `destination_card` is present, show it first, exactly as returned, as plain lines: it says where the report goes, who sees it, how long it is kept, that no identity is attached and its size. Then show `preview` exactly as returned, in a code block, every line. Each numbered line is exactly what the report holds; a `= {}` or `= []` line starts a section whose items follow. Lines starting `Not sent`, `Not observed`, `Check item`, `Diagnostics` and `Contact` are notes, not content. If `send_notice` is present, tell the user in plain words that sending isn't supported in this runtime and "send" saves the report on this machine; on Muse, add that they can connect Chef feedback (see **Connect Chef feedback**) and then send it by drafting the report again. If the user asks for the raw report, run `report-preview --raw` and show `raw` exactly; contact is never in `raw`.
4. **Change.** The user removes or changes items by number:
   - Remove: `node scripts/setup.mjs report-remove --item 19`. Only optional parts can be removed; required fields can only be edited.
   - Edit: `node scripts/setup.mjs report-edit --item 4 --value "..."` (summary, the class fields, frequency and `skill_ids`, comma-separated).
   Every change returns a new `preview` and `submission_nonce`; show the whole new preview again. On `invalid-input`, show `problems`. For a `Check item` note, point out the item, suggest removing or rewording it, and change it only if the user asks.
5. **Send.** Only a reply of "send", "submit" or "send it" to the latest preview counts; for anything vaguer ("ok", "looks good", "sounds good", "yes"), ask again and do not run `report-send`. Then run `node scripts/setup.mjs report-send --nonce <submission_nonce of that preview>`. `sent`: confirm submission with `report_id`; the receipt (with its secret) is saved at `receipt_path` inside the data root and is never shown in chat. `contact-pending`: the report was sent (receipt at `receipt_path`) but the contact choice is not confirmed; explain that plainly and retry with `node scripts/setup.mjs report-contact-retry --report-id <report_id>`. `failed`: nothing was sent; say `message` in plain words (the table below) and let the user decide. Never remove, shorten or edit report content yourself to make it fit; only change it when the user names items.

     | `reason` | Say |
     | --- | --- |
     | `missing-install-key` | Chef couldn't prove this install to feedback intake; reconnect the Chef feedback connector. |
     | `rate-limited` | Intake is getting too many reports; try again later. |
     | `too-large` | The report is too large; ask which diagnostics items to remove by number. |
     | `schema-invalid` | Intake couldn't accept the format; edit or remove items by number, or update Chef. |
     | `nonce-replayed` | Intake already has this report; check saved receipts before resending. |
     | `intake-rejected` | Intake turned the report down; try again later. |
     | `unreachable` | Chef couldn't reach intake; check the connection and try again. |
   - `saved`: say `notice` in plain words and give `path` (inside the data root). Offer no other way to send it: no email, no GitHub issue, no upload.
   - `closed` (reason `intake-closed`): the maintainer has closed Chef feedback for now. Say in plain words that feedback is closed for now, nothing was sent and the approved report is kept on this machine at `path`. If `message` is present, add "The maintainer says: " and `message` as given. Never retry on your own; only when the user later asks to send it again, run the same `report-send --nonce`. Offer no other way to send it.
   - `refused`: the report changed since that preview; show the current one (`report-preview`) and ask again.
6. **Cancel.** `node scripts/setup.mjs report-discard` deletes the draft. Drafts and saved reports are deleted after 14 days; receipts of sent reports are kept 90 days, as long as feedback intake can keep the report.

### Delete a sent report

When the user wants to delete a report they sent, run `node scripts/setup.mjs report-delete`. Never show a receipt secret or report content.

- `choose`: list `receipts` as date (`sent_at`), class and `report_id`, newest first; if there is more than one, ask which. `empty`: there are no sent reports on this machine to delete.
- Then `node scripts/setup.mjs report-delete --report-id <report_id>` returns `confirmation-required` with `warning`: say it in plain words and ask once. Only on a clear yes, repeat it with `--confirm`.
- `deleted`: the report and everything attached to it are gone from feedback intake, and Chef removed the local receipt. `expired-or-deleted`: say `notice` plainly (the report expired or was already deleted); the receipt is removed. `failed`: nothing was deleted; show `reason`, the receipt is kept and the user can retry. `refused`: there is no receipt for that report here.
- `unsupported`: say `reason` in plain words: deleting needs the Chef feedback connector in Muse (see **Connect Chef feedback**).

### After an internal error

When any chef- script's result has `report_offer`, Chef hit an internal error and may offer a report once. Follow its `message`: say in one plain sentence that something went wrong inside Chef and ask whether they want to report it. Never offer for any other failure. An error is one skill's error code: Chef offers at most once an hour for it.

- **Yes**: `node scripts/setup.mjs report-draft --focus <report_offer.focus>`. This skips classification: it drafts a defect about the failing run, with summary, expected and actual pre-drafted from the run. Show the preview and continue from step 3 above; the user can edit anything.
- **No thanks**: `node scripts/setup.mjs report-offer-decline --skill <report_offer.skill_id> --code <report_offer.error_code>`. Chef won't offer for that error again; errors in other skills are still offered.
- Removing `focus_invocation`, the failing run or the whole diagnostics returns `confirmation-required` with `warning`: say it in plain words, and only on a yes repeat the `report-remove` with `--confirm`. The report then becomes user-initiated.
- "Stop offering to report errors" or "offer again": `set --post-error-offers off` or `on`. Turning offers on again forgets every "no thanks". Offers need the failing run in the trace, so with the trace off there are none; turning offers off leaves the trace on.

## Schema mismatch

When any chef- skill refuses with a `reason` that says to "update Chef", the data root and the installed skills are on different schema versions. Chef will not write until they match. Tell the user the reason and do not retry the write or edit `schema-version.json`.

## Rules

- Never edit `settings.json` or `schema-version.json` by hand, never commit `settings.json`, and never add a git remote to the data root unless the user asks.
- Never ask for API keys or passwords in chat. Settings hold only addresses and preferences.
