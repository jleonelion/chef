// Shipped unit defaults: receipt unit words and the canonical unit each is stored as.
const ALIASES = {
  ct: 'each', x: 'each', ea: 'each', each: 'each', count: 'each', whole: 'each',
  lb: 'lb', lbs: 'lb', oz: 'oz', g: 'g', kg: 'kg', ml: 'ml', l: 'l', gal: 'gal', qt: 'qt', pt: 'pt',
  pkg: 'pkg', bag: 'bag', bunch: 'bunch', can: 'can', cans: 'can', jar: 'jar', box: 'box', dozen: 'dozen',
};

export const UNIT_WORDS = new Set(Object.keys(ALIASES));
export const canonicalUnit = (unit) => ALIASES[String(unit).toLowerCase()] ?? String(unit).toLowerCase();
