// The user's own check that a recipe is safe for a hard constraint Chef could not vouch for.
// Written as `verified_by_user: { <constraint>: <date> }`: permanent, first date kept, never
// removed by Chef. Refused when the recipe itself shows a conflict; that needs a one-plan override.
import { constraintConflicts } from '../../../../lib/dietary-gate.mjs';
import { normalizeConstraints } from '../../../../lib/dietary-ruleset.mjs';
import { listRecipes } from '../../../../lib/recipes.mjs';
import { writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';

export function verifyRecipe(root, { slug, constraints, date }) {
  const names = normalizeConstraints(constraints);
  if (!names.length) return { status: 'invalid-input', data_root: root, problems: ['give --constraint <name>'] };
  const recipe = listRecipes(root).recipes.find((r) => r.slug === slug);
  if (!recipe) return { status: 'not-found', data_root: root, slugs: [slug] };
  const refusal = writeRefusal(root);
  if (refusal) return refusal;

  const conflicts = names.flatMap((constraint) => constraintConflicts(recipe, constraint).map((c) => ({ constraint, ...c })));
  if (conflicts.length) {
    return { status: 'refused', data_root: root, slug, conflicts, reason: 'the recipe shows a conflict, so it cannot be verified; a one-plan override is the only way to use it' };
  }
  const previous = recipe.frontmatter.verified_by_user ?? {};
  const added = names.filter((name) => !previous[name]);
  if (!added.length) return { status: 'unchanged', data_root: root, slug, verified_by_user: previous };

  const verified_by_user = { ...previous, ...Object.fromEntries(added.map((name) => [name, date])) };
  const frontmatter = { ...recipe.frontmatter, verified_by_user, updated: date };
  const written = writeWiki(root, { pages: [{ slug, frontmatter, body: recipe.body }], message: `chef-add-recipe: verify ${slug} for ${added.join(', ')}` });
  return written.status === 'written' ? { status: 'verified', data_root: root, slug, verified_by_user } : written;
}
