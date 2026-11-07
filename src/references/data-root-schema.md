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
| `source_kind` | yes | `url`, `text` or `photo` |
| `source_url` | when `source_kind` is `url` | The `http` or `https` address the recipe came from |
| `source_raw` | yes | Paths, relative to the data root, of the raw files this page was made from |
| `created`, `updated` | yes | `YYYY-MM-DD` |
| `dietary_flags`, `nutrition_per_serving` | no | Added by recipe enrichment. A missing field means "not checked yet", never "none" |

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
