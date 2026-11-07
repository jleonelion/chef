// schema.org Recipe JSON-LD in a web page -> a recipe draft (see draft.mjs). Page content is
// untrusted: everything is parsed as data, tags are stripped, nothing is evaluated.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', deg: '°', frac12: '½', frac14: '¼', frac34: '¾' };

function decode(text) {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z0-9]+));/gi, (match, dec, hex, name) => {
    const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : null;
    if (code !== null) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

const clean = (value) => (typeof value === 'string' ? decode(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');
const first = (value) => (Array.isArray(value) ? value[0] : value);

export function minutesFromIso(value) {
  const match = typeof value === 'string' && value.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (!match || value.trim().toUpperCase() === 'P') return undefined;
  const [, days = 0, hours = 0, minutes = 0] = match;
  return Number(days) * 1440 + Number(hours) * 60 + Number(minutes);
}

function collect(node, out) {
  if (Array.isArray(node)) return node.forEach((item) => collect(item, out));
  if (!node || typeof node !== 'object') return;
  if ([node['@type']].flat().includes('Recipe')) out.push(node);
  collect(node['@graph'], out);
  collect(node.mainEntity, out);
}

function recipesIn(html) {
  const out = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collect(JSON.parse(match[1]), out);
    } catch {
      // malformed block: skip it
    }
  }
  return out;
}

function steps(node) {
  if (typeof node === 'string') return decode(node).split(/\n+/).map(clean).filter(Boolean);
  if (Array.isArray(node)) return node.flatMap(steps);
  if (!node || typeof node !== 'object') return [];
  if (node.itemListElement) return steps(node.itemListElement);
  return [clean(node.text ?? node.name)].filter(Boolean);
}

const servings = (value) => {
  const n = Number.parseInt(String(first(value) ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

const tags = (value) => (Array.isArray(value) ? value : String(value ?? '').split(',')).map(clean).filter(Boolean);

export function draftFromHtml(html) {
  const recipe = recipesIn(html)[0];
  if (!recipe) return null;
  const draft = {
    title: clean(first(recipe.name)),
    description: clean(first(recipe.description)) || undefined,
    servings: servings(recipe.recipeYield),
    prep_minutes: minutesFromIso(recipe.prepTime),
    cook_minutes: minutesFromIso(recipe.cookTime),
    total_minutes: minutesFromIso(recipe.totalTime),
    cuisine: clean(first(recipe.recipeCuisine)) || undefined,
    tags: tags(recipe.keywords),
    ingredients: [recipe.recipeIngredient ?? recipe.ingredients ?? []].flat().map(clean).filter(Boolean),
    steps: steps(recipe.recipeInstructions),
  };
  if (!draft.tags.length) delete draft.tags;
  return Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== undefined));
}

export function htmlToText(html) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|head|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|ul|ol)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<[^>]+>/g, '');
  return decode(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
