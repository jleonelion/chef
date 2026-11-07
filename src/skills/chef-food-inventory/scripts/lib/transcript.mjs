// Receipt transcript: the one input format for every receipt source. One item per line:
//   [1. | -] <quantity> <unit> <item name> — $<price> [(expires YYYY-MM-DD)] [-> <location>.<category>[.<item>]]
// Lines without "$" are commentary. A priced line that does not parse is rejected, never guessed.
import { isIsoDate } from './dates.mjs';
import { canonicalUnit, UNIT_WORDS } from './units.mjs';

const ITEM_LINE = new RegExp(
  String.raw`^\s*(?:\d+[.)]\s+|[-*•]\s+)?` +
    String.raw`(\d+(?:\.\d+)?)\s*([a-z]+)\s+` +
    String.raw`(.+?)\s+[—–-]\s+\$(\d+(?:\.\d{1,2})?)` +
    String.raw`\s*(?:\(([^()]*)\))?` +
    String.raw`(?:\s*(?:->|→)\s*(\S+))?\s*$`,
  'i',
);
const TARGET = /^(pantry|fridge|freezer)\.[a-z0-9]+(_[a-z0-9]+)*(\.[a-z0-9]+(_[a-z0-9]+)*)?$/;
const EXPIRES = /^expires (\d{4}-\d{2}-\d{2})$/i;


function parseDetail(detail) {
  if (!detail?.trim()) return { expires: null };
  const match = detail.trim().match(EXPIRES);
  if (!match || !isIsoDate(match[1])) return null;
  return { expires: match[1] };
}

function parseItemLine(line) {
  const match = line.match(ITEM_LINE);
  if (!match) return null;
  const [, quantity, unit, rawName, price, detail, target] = match;
  if (!UNIT_WORDS.has(unit.toLowerCase())) return null;
  if (target && !TARGET.test(target)) return null;
  const parsedDetail = parseDetail(detail);
  if (!parsedDetail) return null;
  const name = rawName.trim();
  if (!/[a-z]{2,}/i.test(name) || name.length > 80) return null;
  return { name, quantity: Number(quantity), unit: canonicalUnit(unit), price: Number(price), ...parsedDetail, target: target ?? null };
}

export function parseTranscript(text) {
  const items = [];
  const rejected = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.includes('$')) return;
    const item = parseItemLine(line);
    if (item) items.push({ ...item, lineNumber: index + 1 });
    else rejected.push({ lineNumber: index + 1, line: line.slice(0, 200) });
  });
  return { items, rejected };
}
