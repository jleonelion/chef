// The health-goals store, data/health-goals/goals.json: one advisory goal with daily macro
// targets. Only this skill writes it. No file, or `goal: null`, means health features are dormant.
// The first goal also records the shared one-time training-setting notice, in the same commit.
import fs from 'node:fs';
import path from 'node:path';
import { NUTRIENTS } from '../../../../lib/fdc.mjs';
import { noticeToRecord } from '../../../../lib/notices.mjs';
import { NOT_MEDICAL_ADVICE, TRAINING_NOTICE } from '../../../../lib/safety-text.mjs';
import { writeRefusal, writeWiki } from '../../../../lib/wiki.mjs';

export const GOALS_PATH = 'data/health-goals/goals.json';
const FIELDS = Object.keys(NUTRIENTS);

export function readGoal(root) {
  const file = path.join(root, GOALS_PATH);
  if (!fs.existsSync(file)) return { status: 'dormant' };
  let stored;
  try {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { status: 'unreadable', reason: `${GOALS_PATH} is not valid JSON` };
  }
  if (!stored?.goal) return { status: 'dormant' };
  return { status: 'active', goal: stored.goal, targets: stored.targets ?? {}, set: stored.set };
}

// The goal when one is declared, else null. Callers stay silent on null.
export const activeGoal = (root) => {
  const goal = readGoal(root);
  return goal.status === 'active' ? goal : null;
};

// `--min protein=90 --max sodium=2300` → { targets: { protein: { min: 90 }, sodium: { max: 2300 } }, problems }.
export function parseTargets({ min = [], max = [] }) {
  const targets = {};
  const problems = [];
  const pairs = [...min.map((pair) => ['min', pair]), ...max.map((pair) => ['max', pair])];
  for (const [bound, pair] of pairs) {
    const [nutrient, raw] = pair.split('=').map((part) => part.trim());
    const value = Number(raw);
    if (!FIELDS.includes(nutrient)) problems.push(`unknown nutrient "${nutrient}"; use one of ${FIELDS.join(', ')}`);
    else if (!raw || !Number.isFinite(value) || value <= 0) problems.push(`${nutrient}: ${bound} must be a positive number`);
    else targets[nutrient] = { ...targets[nutrient], [bound]: value };
  }
  for (const [nutrient, { min: low, max: high }] of Object.entries(targets)) {
    if (low !== undefined && high !== undefined && low > high) problems.push(`${nutrient}: min is above max`);
  }
  return { targets, problems };
}

const storeFile = (value) => ({ path: GOALS_PATH, content: `${JSON.stringify(value, null, 2)}\n` });

function mergeTargets(current = {}, edit = {}) {
  const targets = Object.fromEntries(Object.entries(current).map(([nutrient, bounds]) => [nutrient, { ...bounds }]));
  const setPairs = [...(edit.setMin ?? []).map((pair) => ['min', pair]), ...(edit.setMax ?? []).map((pair) => ['max', pair])];
  for (const [bound, pair] of setPairs) {
    const [nutrient, raw] = pair.split('=').map((part) => part.trim());
    if (!FIELDS.includes(nutrient) || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    targets[nutrient] = { ...targets[nutrient], [bound]: value };
  }
  const addPairs = [...(edit.addMin ?? []).map((pair) => ['min', pair]), ...(edit.addMax ?? []).map((pair) => ['max', pair])];
  for (const [bound, pair] of addPairs) {
    const [nutrient, raw] = pair.split('=').map((part) => part.trim());
    if (!FIELDS.includes(nutrient) || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (targets[nutrient]?.[bound] === undefined) targets[nutrient] = { ...targets[nutrient], [bound]: value };
  }
  for (const nutrient of edit.removeTarget ?? []) {
    delete targets[nutrient.trim()];
  }
  for (const nutrient of edit.removeMin ?? []) delete targets[nutrient.trim()]?.min;
  for (const nutrient of edit.removeMax ?? []) delete targets[nutrient.trim()]?.max;
  return Object.fromEntries(Object.entries(targets).filter(([, bounds]) => bounds && Object.keys(bounds).length));
}

export function setGoal(root, { goal, targets, addMin, removeMin, addMax, removeMax, setMin, setMax, removeTarget }, { date, rewrite = false, mergeTargets: partial = false } = {}) {
  const text = goal?.trim();
  if (!text) return { status: 'invalid-input', data_root: root, problems: ['give --goal with a short description of the goal'] };
  const refusal = writeRefusal(root);
  if (refusal) return refusal;
  const current = readGoal(root);
  if (current.status === 'unreadable' && !rewrite) {
    return { status: 'refused', data_root: root, reason: current.reason, content: fs.readFileSync(path.join(root, GOALS_PATH), 'utf8') };
  }
  const set = current.status === 'active' ? current.set : date;
  const finalTargets = partial ? mergeTargets(current.status === 'active' ? current.targets : {}, {
    addMin, removeMin, addMax, removeMax, setMin, setMax, removeTarget,
  }) : targets;
  if (partial) {
    const pairs = [...(setMin ?? []), ...(setMax ?? []), ...(addMin ?? []), ...(addMax ?? [])];
    const problems = [];
    for (const pair of pairs) {
      const [nutrient, raw] = pair.split('=').map((part) => part.trim());
      if (!FIELDS.includes(nutrient)) problems.push(`unknown nutrient "${nutrient}"; use one of ${FIELDS.join(', ')}`);
      else if (!raw || !Number.isFinite(Number(raw)) || Number(raw) <= 0) problems.push(`${nutrient}: target must be a positive number`);
    }
    if (problems.length) return { status: 'invalid-input', data_root: root, problems };
  }
  if (partial && JSON.stringify(finalTargets) === JSON.stringify(current.status === 'active' ? current.targets : {})) {
    return { status: 'unchanged', data_root: root, goal: text, targets: finalTargets };
  }
  const notice = noticeToRecord(root, 'training-setting', date);
  const written = writeWiki(root, {
    data: [storeFile({ goal: text, targets: finalTargets, set, updated: date }), ...(notice ? [notice] : [])],
    message: 'chef-health-goals: set goal',
  });
  if (written.status !== 'written') return written;
  return { status: 'saved', data_root: root, goal: text, targets: finalTargets, ...(notice && { notice: TRAINING_NOTICE }), footer: NOT_MEDICAL_ADVICE };
}

export function clearGoal(root, { date }) {
  if (readGoal(root).status !== 'active') return { status: 'dormant', data_root: root };
  const written = writeWiki(root, { data: [storeFile({ goal: null, targets: {}, updated: date })], message: 'chef-health-goals: clear goal' });
  return written.status === 'written' ? { status: 'cleared', data_root: root } : written;
}
