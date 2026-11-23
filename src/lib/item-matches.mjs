export const itemName = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function parseItemMatches(values = []) {
  const matches = new Map();
  const paths = [];
  const problems = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const separator = value.indexOf('=');
    if (separator <= 0 || separator === value.length - 1) {
      problems.push(`--match must use <ingredient>=<inventory path>: ${value}`);
      continue;
    }
    const ingredient = itemName(value.slice(0, separator));
    const path = value.slice(separator + 1).trim();
    if (!ingredient || !path) {
      problems.push(`--match must use <ingredient>=<inventory path>: ${value}`);
      continue;
    }
    matches.set(ingredient, path);
    paths.push(path);
  }
  return { matches, paths: [...new Set(paths)], problems };
}
