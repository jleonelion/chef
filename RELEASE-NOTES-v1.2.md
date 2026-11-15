# Chef v1.2.0

Minor release. No data-root schema change and no skill renames. Settings move from version 1 to 2, an additive step that adds `diagnostics.trace`. Chef applies it when it reads settings and saves it with the next settings change, so nothing needs migrating by hand. "Update Chef" installs it in place.

## Changes

- **Meal plans: plan by meal.** A plan now holds breakfast, lunch, dinner and a snack on the same day, each with its own servings and an optional note. Only the meals you list are saved; Chef no longer fills empty days. Plans saved before v1.2 read as dinners, so they keep working. "Today", shopping lists and batch prep show the meal slot.
- **Meal logging: log from the plan.** "Log tonight's dinner" or "log today's meals" pre-fills each entry from the saved plan: date, meal, recipe and servings. Chef still asks whether each meal was cooked at home and writes only after a yes. A whole day is one confirmation. With no plan for that meal, Chef asks as before.
- **Units: shown in your unit system.** Shopping lists, inventory and the inventory page show quantities in the household's `us` or `metric` setting, as decimals (`1.5 cups`, `2.25 lb`). Onboarding asks about units again. Changing units redraws the inventory page. An inventory page from an older release is redrawn on the next health check or inventory change.
- **Recipes: optional amounts in your unit system.** A new setting, off by default, shows recipe ingredients in the household's units with the original amount in brackets (`235 ml (1 cup) milk`), and oven temperatures in both scales. Onboarding asks about it right after units; `chef-setup set --convert-recipe-units true` turns it on later. Recipe files are never rewritten.
- **Invocation trace.** Chef keeps a short local log of its script runs: which script ran, how long it took and how it ended. It never records what you asked, recipes, household, health or dietary details, and it never leaves your machine on its own. It holds at most 200 runs, 256 KiB and 14 days, in the data root's `diagnostics/` folder, which git never commits. It is on by default and covers recipe search for now. Ask Chef to show or clear its log, or turn it off with `chef-setup set --trace off`, which also deletes it.
- **Shopping lists: amounts combine exactly.** The same ingredient in different units of mass or volume adds up correctly, whichever recipe comes first. Stock that exactly covers a need counts as covered.
- **Nutrition: fewer incomplete recipes.** Optional lines, unmeasured garnish, unmeasured salt and pepper and trace amounts no longer block a complete nutrition result; each is listed as excluded. "Juice of 1 lemon" and "1 lime, juiced" read USDA's per-fruit juice amount. A `[[sub-recipe]]` line adds that recipe's nutrition and dietary flags, scaled by servings or by its optional `yield`.
- **Updates: recurring task prompts carry over.** When a release changes the prompt of a recurring task you already have, "Update Chef" offers to re-create it with the same name and time. Tasks you didn't create stay off.
- **Updates: clearer refusals.** `check-update` and `update` refuse when the Chef clone has no `origin` remote, instead of always reporting "current". The README and chef-setup explain how updates work.

## Safety and ownership

The dietary gate now checks each planned meal, and a refused choice names its date and meal slot. Gate rules and overrides are unchanged. A recipe linked as a sub-recipe passes its dietary flags to the recipe that links it.
