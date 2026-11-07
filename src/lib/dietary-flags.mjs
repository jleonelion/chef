// The one place that turns ingredient text into dietary flags. Flag set: the US major food
// allergens plus gluten, with tree nuts and peanuts split. Matching is on ingredient wording
// only and leans toward flagging: a generic "nuts" raises both nut flags, oats raise gluten.
// "Gluten-free" and similar wording are label claims Chef cannot verify, so they never clear a flag.
const words = (...list) => new RegExp(`(?<![a-z])(?:${list.join('|')})(?:s|es)?(?![a-z])`);
const phrases = (...list) => new RegExp(`(?<![a-z])(?:${list.join('|')})(?![a-z])`, 'g');

const WHEAT = [
  'wheat', 'flour', 'bread', 'breadcrumb', 'panko', 'pasta', 'spaghetti', 'linguine', 'fettuccine', 'penne',
  'macaroni', 'lasagna', 'lasagne', 'orzo', 'rigatoni', 'fusilli', 'tagliatelle', 'noodle', 'udon', 'ramen',
  'couscous', 'bulgur', 'semolina', 'farro', 'spelt', 'durum', 'seitan', 'tortilla', 'pita', 'baguette',
  'crouton', 'cracker', 'pastry', 'pastries', 'phyllo', 'filo', 'brioche', 'bagel', 'biscuit', 'soy sauce', 'teriyaki', 'hoisin',
];
const NOT_WHEAT = phrases('(?:almond|rice|coconut|chickpea|corn|oat|tapioca|potato|cassava|buckwheat|cauliflower|glass) (?:flour|tortillas?|noodles?|pasta|crackers?)');
const PLANT = '(?:coconut|almond|oat|soy|rice|cashew|hemp|flax)';
const TREE_NUT_NAMES = ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut', 'pignoli', 'chestnut'];

const RULES = {
  'contains-dairy': {
    match: words('milk', 'buttermilk', 'butter', 'cream', 'cheese', 'parmesan', 'parmigiano', 'mozzarella', 'cheddar', 'ricotta', 'feta', 'gruyere', 'pecorino', 'mascarpone', 'paneer', 'halloumi', 'brie', 'yogurt', 'yoghurt', 'ghee', 'whey', 'casein', 'kefir', 'creme fraiche', 'crème fraîche', 'half-and-half', 'pesto'),
    except: phrases(`${PLANT} (?:milk|cream|yogurt|yoghurt|butter)`, '(?:peanut|nut|seed|sunflower|apple|cocoa|shea) butter', 'butter beans?', 'cream of tartar'),
  },
  'contains-egg': { match: words('egg', 'yolk', 'mayonnaise', 'mayo', 'meringue', 'aioli'), except: phrases('vegan (?:mayo|mayonnaise)') },
  'contains-fish': {
    match: words('fish', 'anchovy', 'anchovies', 'salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'trout', 'sardine', 'mackerel', 'haddock', 'snapper', 'sea bass', 'swordfish', 'bonito', 'dashi', 'worcestershire', 'caesar'),
  },
  'contains-gluten': { match: words(...WHEAT, 'barley', 'rye', 'malt', 'oat', 'beer'), except: NOT_WHEAT },
  'contains-peanuts': { match: words('peanut', 'groundnut', 'satay', 'nut'), except: phrases('(?:pine|brazil|tiger) nuts?') },
  'contains-sesame': { match: words('sesame', 'tahini', 'benne', "za'atar", 'zaatar', 'gomasio', 'hummus', 'furikake', 'halva', 'halvah') },
  'contains-shellfish': {
    match: words('shellfish', 'shrimp', 'prawn', 'crab', 'lobster', 'crawfish', 'crayfish', 'langoustine', 'scampi', 'clam', 'mussel', 'oyster', 'scallop', 'squid', 'calamari', 'octopus'),
    except: phrases('oyster mushrooms?'),
  },
  'contains-soy': { match: words('soy', 'soya', 'soybean', 'tofu', 'tempeh', 'edamame', 'miso', 'tamari', 'shoyu', 'teriyaki', 'natto', 'hoisin') },
  'contains-tree-nuts': { match: words(...TREE_NUT_NAMES, 'praline', 'marzipan', 'frangipane', 'nutella', 'pesto', 'nut') },
  'contains-wheat': { match: words(...WHEAT), except: NOT_WHEAT },
};

export const DIETARY_FLAGS = Object.keys(RULES).sort();

function lineHas(rule, line) {
  const text = rule.except ? line.replace(rule.except, ' ') : line;
  return rule.match.test(text);
}

// Sorted contains-* flags for a recipe's ingredient lines.
export function dietaryFlags(lines) {
  const lower = lines.map((line) => line.toLowerCase());
  return DIETARY_FLAGS.filter((flag) => lower.some((line) => lineHas(RULES[flag], line)));
}
