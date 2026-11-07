import { isKey } from './store.mjs';

// Shipped placement defaults: where a new item goes when the receipt line names no target.
// First matching rule wins; keywords match whole words in the item name.
const RULES = [
  ['freezer.other', ['frozen', 'ice cream']],
  ['fridge.dairy', ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'kefir']],
  ['fridge.eggs', ['egg', 'eggs']],
  ['fridge.proteins', ['chicken', 'beef', 'pork', 'turkey', 'salmon', 'fish', 'shrimp', 'tofu', 'tempeh', 'sausage']],
  ['fridge.produce', ['spinach', 'lettuce', 'kale', 'apple', 'apples', 'banana', 'bananas', 'tomato', 'tomatoes', 'onion', 'onions', 'avocado', 'avocados', 'carrot', 'carrots', 'berries', 'lemon', 'lemons', 'lime', 'limes', 'pepper', 'peppers', 'herbs', 'cilantro', 'parsley', 'garlic', 'potato', 'potatoes']],
  ['pantry.grains', ['rice', 'pasta', 'spaghetti', 'oats', 'quinoa', 'flour', 'bread', 'cereal', 'tortillas']],
  ['pantry.canned', ['canned', 'beans', 'chickpeas', 'lentils', 'broth', 'stock']],
  ['pantry.condiments', ['oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'mayo', 'dressing', 'salt', 'spice']],
  ['pantry.beverages', ['juice', 'soda', 'water', 'coffee', 'tea']],
];

export function placeItem(name) {
  const words = ` ${name.toLowerCase().replace(/[^a-z]+/g, ' ')} `;
  const rule = RULES.find(([, keywords]) => keywords.some((keyword) => words.includes(` ${keyword} `)));
  return rule ? rule[0] : 'pantry.other';
}

// Lower-case snake_case key, or null when the name has no letters or digits.
export function itemKey(name) {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60).replace(/_+$/, '');
  if (!key) return null;
  return isKey(key) ? key : `${key}_item`;
}
