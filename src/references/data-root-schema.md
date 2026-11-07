# Data root schema, version 1

The data root is one folder under local git. `schema-version.json` at its root holds `{"schema_version": 1}`. Chef scripts refuse to write when the version differs from the one they were built for; the user fixes that with "update Chef".

## Layout

| Path | Holds |
|---|---|
| `schema-version.json` | Schema version stamp |
| `settings.json` | Per-user settings. Git-ignored; only `chef-setup` writes it |
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
| `nutrition_missing` | when `incomplete` | One line per ingredient (or `servings`) that blocked the calculation, with the reason |
| `nutrition_sources` | no | One line per ingredient: the USDA food and grams used |
| `lifecycle` | no | `active` or `retired`. Missing means `active`. Retired recipes stay on disk but leave recipe search; restoring sets `active` |
| `retired`, `retired_reason` | when `lifecycle` is `retired` | Retirement date (`YYYY-MM-DD`) and, optionally, the user's reason |

The body holds the human-readable recipe. `## Ingredients` is a bulleted list, one ingredient per line; `## Steps` is a numbered list. Chef reads ingredients from the body, so the frontmatter never repeats them.

## Inventory store

`data/food-inventory/` belongs to chef-food-inventory; only its script writes there.

| Path | Holds |
|---|---|
| `current.json` | Items on hand: `{ lastUpdated, pantry, fridge, freezer }`, each location `{ <category>: { <item_key>: item } }`. An item has `amount` (number, at least 0), `unit`, and optionally `name`, `purchased` and `expires` (`YYYY-MM-DD`), `updated` |
| `audit.jsonl` | Append-only, one line per change: `ts`, `actor`, `action`, `before_hash`, `after_hash` (SHA-256 of `current.json`), `details` |
| `receipt-ledger.json` | Processed receipts by id, so a receipt is never added twice |
| `purchases/<date>-<receipt id>.json` | The items each receipt added |

Receipt transcripts are kept as `knowledge/raw/receipts/<date>-<receipt id>.txt`. The `inventory-rollup` page is regenerated from `current.json` on every change. Sender email addresses are never stored.

## Recipe decisions store

`data/recipe-decisions/` belongs to chef-recipe-decisions; only its script writes there.

| Path | Holds |
|---|---|
| `proposals.json` | `{ proposals: { <id>: proposal } }`. The `id` is the recipe slug when first proposed |
| `standing-rules.json` | `{ auto_reject: [rule], auto_approve: [rule] }` |

A proposal has `id`, `slug`, `title`, `proposed` (`YYYY-MM-DD`), `draft` (the recipe as proposed, in the `chef-add-recipe` draft shape), optionally `source_url`, `note` and `gate_reasons`, `decisions` and, once published, `published`. `gate_reasons` records why the dietary hard-constraint gate prevented a standing rule from auto-accepting the proposal. `decisions` is the history, oldest first: each has `outcome` (`accept`, `reject`, `defer` or `revise`), `date`, `by` (`user` or `rule:<rule id>`) and optionally `reason`. A confirmed publication that the dietary gate blocked adds an `accept` decision by the user describing that one-shot confirmation; it does not create a standing exception. The latest decision sets the proposal's state: `accept` → accepted, `reject` → rejected, otherwise open. A proposal with the same slug or source address as an earlier one is never recorded twice, so a rejected recipe is not proposed again. `published` is `{ date, path }` plus `linked: true` when a page with that slug already existed and was left unchanged. A published recipe's raw source is the accepted draft, saved as `knowledge/raw/recipes/<date>-<slug>.json`.

A rule has `id`, `reason`, `created` and at least one of `title_includes` and `text_includes` (lists of phrases, all of which must match at the start of a word, any case). Reject rules are checked first. An approve rule cannot accept a draft that the dietary hard-constraint gate does not allow; the proposal remains open with `gate_reasons`. Publishing any accepted proposal runs the gate again and fails closed, including when the ruleset is unreadable, unless the user explicitly confirms that publication call.

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

## Notices

`data/notices.json` records one-time notices by key with the date shown, such as `{"training-setting": "2026-01-15"}`.
