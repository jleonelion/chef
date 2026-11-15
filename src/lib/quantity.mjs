const VOLUME = { tsp: 1, tbsp: 3, cup: 48, ml: 0.2028841362, l: 202.8841362, floz: 6, pt: 96, qt: 192, gal: 768 };
const MASS = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const COUNT = new Set(['each', 'ct', 'dozen', 'piece', 'slice', 'clove', 'can', 'jar', 'bunch', 'head', 'sprig', 'stick', 'pkg', 'bag', 'box']);
const ALIASES = {
  teaspoons: 'tsp', teaspoon: 'tsp', tablespoons: 'tbsp', tablespoon: 'tbsp', cups: 'cup',
  milliliters: 'ml', milliliter: 'ml', millilitres: 'ml', millilitre: 'ml', liters: 'l', liter: 'l', litres: 'l', litre: 'l',
  'fl oz': 'floz', 'fluid ounce': 'floz', 'fluid ounces': 'floz', pints: 'pt', pint: 'pt', quarts: 'qt', quart: 'qt', gallons: 'gal', gallon: 'gal',
  grams: 'g', gram: 'g', kilograms: 'kg', kilogram: 'kg', ounces: 'oz', ounce: 'oz', lbs: 'lb', pounds: 'lb', pound: 'lb',
  pieces: 'piece', slices: 'slice', cloves: 'clove', cans: 'can', jars: 'jar', bunches: 'bunch', heads: 'head', sprigs: 'sprig', sticks: 'stick', boxes: 'box', dozens: 'dozen',
};

export const normalizeUnit = (unit) => ALIASES[String(unit ?? '').trim().toLowerCase()] ?? String(unit ?? '').trim().toLowerCase();

export function quantityDimension(unit) {
  const normalized = normalizeUnit(unit);
  if (Object.hasOwn(VOLUME, normalized)) return 'volume';
  if (Object.hasOwn(MASS, normalized)) return 'mass';
  if (COUNT.has(normalized)) return 'count';
  return null;
}

export function convertQuantity(amount, fromUnit, toUnit) {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  const dimension = quantityDimension(from);
  if (!dimension || dimension !== quantityDimension(to)) return null;
  if (dimension === 'volume') return (amount * VOLUME[from]) / VOLUME[to];
  if (dimension === 'mass') return (amount * MASS[from]) / MASS[to];
  if (from === to) return amount;
  if (from === 'dozen' && to === 'each') return amount * 12;
  if (from === 'each' && to === 'dozen') return amount / 12;
  return null;
}

// Display only: the household's unit system, a fixed ladder per kind (largest unit keeping the
// amount >= 1), rounded up. Stored and merged amounts stay exact; only output passes through here.
const TABLES = { volume: VOLUME, mass: MASS };
const fixed = (step) => () => step;
const metricSmall = (n) => (n < 100 ? 5 : 25);
const LADDERS = {
  us: { volume: [['tsp', fixed(0.5)], ['tbsp', fixed(0.5)], ['cup', fixed(0.25)], ['qt', fixed(0.25)]], mass: [['oz', fixed(1)], ['lb', fixed(0.25)]] },
  metric: { volume: [['ml', metricSmall], ['l', fixed(0.1)]], mass: [['g', metricSmall], ['kg', fixed(0.1)]] },
};
// tsp/tbsp stay spoons in both systems below 1/4 cup (12 tsp); never converted to ml.
const SPOONS = LADDERS.us.volume.slice(0, 2);
export const SPOON_UNITS = new Set(['tsp', 'tbsp']);
const QUARTER_CUP = VOLUME.cup / 4;
const EPSILON = 1e-9;
const FRACTIONS = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4' };
const PLURAL = { cup: 'cups' };

const roundUp = (n, step) => Number((Math.ceil(n / step - EPSILON) * step).toFixed(9));
export const round2 = (n) => Math.round(n * 100) / 100;

function onLadder(base, ladder, table) {
  const size = (i) => table[ladder[i][0]];
  let i = Math.max(0, ladder.findLastIndex(([unit]) => base / table[unit] >= 1 - EPSILON));
  for (;;) {
    const [unit, step] = ladder[i];
    const exact = base / size(i);
    const amount = roundUp(exact, step(exact));
    if (i + 1 < ladder.length && (amount * size(i)) / size(i + 1) >= 1 - EPSILON) i += 1;
    else return { amount, unit };
  }
}

function usNumber(amount) {
  const whole = Math.floor(amount + EPSILON);
  const fraction = FRACTIONS[round2(amount - whole)];
  return [whole || (fraction ? '' : '0'), fraction].filter(Boolean).join(' ');
}

const label = (amount, unit) => (amount > 1 && PLURAL[unit]) || unit;

// -> { amount, unit, text }. `spoon`: a contributing line used tsp/tbsp (defaults to `unit`'s).
export function displayQuantity(amount, unit, system, { spoon } = {}) {
  const from = normalizeUnit(unit);
  const kind = quantityDimension(from);
  if (kind !== 'volume' && kind !== 'mass') {
    const shown = round2(amount);
    return { amount: shown, unit: from, text: `${shown} ${from}` };
  }
  const table = TABLES[kind];
  const base = amount * table[from];
  const spoons = kind === 'volume' && (spoon ?? SPOON_UNITS.has(from)) && base < QUARTER_CUP - EPSILON;
  const shown = onLadder(base, spoons ? SPOONS : LADDERS[system][kind], table);
  const number = system === 'us' || SPOON_UNITS.has(shown.unit) ? usNumber(shown.amount) : String(shown.amount);
  return { ...shown, text: `${number} ${label(shown.amount, shown.unit)}` };
}
