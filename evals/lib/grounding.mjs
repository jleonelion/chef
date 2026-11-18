// Grounding: which fixture facts (recipes, meal plans, inventory items) an eval item references, and whether
// each exists in the fixture data root or in the item's own seed. See evals/README.md "Grounding".
import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../../src/lib/wiki.mjs';

const STORAGES = ['fridge', 'freezer', 'pantry'];
const REF_KEYS = new Set(['recipe', 'slug']);
const SEED_RECIPE = /^knowledge\/wiki\/recipes\/([^/]+)\.md$/;
const FLAGS = new Set(['--recipe', '--slug']);
const CLI_FLAG = /--(?:recipe|slug)(?:=|\s+)([a-z0-9][a-z0-9-]*)/g;

const names = (dir, ext) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)) : []);

export function buildCatalog(dataRoot) {
  const wiki = path.join(dataRoot, 'knowledge', 'wiki');
  const current = path.join(dataRoot, 'data', 'food-inventory', 'current.json');
  const inventory = fs.existsSync(current) ? JSON.parse(fs.readFileSync(current, 'utf8')) : {};
  return {
    recipes: new Set(names(path.join(wiki, 'recipes'), '.md')),
    mealPlans: new Set(names(path.join(wiki, 'meal-plans'), '.md')),
    inventory: new Set(STORAGES.flatMap((s) => Object.values(inventory[s] ?? {}).flatMap((category) => Object.keys(category)))),
  };
}

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// Recipe slugs named by `recipe`/`slug` values anywhere in `value`, including JSON held in strings
// (seed content, stdin) and `--recipe <slug>` flags in command arguments.
function referencedRecipes(value, found = new Set()) {
  if (typeof value === 'string') {
    const parsed = parseJson(value);
    if (parsed !== undefined && typeof parsed === 'object') referencedRecipes(parsed, found);
    for (const m of value.matchAll(CLI_FLAG)) found.add(m[1]);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (typeof item === 'string' && FLAGS.has(value[i - 1])) found.add(item);
      referencedRecipes(item, found);
    });
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (REF_KEYS.has(key) && typeof item === 'string') found.add(item);
      else referencedRecipes(item, found);
    }
  }
  return found;
}

// Recipes a row creates: seeded wiki pages, seeded proposals (published to their own slug) and seeded drafts (saved under their title's slug).
function seededRecipes(row) {
  return [...(row.seed ?? []), ...(row.afterCommitSeed ?? [])].flatMap((file) => {
    const page = SEED_RECIPE.exec(file.path)?.[1];
    const content = typeof file.content === 'string' ? parseJson(file.content) : undefined;
    const draft = content?.title && content.ingredients ? [slugify(content.title)] : [];
    return page ? [page] : [...Object.keys(content?.proposals ?? {}), ...draft];
  });
}

// Everything a row feeds in: its seed, setup, turns, stdin and commands (not its assertions).
const inputs = (row) => [row.seed, row.afterCommitSeed, row.setup, row.turns, row.stdin, row.command, row.steps];

// Fixture recipes a row's inputs name and its own seed does not create.
export function fixtureRecipes(row, catalog) {
  if (row.fixture === 'none') return [];
  const seeded = new Set(seededRecipes(row));
  return [...referencedRecipes(inputs(row))].filter((slug) => catalog.recipes.has(slug) && !seeded.has(slug)).sort();
}

export function groundingErrors(row, catalog) {
  const errors = [];
  for (const [kind, items] of Object.entries(row.grounding ?? {})) {
    for (const item of items) if (!catalog[kind]?.has(item)) errors.push(`grounding.${kind} ${item} is not in the fixture data root`);
  }
  const declared = new Set(row.grounding?.recipes);
  for (const slug of fixtureRecipes(row, catalog)) {
    if (!declared.has(slug)) errors.push(`recipe ${slug} comes from the fixture but is not declared in grounding.recipes`);
  }
  const available = new Set([...(row.fixture === 'none' ? [] : catalog.recipes), ...seededRecipes(row)]);
  for (const slug of referencedRecipes(inputs(row))) {
    if (!available.has(slug)) errors.push(`recipe ${slug} is neither in the fixture data root nor created by the row's seed`);
  }
  return errors;
}
