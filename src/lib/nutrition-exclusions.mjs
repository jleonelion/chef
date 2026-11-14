// Ingredient lines left out of nutrition because their impact is nominal, each with the reason
// recorded in nutrition_sources. Measured salt and measured food served alongside still count;
// only unmeasured garnishes and seasonings, optional lines and trace amounts are left out.
const OPTIONAL = /\boptional\b/i;
const GARNISH = /\b(?:for|to)\s+(?:garnish(?:ing)?|serv(?:e|ing)|topping|dusting)\b/i;
const SEASONING_WORDS = new Set(['salt', 'pepper', 'and', 'black', 'white', 'kosher', 'sea', 'flaky', 'ground', 'cracked', 'more']);
export const NO_ZEST_YIELD = 'no USDA per-fruit yield';

const isSeasoning = (item) => /salt|pepper/.test(item) && item.split(/[^a-z]+/).filter(Boolean).every((word) => SEASONING_WORDS.has(word));

// parsed: a parseIngredientLine result. The reason it is excluded, or null when it counts.
export function exclusion(parsed) {
  if (parsed.trace) return 'trace amount';
  if (OPTIONAL.test(parsed.line)) return 'optional';
  if (parsed.citrus === 'zest') return `zest, ${NO_ZEST_YIELD}`;
  if (parsed.amount !== null) return null;
  if (GARNISH.test(parsed.line)) return 'garnish';
  if (isSeasoning(parsed.item)) return 'seasoning';
  return null;
}
