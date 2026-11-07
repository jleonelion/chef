---
name: chef-setup
description: Create or adopt the Chef data root, onboard the user, change Chef settings, and verify the install. Use when the user installs Chef or asks to set it up, restores Chef from a backup or moves it to a new machine, wants to change units, household recipients, receipt senders or the calendar, tells Chef about an allergy, celiac disease, a food someone must never eat or a dislike, wants nutrition computed or asks to connect, rotate or remove USDA FoodData Central, asks to check that Chef works, or when another chef- skill reports a missing data root, a settings warning, a schema mismatch or a USDA connection hint.
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

1. **Units.** Run `node scripts/setup.mjs settings` and read `settings.units` (the default from the user's locale). Ask: "Chef will use US units (cups, ounces, °F). Would you rather use metric?" Swap the wording if the default is `metric`.
2. **Household recipients.** Ask: "Do you want Chef to send shopping lists and prep plans to anyone? Give me their email addresses, or skip and Chef will show lists here in chat."
3. **Receipt forwarding.** Ask: "Do you want to forward grocery receipts to Chef by email so it can update your pantry?" Only if they say yes, ask which addresses the receipts come from. Chef reads receipts only from those senders.

Then save every answer in one call, passing only the settings the user gave:

```sh
node scripts/setup.mjs set --units metric --household-recipients "a@example.com,b@example.com" --trusted-receipt-senders "receipts@example.com"
```

Confirm what was saved from the `settings` field of the output. If the user skipped everything, do not run `set`.

4. **Allergies.** Ask: "Does anyone in your household have allergies or foods they must never eat?" This is household data, not a setting.
   - **No:** run `node scripts/setup.mjs set-dietary --none`.
   - **Yes:** record each person as in **Dietary ruleset** below.
   - **Skipped:** run nothing. Plans and lists will keep nudging the user until they answer.

Then offer **Connect USDA nutrition**, and finish onboarding with **Verify install**.

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

## Change settings

When the user asks to change a setting, run `set` with only that flag:

| Setting | Flag | Reset to default |
|---|---|---|
| Units (`us` or `metric`) | `--units metric` | `--units default` (from locale) |
| Who receives lists and prep plans | `--household-recipients "a@example.com,b@example.com"` | `--household-recipients ""` (show in chat) |
| Senders Chef accepts receipts from | `--trusted-receipt-senders "receipts@example.com"` | `--trusted-receipt-senders ""` (forwarding off) |
| Calendar Chef adds meal plans to | `--calendar "Family"` | `--calendar none` (no calendar writes) |

A list flag replaces the whole list, so to add one address, pass the current list plus the new one. Read the current values with `node scripts/setup.mjs settings`.

Act on the `set` output:

- `saved`: confirm the new values. If `side_effects` contains `recreate-delivery-tasks`, re-create every recurring Chef task that sends email so the runtime asks the user to approve the new recipients, then list the tasks you re-created. A `units` change affects new output only; stored recipes are never rewritten.
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

## Schema mismatch

When any chef- skill refuses with a `reason` that says to "update Chef", the data root and the installed skills are on different schema versions. Chef will not write until they match. Tell the user the reason and do not retry the write or edit `schema-version.json`.

## Rules

- Never edit `settings.json` or `schema-version.json` by hand, never commit `settings.json`, and never add a git remote to the data root unless the user asks.
- Never ask for API keys or passwords in chat. Settings hold only addresses and preferences.
