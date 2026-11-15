# Data root schema, version 1

The data root is one folder under local git. `schema-version.json` at its root holds `{"schema_version": 1}`. Chef scripts refuse to write when the version differs from the one they were built for; the user fixes that with "update Chef".

## Layout

| Path | Holds |
|---|---|
| `schema-version.json` | Schema version stamp |
| `settings.json` | Per-user settings. Git-ignored; only `chef-setup` writes it |
| `cache/` | Optional, only with `CHEF_FDC_CACHE=1`: USDA food-detail replies by FDC id (`cache/fdc/food/<fdcId>.json`). Git-ignored by its own `.gitignore`; safe to delete |
| `knowledge/wiki/<type>/<slug>.md` | Curated pages, Markdown with YAML frontmatter |
| `knowledge/raw/<type>/` | Source material as it arrived. Append-only: files are never changed or replaced |
| `data/<store>/` | Operational JSON stores |

Wiki page types and their folders:

| `type` | Folder |
|---|---|
| `recipe` | `knowledge/wiki/recipes/` |
| `household-profile` | `knowledge/wiki/household/` |
| `inventory-rollup` | `knowledge/wiki/household/` (generated from `data/food-inventory/`; never edited by hand) |
| `dietary-ruleset` | `knowledge/wiki/household/` (one page, `dietary-ruleset.md`; only `chef-setup` writes it) |
| `meal-plan` | `knowledge/wiki/meal-plans/` (one page per planned week) |

A page's slug is its filename without `.md`: lowercase letters, digits and single hyphens.

## Writes

Every write goes through Chef's scripts, never by hand. Each script write is one git commit in the data root.

## Recipe pages

```markdown
---
type: recipe
title: Lemon Garlic Pasta
servings: 2
prep_minutes: 10
cook_minutes: 15
total_minutes: 25
cuisine: italian
tags: [pasta, weeknight]
source_kind: url
source_url: https://example.com/lemon-garlic-pasta
source_raw: [knowledge/raw/recipes/20260115-lemon-garlic-pasta.html]
created: 2026-01-15
updated: 2026-01-15
---

# Lemon Garlic Pasta

One or two lines about the dish.

## Ingredients

- 200 g spaghetti

## Steps

1. Boil the spaghetti.
```

| Field | Required | Value |
|---|---|---|
| `type` | yes | `recipe` |
| `title` | yes | Text |
| `servings` | no | Whole number the recipe makes |
| `yield` | no | Total amount the recipe makes as a volume or weight, such as `2 cups` or `500 g`. Lets other recipes use it by volume or weight (see Nutrition) |
| `prep_minutes`, `cook_minutes`, `total_minutes` | no | Whole minutes |
| `cuisine` | no | Lowercase text, such as `italian` |
| `tags` | no | List of lowercase text |
| `source_kind` | yes | `url`, `text`, `photo`, or `proposal` (Chef proposed it and the user accepted it; see Recipe decisions store) |
| `source_url` | when `source_kind` is `url`; optional for `proposal` | The `http` or `https` address the recipe came from |
| `source_raw` | yes | Paths, relative to the data root, of the raw files this page was made from |
| `created`, `updated` | yes | `YYYY-MM-DD` |
| `dietary_flags` | no | Added by recipe enrichment: sorted `contains-*` flags from `contains-dairy`, `contains-egg`, `contains-fish`, `contains-gluten`, `contains-peanuts`, `contains-sesame`, `contains-shellfish`, `contains-soy`, `contains-tree-nuts`, `contains-wheat`, read from the ingredient wording. A missing field means "not checked yet", never "none"; `[]` means checked and none found in the wording. Enrichment never removes a flag |
| `verified_by_user` | no | The user's own check that the recipe is safe for a hard constraint Chef could not vouch for: `{ <constraint>: YYYY-MM-DD }`. Permanent; the first date is kept and Chef never removes an entry. Never clears a conflict the ingredients show |
| `nutrition_status` | no | `complete`, `incomplete` or `not-computed` (no USDA access). Missing means not attempted yet |
| `nutrition_per_serving` | only when `complete` | `calories` (kcal), `protein`, `fat`, `saturated_fat`, `carbs`, `fiber`, `sugar` (g, 1 decimal), `sodium`, `cholesterol` (mg). Only from USDA FoodData Central, never estimated |
| `nutrition_missing` | when `incomplete` | One line per ingredient (or `servings`, or a sub-recipe cycle) that blocked the calculation, with the reason |
| `nutrition_sources` | no | One line per ingredient: the USDA food and grams used, the sub-recipe and servings used, or `excluded: <reason>` |
| `lifecycle` | no | `active` or `retired`. Missing means `active`. Retired recipes stay on disk but leave recipe search; restoring sets `active` |
| `retired`, `retired_reason` | when `lifecycle` is `retired` | Retirement date (`YYYY-MM-DD`) and, optionally, the user's reason |

