// Recipe display in the household's unit system (convert_recipe_units, #45). Output only:
// stored recipes are never rewritten. Ingredient weights and volumes foreign to the system are
// shown converted, the original in parens; step oven temperatures get the system's scale.
import { measuredLead } from './ingredient-line.mjs';
import { convertQuantity, kitchenQuantity, SPOON_UNITS } from './quantity.mjs';

const NATIVE = { us: new Set(['tsp', 'tbsp', 'cup', 'floz', 'pt', 'qt', 'oz', 'lb']), metric: new Set(['g', 'kg', 'ml', 'l']) };
const SYSTEM_NAME = { us: 'US units', metric: 'metric units' };
const QUARTER_CUP_TSP = 12;
const SCALE = { us: 'F', metric: 'C' };
// An amount already followed by its conversion: "1 cup (240 ml)", "200 g / 7 oz".
const HAS_CONVERSION = /^\s*[(/]\s*\d/;
// A number directly followed by °F/°C or degrees F/C, not already beside its conversion.
const TEMPERATURE = /(?<![(/]\s*)\b(\d+(?:\.\d+)?)\s?(?:°\s?|degrees\s)([FC])\b(?!\s*[(/]\s*\d)/gi;
const TO_SCALE = { C: (f) => ((f - 32) * 5) / 9, F: (c) => (c * 9) / 5 + 32 };

const keptSpoon = ({ amount, unit }) => SPOON_UNITS.has(unit) && convertQuantity(amount, unit, 'tsp') < QUARTER_CUP_TSP;

function convertLine(line, system) {
  const lead = measuredLead(line);
  if (!lead || NATIVE[system].has(lead.unit) || keptSpoon(lead)) return null;
  const rest = line.slice(lead.text.length);
  if (HAS_CONVERSION.test(rest)) return null;
  const shown = kitchenQuantity(lead.amount, lead.unit, system);
  return shown && `${shown.text} (${lead.text})${rest}`;
}

function convertTemperatures(line, system) {
  const target = SCALE[system];
  return line.replace(TEMPERATURE, (match, degrees, scale) => {
    if (scale.toUpperCase() === target) return match;
    return `${match} (${Math.round(TO_SCALE[target](Number(degrees)) / 5) * 5}°${target})`;
  });
}

// -> the body as shown; unchanged when nothing converts.
export function convertRecipeBody(body, system) {
  let section = null;
  let ingredientsAt = -1;
  let converted = false;
  const out = body.split('\n').map((line, index) => {
    const heading = line.match(/^## (.+?)\s*$/);
    if (heading) {
      section = heading[1].toLowerCase();
      if (section === 'ingredients') ingredientsAt = index;
      return line;
    }
    if (section === 'steps') return convertTemperatures(line, system);
    const bullet = section === 'ingredients' && line.match(/^(\s*[-*]\s+)(.+)$/);
    const shown = bullet && convertLine(bullet[2], system);
    if (!shown) return line;
    converted = true;
    return `${bullet[1]}${shown}`;
  });
  const note = `Amounts converted to ${SYSTEM_NAME[system]}; steps keep the recipe's original amounts.`;
  if (converted) out.splice(ingredientsAt + 1, 0, '', note);
  return out.join('\n');
}
