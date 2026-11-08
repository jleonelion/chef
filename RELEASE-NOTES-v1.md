# Chef v1.0.0

Chef v1 is a free, MIT-licensed kitchen-assistant skill pack. It keeps recipes, plans and
operational data in a local, git-backed data root.

## Included skills

- `chef-setup` creates, adopts, updates and verifies Chef; manages settings, dietary rules and recurring-task proposals.
- `chef-add-recipe` saves recipes from URLs, text or photos, then adds dietary flags and optional USDA nutrition.
- `chef-recipe-search` is the read-only gateway for finding and showing saved recipes.
- `chef-recipe-decisions` records recipe proposals and decisions, publishes accepted recipes, and retires or restores recipes.
- `chef-meal-planning` saves dietary-gated weekly plans with nutrition rollups and provides a read-only view of today's meals.
- `chef-meal-logging` logs, edits and deletes meals; cooked recipes can deduct inventory idempotently.
- `chef-food-inventory` tracks pantry, fridge and freezer contents, including trusted receipt intake and expiration checks.
- `chef-shopping-lists` builds a meal-plan shopping list after subtracting inventory and prepares household delivery instructions.
- `chef-batch-prep-planning` renders a printable PDF from a saved meal plan, one page per recipe.
- `chef-health-goals` keeps advisory goals dormant until declared, then provides targets, weekly reports and meal-plan suggestions.

## Safety and ownership

Dietary hard constraints fail closed: recipes with conflicts or unverifiable flags stay out of
suggestions. Health output is general information, not medical advice. Chef data remains in the
user-owned data root, which should be backed up with its git history.