The body holds the human-readable recipe. `## Ingredients` is a bulleted list, one ingredient per line; `## Steps` is a numbered list. Chef reads ingredients from the body, so the frontmatter never repeats them.

### Nutrition

Every counted ingredient line resolves to a USDA FoodData Central food and gram weight, or to a sub-recipe. Any line that cannot leaves the recipe `incomplete`. Nothing is estimated.

**Excluded lines.** Lines whose nutritional impact is nominal are left out and do not make a recipe `incomplete`. Each is still listed in `nutrition_sources` as `<line>: excluded: <reason>`:

| Reason | Lines |
|---|---|
| `optional` | The line says `optional`, such as `1/4 cup pine nuts (optional)` |
| `garnish` | A line with no amount that says `for garnish`, `for serving`, `to serve`, `for topping` or `for dusting`. A measured line served alongside (`8 tortillas, for serving`) is counted |
| `seasoning` | Salt and pepper with no amount, such as `salt and pepper` or `kosher salt`. Measured salt is counted |
| `trace amount` | `to taste`, a pinch or a dash |
| `zest, no USDA per-fruit yield` | Zest by the fruit, such as `zest of 1 lemon`. Measured zest (`1 tsp lemon zest`) is counted |

**Citrus juice.** `Juice of 1 lemon`, `Zest and juice of 2 limes` and `1 lime, juiced` count the fruit's juice by USDA's own per-fruit yield: Lemon juice, raw (FDC 167747, 48 g per lemon) and Lime juice, raw (FDC 168156, 44 g per lime). The zest half of such a line is excluded and noted in its source.

**Sub-recipes.** An ingredient line that links another recipe page by slug uses that recipe: `1 serving [[basil-pesto]]`, `1/2 cup [[basil-pesto|pesto]]`. The parent counts the linked recipe's `nutrition_per_serving`, scaled by the servings used, and never copies its ingredients. Give the amount in servings, or as a volume or weight when the linked recipe has a `yield` (half of a `1 cup` yield that serves 4 is 2 servings). The parent is `incomplete` when the linked recipe is missing, its nutrition is not `complete`, or the amount cannot be read against its yield. The parent also takes the linked recipe's `dietary_flags`. Enrichment computes linked recipes before the recipes that use them, and re-enriching a recipe re-enriches every recipe that uses it. Recipes in a link cycle (A uses B uses A), or nested more than 3 levels deep, are `incomplete` with that reason.

## Inventory store

`data/food-inventory/` belongs to chef-food-inventory; only its script writes there.

| Path | Holds |
|---|---|
| `current.json` | Items on hand: `{ lastUpdated, pantry, fridge, freezer }`, each location `{ <category>: { <item_key>: item } }`. An item has `amount` (number, at least 0), `unit`, and optionally `name`, `purchased` and `expires` (`YYYY-MM-DD`), `updated` |
| `audit.jsonl` | Append-only, one line per change: `ts`, `actor`, `action`, `before_hash`, `after_hash` (SHA-256 of `current.json`), `details` |
| `receipt-ledger.json` | Processed receipts by id, so a receipt is never added twice |
| `purchases/<date>-<receipt id>.json` | The items each receipt added |

Receipt transcripts are kept as `knowledge/raw/receipts/<date>-<receipt id>.txt`. The `inventory-rollup` page is regenerated from `current.json` on every change and when the `units` setting changes; its amounts follow `units` (display only, rounded up), while `current.json` keeps the stored units. Sender email addresses are never stored.

## Recipe decisions store

`data/recipe-decisions/` belongs to chef-recipe-decisions; only its script writes there.

