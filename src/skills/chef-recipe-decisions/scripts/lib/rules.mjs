// Standing auto-approve and auto-reject rules. A rule matches when every phrase it lists
// appears at the start of a word in the proposal's title (title_includes) or anywhere in its
// title, description, cuisine, tags and ingredients (text_includes). Reject rules win.
import { writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';
import { readRules, RULES_FILE, storeFile } from './store.mjs';

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LISTS = { reject: 'auto_reject', approve: 'auto_approve' };
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (haystack, phrase) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(phrase.trim().toLowerCase())}`, 'u').test(haystack);

function matches(rule, recipe) {
  const title = recipe.title.toLowerCase();
  const text = [recipe.title, recipe.description, recipe.cuisine, ...(recipe.tags ?? []), ...recipe.ingredients].filter(Boolean).join('\n').toLowerCase();
  return (rule.title_includes ?? []).every((p) => has(title, p)) && (rule.text_includes ?? []).every((p) => has(text, p));
}

// { action: 'reject' | 'approve', rule } for the first matching rule, else null.
export function matchRule(rules, recipe) {
  for (const action of ['reject', 'approve']) {
    const rule = (rules[LISTS[action]] ?? []).find((r) => matches(r, recipe));
    if (rule) return { action, rule };
  }
  return null;
}

const clean = (items) => (items ?? []).map((p) => p.trim()).filter(Boolean);

export function addRule(root, { action, id, reason, title, text, date }) {
  const rule = { id, reason: reason?.trim(), title_includes: clean(title), text_includes: clean(text), created: date };
  const problems = [];
  if (!Object.hasOwn(LISTS, action)) problems.push('--action must be approve or reject');
  if (!ID.test(id ?? '')) problems.push('--id must be lowercase letters, digits and single hyphens');
  if (!rule.reason) problems.push('--reason is required');
  if (!rule.title_includes.length && !rule.text_includes.length) problems.push('give at least one --title or --text phrase');
  if (problems.length) return { status: 'invalid-input', data_root: root, problems };
  for (const key of ['title_includes', 'text_includes']) if (!rule[key].length) delete rule[key];

  const refusal = writeRefusal(root);
  if (refusal) return refusal;
  const rules = readRules(root);
  const existed = Object.values(LISTS).some((list) => (rules[list] ?? []).some((r) => r.id === id));
  const next = Object.fromEntries(Object.values(LISTS).map((list) => [list, (rules[list] ?? []).filter((r) => r.id !== id)]));
  next[LISTS[action]].push(rule);
  const written = writeWiki(root, { data: [storeFile(RULES_FILE, next)], message: `chef-recipe-decisions: ${existed ? 'replace' : 'add'} rule ${id}` });
  return written.status === 'written' ? { status: existed ? 'replaced' : 'added', data_root: root, action, rule } : written;
}

export function removeRule(root, { id }) {
  const rules = readRules(root);
  if (!Object.values(LISTS).some((list) => (rules[list] ?? []).some((r) => r.id === id))) return { status: 'not-found', data_root: root, id: id ?? null };
  const next = Object.fromEntries(Object.values(LISTS).map((list) => [list, (rules[list] ?? []).filter((r) => r.id !== id)]));
  const written = writeWiki(root, { data: [storeFile(RULES_FILE, next)], message: `chef-recipe-decisions: remove rule ${id}` });
  return written.status === 'written' ? { status: 'removed', data_root: root, id } : written;
}
