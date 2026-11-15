// Recipe display in the household's unit system (convert_recipe_units, #45). Output only:
// stored recipes are never rewritten. Ingredient weights and volumes foreign to the system are
// shown converted, the original in parens; step oven temperatures get the system's scale.
import { measuredLead } from './ingredient-line.mjs';
import { convertQuantity, kitchenQuantity, SPOON_UNITS } from './quantity.mjs';

const NATIVE = { us: new Set(['tsp', 'tbsp', 'cup', 'floz', 'pt', 'qt', 'oz', 'lb']), metric: new Set(['g', 'kg', 'ml', 'l']) };
const SYSTEM_NAME = { us: 'US units', metric: 'metric units' };
const QUARTER_CUP_TSP = 12;
const SCALE = { us: 'F', metric: 'C' };
// A number directly followed by °F/°C or degrees F/C, not already beside its conversion.
const TEMPERATURE = /(?<!\(\s*)\b(\d+(?:\.\d+)?)(\s?(?:°\s?|degrees\s)([FC]))\b(?!\s*\(\s*\d)/g;
const toOther = { F: (f) => ((f - 32) * 5) / 9, C: (c) => (c * 9) / 5 + 32 };

const keptSpoon = ({ amount, unit }) => SPOON_UNITS.has(unit) && convertQuantity(amount, unit, 'tsp') < QUARTER_CUP_TSP;

function convertLine(line, system) {
  const lead = measuredLead(line);
  if (!lead || NATIVE[system].has(lead.unit) || keptSpoon(lead)) return null;
  const shown = kitchenQuantity(lead.amount, lead.unit, system);
  return shown && `${shown.text} (${lead.text})${line.slice(lead.text.length)}`;
}

function convertTemperatures(line, system) {
  const target = SCALE[system];
  return line.replace(TEMPERATURE, (match, degrees, _unit, scale) => {
    if (scale === target) return match;
    return `${match} (${Math.round(toOther[scale](Number(degrees)) / 5) * 5}°${target})`;
  });
}

// -> the body as shown; unchanged when nothing converts.
export function convertRecipeBody(body, system) {
  let section = null;
  let converted = false;
  const out = body.split('\n').map((line) => {
    const heading = line.match(/^## (.+?)\s*$/);
    if (heading) {
      section = heading[1].toLowerCase();
      return line;
    }
    if (section === 'steps') return convertTemperatures(line, system);
    const bullet = section === 'ingredients' && line.match(/^(\s*[-*]\s+)(.+)$/);
    const next = bullet && convertLine(bullet[2], system);
    if (!next) return line;
    converted = true;
    return `${bullet[1]}${next}`;
  });
  if (!converted) return out.join('\n');
  const note = `Amounts converted to ${SYSTEM_NAME[system]}; steps keep the recipe's original amounts.`;
  return out.join('\n').replace(/^## Ingredients[ \t]*$/im, (heading) => `${heading}\n\n${note}`);
}
