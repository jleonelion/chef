// A recipe draft is the JSON shape add-recipe accepts, from JSON-LD or from the agent's own
// reading of pasted text or a photo. checkDraft normalizes it; recipePage renders a v1 page.
const oneLine = (value) => String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const isText = (value, max) => typeof value === 'string' && oneLine(value).length > 0 && oneLine(value).length <= max;
const wholeIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

const LINES = { max: 100, length: 2000 };
const lineList = (value) => Array.isArray(value) && value.length > 0 && value.length <= LINES.max && value.every((line) => isText(line, LINES.length));

const FIELDS = [
  ['title', (v) => isText(v, 200), 'required, at most 200 characters', true],
  ['description', (v) => isText(v, 1000), 'at most 1000 characters'],
  ['servings', (v) => wholeIn(v, 1, 1000), 'must be a whole number from 1 to 1000'],
  ...['prep_minutes', 'cook_minutes', 'total_minutes'].map((key) => [key, (v) => wholeIn(v, 0, 10080), 'must be a whole number from 0 to 10080']),
  ['cuisine', (v) => isText(v, 40), 'at most 40 characters'],
  ['tags', (v) => Array.isArray(v) && v.length <= 20 && v.every((t) => isText(t, 40)), 'must be a list of at most 20 short tags'],
  ['ingredients', lineList, 'must be a list of 1 to 100 non-empty lines', true],
  ['steps', lineList, 'must be a list of 1 to 100 non-empty lines', true],
];

export function checkDraft(draft) {
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) return { problems: ['draft must be a JSON object'] };
  const given = (key) => draft[key] !== undefined && draft[key] !== null;
  const problems = FIELDS.filter(([key, ok, , required]) => (required || given(key)) && !ok(draft[key])).map(([key, , why]) => `${key}: ${why}`);
  if (problems.length) return { problems };

  const recipe = { title: oneLine(draft.title), ingredients: draft.ingredients.map(oneLine), steps: draft.steps.map(oneLine) };
  for (const key of ['servings', 'prep_minutes', 'cook_minutes', 'total_minutes']) if (given(key)) recipe[key] = draft[key];
  if (!given('total_minutes') && given('prep_minutes') && given('cook_minutes')) recipe.total_minutes = draft.prep_minutes + draft.cook_minutes;
  if (given('description')) recipe.description = oneLine(draft.description);
  if (given('cuisine')) recipe.cuisine = oneLine(draft.cuisine).toLowerCase();
  if (given('tags') && draft.tags.length) recipe.tags = [...new Set(draft.tags.map((t) => oneLine(t).toLowerCase()))];
  return { recipe, problems };
}

const FACT_KEYS = ['servings', 'prep_minutes', 'cook_minutes', 'total_minutes', 'cuisine', 'tags'];

export function recipePage(recipe, { sourceKind, sourceUrl, sourceRaw, date }) {
  const frontmatter = { type: 'recipe', title: recipe.title };
  for (const key of FACT_KEYS) if (recipe[key] !== undefined) frontmatter[key] = recipe[key];
  Object.assign(frontmatter, { source_kind: sourceKind }, sourceUrl ? { source_url: sourceUrl } : {});
  Object.assign(frontmatter, { source_raw: sourceRaw, created: date, updated: date });

  const intro = recipe.description ? `\n${recipe.description}\n` : '';
  const ingredients = recipe.ingredients.map((line) => `- ${line}`).join('\n');
  const steps = recipe.steps.map((line, i) => `${i + 1}. ${line}`).join('\n');
  return { frontmatter, body: `\n# ${recipe.title}\n${intro}\n## Ingredients\n\n${ingredients}\n\n## Steps\n\n${steps}\n` };
}
