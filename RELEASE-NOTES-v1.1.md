# Chef v1.1.0

Minor release. No schema change and no skill renames, so no data-root migration runs. "Update Chef" installs it in place.

## Changes

- **Nutrition: more ingredient lines resolve.** The reviewed USDA synonym map now covers more pasta shapes, pantry staples and count units.
- **Nutrition: optional USDA reply cache.** With `CHEF_FDC_CACHE=1`, food-detail replies are cached under the data root in `cache/fdc/food/`. The cache is git-ignored and safe to delete.
- **Ingredient lines: more amount forms are read.** "One 15-ounce can …", "About 12 …", "Scant 1 teaspoon …" and "Up to ½ cup …" now get their amounts. A bare "Pinch of …" is a trace amount. "1 tablespoon plus 1 teaspoon …" adds the two amounts instead of leaving "plus 1 teaspoon" in the item name, which used to show up on shopping lists.

## Safety and ownership

Unchanged from v1.0.0. The dietary gate doesn't read the ingredient parser.
