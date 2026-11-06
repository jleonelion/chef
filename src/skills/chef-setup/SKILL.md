---
name: chef-setup
description: Create the Chef data root, onboard the user, and change Chef settings. Use when the user installs Chef or asks to set it up, wants to change units, household recipients, receipt senders or the calendar, or when another chef- skill reports a missing data root or a settings warning.
---

# Chef setup

Chef stores all of its state in one folder, the **data root**. Per-user settings live in `settings.json` inside it. This skill is the only writer of that file.

Run every command from this skill's directory. Each prints one JSON object. Exit code 2 means `status` is `refused` or `invalid-input`.

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

## Onboarding

Every question is optional. If the user skips one, or all of them, leave that setting at its default; Chef still works. Ask in this order, one at a time:

1. **Units.** Run `node scripts/setup.mjs settings` and read `settings.units` (the default from the user's locale). Ask: "Chef will use US units (cups, ounces, °F). Would you rather use metric?" Swap the wording if the default is `metric`.
2. **Household recipients.** Ask: "Do you want Chef to send shopping lists and prep plans to anyone? Give me their email addresses, or skip and Chef will show lists here in chat."
3. **Receipt forwarding.** Ask: "Do you want to forward grocery receipts to Chef by email so it can update your pantry?" Only if they say yes, ask which addresses the receipts come from. Chef reads receipts only from those senders.

Then save every answer in one call, passing only the settings the user gave:

```sh
node scripts/setup.mjs set --units metric --household-recipients "a@example.com,b@example.com" --trusted-receipt-senders "receipts@example.com"
```

Confirm what was saved from the `settings` field of the output. If the user skipped everything, do not run `set`.

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

## Rules

- Never edit `settings.json` by hand, never commit it, and never add a git remote to the data root unless the user asks.
- Never ask for API keys or passwords in chat. Settings hold only addresses and preferences.
