// Recipe Retirement: a recipe leaves or re-enters the active recipe book through its
// `lifecycle` frontmatter field. The page, its provenance and its decisions stay put.
import { listRecipes } from '../../../../lib/recipes.mjs';
import { writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';

const RETIRED_KEYS = ['lifecycle', 'retired', 'retired_reason'];
const withoutRetired = (fm) => Object.fromEntries(Object.entries(fm).filter(([key]) => !RETIRED_KEYS.includes(key)));

function change(root, slug, { to, reason, date }) {
  const refusal = writeRefusal(root);
  if (refusal) return refusal;
  const recipe = listRecipes(root).recipes.find((r) => r.slug === slug);
  if (!recipe) return { status: 'not-found', data_root: root, slug: slug ?? null };
  const current = recipe.frontmatter.lifecycle === 'retired' ? 'retired' : 'active';
  if (current === to) return { status: 'unchanged', data_root: root, slug, lifecycle: current };

  const base = withoutRetired(recipe.frontmatter);
  const retired = to === 'retired' ? { lifecycle: 'retired', retired: date, ...(reason?.trim() && { retired_reason: reason.trim() }) } : { lifecycle: 'active' };
  const frontmatter = { ...base, ...retired, updated: date };
  const verb = to === 'retired' ? 'retire' : 'restore';
  const written = writeWiki(root, { pages: [{ slug, frontmatter, body: recipe.body }], message: `chef-recipe-decisions: ${verb} ${slug}` });
  return written.status === 'written' ? { status: to === 'retired' ? 'retired' : 'restored', data_root: root, slug, path: recipe.path, lifecycle: to } : written;
}

export const retireRecipe = (root, { slug, reason, date }) => change(root, slug, { to: 'retired', reason, date });
export const restoreRecipe = (root, { slug, date }) => change(root, slug, { to: 'active', date });