| Path | Holds |
|---|---|
| `proposals.json` | `{ proposals: { <id>: proposal } }`. The `id` is the recipe slug when first proposed |
| `standing-rules.json` | `{ auto_reject: [rule], auto_approve: [rule] }` |

A proposal has `id`, `slug`, `title`, `proposed` (`YYYY-MM-DD`), `draft` (the recipe as proposed, in the `chef-add-recipe` draft shape), optionally `source_url`, `note` and `gate_reasons`, `decisions` and, once published, `published`. `gate_reasons` records why the dietary hard-constraint gate prevented a standing rule from auto-accepting the proposal. `decisions` is the history, oldest first: each has `outcome` (`accept`, `reject`, `defer` or `revise`), `date`, `by` (`user` or `rule:<rule id>`) and optionally `reason`. A confirmed publication that the dietary gate blocked adds an `accept` decision by the user describing that one-shot, recipe-specific confirmation; it does not create a standing exception. The latest decision sets the proposal's state: `accept` → accepted, `reject` → rejected, otherwise open. A proposal with the same slug or source address as an earlier one is never recorded twice, so a rejected recipe is not proposed again. `published` is `{ date, path }` plus `linked: true` when a page with that slug already existed and was left unchanged. A published recipe's raw source is the accepted draft, saved as `knowledge/raw/recipes/<date>-<slug>.json`.

A rule has `id`, `reason`, `created` and at least one of `title_includes` and `text_includes` (lists of phrases, all of which must match at the start of a word, any case). Reject rules are checked first. Before gating, Chef derives the draft's dietary flags with the recipe enrichment flagger. An approve rule cannot accept a draft that the gate does not allow; the proposal remains open with `gate_reasons`. Publishing any accepted proposal runs the same check and fails closed, including when the ruleset is unreadable, unless the user explicitly confirms every blocked proposal by id on that call. A bulk confirmation with no ids is atomic: if any proposal is blocked, nothing publishes.

## Household-profile page

`knowledge/wiki/household/profile.md` holds structured planning facts plus optional descriptive prose.

```markdown
---
type: household-profile
title: Household profile
portions_per_meal: 3
updated: 2026-01-15
---
# Household profile
```

| Field | Required | Value |
|---|---|---|
| `type` | yes | `household-profile` |
| `title` | yes | Text |
| `portions_per_meal` | no | Whole number greater than zero. Meal planning uses this as household servings; missing or invalid means the default of 1 |
| `updated` | yes | `YYYY-MM-DD` |

The body may describe household members and preferences, but scripts never parse servings from prose.

## Dietary ruleset page

`knowledge/wiki/household/dietary-ruleset.md`. No page means the user was never asked; a page with no rules means none declared.

```markdown
---
type: dietary-ruleset
title: Dietary ruleset
members:
  - name: Alex Example
    hard_constraints: [gluten, mustard]
    avoidances: [olives]
updated: 2026-01-15
---
# Dietary ruleset
```

| Field | Required | Value |
|---|---|---|
| `members` | no | One entry per person with at least one rule. `name` (text, required), `hard_constraints` (must never appear: flag-set names `dairy`, `egg`, `fish`, `gluten`, `peanuts`, `sesame`, `shellfish`, `soy`, `tree-nuts`, `wheat`, or any other lowercase food, matched on ingredient wording only), `avoidances` (lowercase dislikes) |
| `updated` | yes | `YYYY-MM-DD` |

A page Chef cannot read leaves every recipe out of suggestions until `chef-setup` fixes it.

## Meal-plan pages

`knowledge/wiki/meal-plans/<week-start>.md`, written only by `chef-meal-planning`.

| Field | Required | Value |
|---|---|---|
| `type` | yes | `meal-plan` |
| `title` | yes | Text |
| `week_start`, `created` | yes | `YYYY-MM-DD` |
| `household_profile` | yes | The profile path used, or `null` when none exists |
| `servings_source` | yes | `profile` when `portions_per_meal` supplied the servings, otherwise `default` |
| `meals` | yes | The planned meals, in date and meal-slot order: `date`, `slot` (`breakfast`, `lunch`, `dinner` or `snack`), recipe `slug`, `title`, `servings` and an optional `note`. At most one per date and slot, all inside the week. A slot with no entry is not planned. An entry with no `slot`, as in every v1 one-per-day plan, reads as `dinner` |
| `nutrition` | yes | The shared nutrition engine's rollup. `complete` has per-planned-meal (date, slot, recipe) and weekly `totals`; `incomplete` lists planned meals whose recipe nutrition is unavailable and never estimates totals |
| `dietary` | yes | Ruleset status plus the applicable `nudge`, `footer`, `caveats` or unreadable-ruleset `problem` |
| `inventory` | yes | `items_considered`: how many inventory items were on hand when the plan was saved |
| `avoidance_notes` | when a planned meal matches an avoidance | Meal date, slot and recipe slug plus the affected member, avoidance and matching ingredient text |

