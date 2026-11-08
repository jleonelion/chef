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
