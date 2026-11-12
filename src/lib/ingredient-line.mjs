// Reads one recipe ingredient line ("1 1/2 cups red lentils, rinsed") into amount, unit and
// the food it names. Units are canonical: weights g/kg/oz/lb, volumes tsp/tbsp/cup/ml/l/floz/
// pt/qt, counts such as clove or can, and trace amounts (pinch, dash, "to taste").
const FRACTIONS = { '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3', '⅛': ' 1/8' };
const UNITS = {
  g: ['g', 'gram', 'grams', 'gr'], kg: ['kg', 'kilogram', 'kilograms'], oz: ['oz', 'ounce', 'ounces'], lb: ['lb', 'lbs', 'pound', 'pounds'],
  tsp: ['tsp', 'teaspoon', 'teaspoons'], tbsp: ['tbsp', 'tbs', 'tablespoon', 'tablespoons'], cup: ['cup', 'cups', 'c'],
  ml: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'], l: ['l', 'liter', 'liters', 'litre', 'litres'],
  floz: ['fl oz', 'fluid ounce', 'fluid ounces'], pt: ['pint', 'pints', 'pt'], qt: ['quart', 'quarts', 'qt'],
  clove: ['clove', 'cloves'], slice: ['slice', 'slices'], can: ['can', 'cans'], stick: ['stick', 'sticks'], bunch: ['bunch', 'bunches'],
  head: ['head', 'heads'], sprig: ['sprig', 'sprigs'], piece: ['piece', 'pieces'], stalk: ['stalk', 'stalks'], leaf: ['leaf', 'leaves'],
  pinch: ['pinch', 'pinches'], dash: ['dash', 'dashes'],
};
const UNIT_OF = new Map(Object.entries(UNITS).flatMap(([unit, names]) => names.map((name) => [name, unit])));
const UNIT_NAMES = [...UNIT_OF.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(' ', '\\s+'));
export const GRAMS_PER = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
export const ML_PER = { tsp: 4.92892, tbsp: 14.7868, cup: 236.588, ml: 1, l: 1000, floz: 29.5735, pt: 473.176, qt: 946.353 };
const TRACE = new Set(['pinch', 'dash']);
const SIZES = ['small', 'medium', 'large'];
const PREP = /\b(?:finely|roughly|thinly|freshly|fresh|chopped|diced|minced|sliced|grated|peeled|drained|rinsed|large|medium|small)\b/g;

const NUMBER = String.raw`\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?`;
const UNIT_GROUP = `(${UNIT_NAMES.join('|')})\\.?(?![a-z])`;
const QUALIFIER = /^(?:about|approximately|roughly|scant|heaping|generous|up to)\s+(?=\d)/i;
const WORD_NUMBER = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const WORD_LEAD = /^(a|an|one|two|three|four|five|six)\s+(?=\d|(?:pinch|dash)(?:es)?\b)/i;
const HYPHEN_PACKAGE = new RegExp(String.raw`^(${NUMBER})\s+(${NUMBER})-${UNIT_GROUP}\s*`, 'i');
const PLUS = new RegExp(String.raw`^plus\s+(${NUMBER})\s*${UNIT_GROUP}\s*`, 'i');
const LEAD = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|to)\s*(?:${NUMBER}))?\s*(?:\((${NUMBER})\s*(${UNIT_NAMES.join('|')})\.?\))?\s*(?:(${UNIT_NAMES.join('|')})\.?(?![a-z]))?\s*`, 'i');

function toNumber(text) {
  return text.trim().split(/\s+/).reduce((sum, part) => {
    const [n, d] = part.split('/').map(Number);
    return sum + (d ? n / d : n);
  }, 0);
}

const round2 = (n) => Math.round(n * 100) / 100;
const unitOf = (text) => (text ? UNIT_OF.get(text.toLowerCase().replace(/\s+/g, ' ')) ?? null : null);

// Rewrites leading word forms into the numeric form LEAD reads: "About 2 cups" -> "2 cups",
// "One 15-ounce can" -> "1 (15 ounce) can", "Pinch of salt" -> "1 Pinch of salt".
function numericLead(text) {
  return text
    .replace(QUALIFIER, '')
    .replace(WORD_LEAD, (_, word) => `${WORD_NUMBER[word.toLowerCase()]} `)
    .replace(/^(?=(?:pinch|dash)(?:es)?\b)/i, '1 ')
    .replace(HYPHEN_PACKAGE, (_, count, size, unit) => `${count} (${size} ${unit}) `);
}

// "1 tablespoon plus 1 teaspoon": adds the second amount when both are volumes or both weights.
function plusAmount(rest, amount, unit) {
  const plus = rest.match(PLUS);
  if (!plus) return { rest, amount };
  const extra = unitOf(plus[2]);
  const per = [ML_PER, GRAMS_PER].find((table) => table[unit] && table[extra]);
  return { rest: rest.slice(plus[0].length), amount: per ? round2(amount + (toNumber(plus[1]) * per[extra]) / per[unit]) : amount };
}

export function parseIngredientLine(line) {
  let text = line.replace(/[½¼¾⅓⅔⅛]/g, (c) => FRACTIONS[c]).trim();
  const toTaste = /\bto taste\b/i.test(text);
  text = numericLead(text.replace(/\bto taste\b/i, '').trim());
  const lead = text.match(LEAD);
  const packageUnit = lead && unitOf(lead[3]);
  const packageGrams = packageUnit && GRAMS_PER[packageUnit] ? round2(toNumber(lead[2]) * GRAMS_PER[packageUnit]) : null;
  const unit = lead ? unitOf(lead[4]) : null;
  const { rest, amount } = lead ? plusAmount(text.slice(lead[0].length), toNumber(lead[1]), unit) : { rest: text, amount: null };
  const lower = rest.toLowerCase();
  const size = amount !== null && !unit ? SIZES.find((s) => new RegExp(`\\b${s}\\b`).test(lower)) ?? null : null;
  const item = lower.split(',')[0].replace(/\([^)]*\)/g, ' ').replace(/^of\s+/, '').replace(PREP, ' ').replace(/\s+/g, ' ').trim();
  return { line, amount, unit, item, size, packageGrams, trace: toTaste || TRACE.has(unit) };
}