Calendar payloads are runtime instructions returned by the script only when `settings.calendar`
is set. They are never stored on a meal-plan page, and Chef scripts never call a calendar API.
One-plan dietary overrides are also returned only for that invocation and are never stored.

## Notices

`data/notices.json` records one-time notices by key with the date shown, such as `{"training-setting": "2026-01-15"}`.

## Health goals store

`data/health-goals/goals.json` belongs to chef-health-goals; only its script writes it. No file, or `goal: null`, means health features are dormant: no reports, suggestions or health footers anywhere.

```json
{ "goal": "Lower sodium", "targets": { "sodium": { "max": 2300 }, "protein": { "min": 90 } }, "set": "2026-01-15", "updated": "2026-01-20" }
```

| Field | Value |
|---|---|
| `goal` | The user's own short description, or `null` after the goal is dropped |
| `targets` | Daily, per-person targets keyed by nutrition field (`calories`, `protein`, `fat`, `saturated_fat`, `carbs`, `fiber`, `sugar`, `sodium`, `cholesterol`, in the units of `nutrition_per_serving`), each `{ min?, max? }`. Advisory only; never clinician-prescribed limits |
| `set` | `YYYY-MM-DD` the current goal was first declared; absent after the goal is dropped |
| `updated` | `YYYY-MM-DD` of the last change |

The weekly report reads the meal log (`data/meal-log/log.json`, owned by chef-meal-logging) and writes nothing. A day counts toward targets only when every entry that day has `nutrition`. Meal-plan suggestions are returned with the saved plan and never stored on the meal-plan page. Declaring the first goal records the shared `training-setting` notice, if not already shown.

## Meal log store

`data/meal-log/log.json` belongs to `chef-meal-logging`; it is the only writer. The file is `{ "entries": [ ... ] }`.

Each entry has `id` (stable `<date>-<slot>-<recipe-or-food-slug>`), `date` (`YYYY-MM-DD`), `slot` (`breakfast`, `lunch`, `dinner` or `snack`), `recipe` (recipe slug or `null`), `food` (free text when there is no recipe, otherwise `null`), `servings` (positive number), `cooked` (whether the user cooked it at home), `nutrition` (per-entry totals copied from complete recipe `nutrition_per_serving` and scaled by servings, otherwise `null`) and `logged_at` (ISO timestamp).

A cooked recipe entry uses its `id` as the food-inventory deduction ID. Inventory deduction is idempotent and occurs after the entry is saved. Missing inventory ingredients and unit mismatches do not remove the logged entry. Editing or deleting a log entry never reverses a deduction automatically.

## Shopping lists

`data/shopping-lists/<week-start>.md` belongs to chef-shopping-lists; only its script writes there. It is written only off Muse when `household_recipients` is set, as the household delivery copy, and is rewritten each time the list for that week is built. It holds the list as Markdown, the same text shown in chat. On Muse the list is emailed through the runtime's Gmail connector instead, and with no recipients it is only shown in chat; neither writes to the data root.

A list is built from the saved `meal-plan` page minus `data/food-inventory/current.json`. Amounts combine only within one measurable dimension (mass or volume) or the same count unit; Chef never guesses a conversion, so the same food in units it cannot convert stays on separate rows. Mass and volume merge exactly; only the shown amount follows the `units` setting (fixed unit ladder, rounded up), and subtraction uses exact amounts.

## Batch prep PDFs

`data/batch-prep-plans/<week-start>.pdf` belongs to chef-batch-prep-planning; only its script writes there, through the guarded writer, one commit per render. It is a derived artifact of `knowledge/wiki/meal-plans/<week-start>.md`: one page per unique planned recipe in first-appearance order, with that recipe's planned dates and meal slots, servings and `## Steps`. Re-rendering overwrites it; never edit it by hand.
