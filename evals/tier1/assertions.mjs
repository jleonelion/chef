// Ported from chef-core evals/tier1/run.mjs: a small JSONPath-ish query plus equals/includes/min/absent asserts.
// query() returns the single match as-is, or the match list when a fan-out ([*], filter) yields 0 or 2+ matches.
import assert from 'node:assert/strict';

function step(current, segment, expression) {
  const filter = segment.match(/^\[\?\(@\.?([^=]+)=='([^']+)'\)\]$/);
  const arrayProp = segment.match(/^([^[]+)\[\*\]$/);
  const indexProp = segment.match(/^([^[]+)\[(\d+)\]$/);
  const next = [];
  for (const item of current) {
    if (segment === 'length') next.push(item.length);
    else if (filter) {
      assert(Array.isArray(item), `${expression}: filter target is not an array`);
      next.push(...item.filter((entry) => String(entry[filter[1]]) === filter[2]));
    } else if (arrayProp) {
      assert(Array.isArray(item[arrayProp[1]]), `${expression}: ${arrayProp[1]} is not an array`);
      next.push(...item[arrayProp[1]]);
    } else if (indexProp) {
      assert(Array.isArray(item[indexProp[1]]), `${expression}: ${indexProp[1]} is not an array`);
      next.push(item[indexProp[1]][Number(indexProp[2])]);
    } else if (/^\[\d+\]$/.test(segment)) next.push(item[Number(segment.slice(1, -1))]);
    else if (segment === '[*]') next.push(...item);
    else next.push(item?.[segment]);
  }
  return next;
}

export function query(value, expression) {
  if (expression === '$') return value;
  const segments = expression.replace(/^\$\.?/, '').split('.').filter(Boolean);
  const result = segments.reduce((current, segment) => step(current, segment, expression), [value]);
  return result.length === 1 ? result[0] : result;
}

export function assertCase(evaluation, assertion) {
  const actual = query(evaluation, assertion.path);
  if (Object.hasOwn(assertion, 'equals')) assert.deepEqual(actual, assertion.equals, assertion.path);
  if (Object.hasOwn(assertion, 'absent')) {
    const want = assertion.absent ? 'absent' : 'present';
    assert.equal(actual === undefined, assertion.absent, `${assertion.path}: expected ${want}, got ${JSON.stringify(actual)}`);
  }
  if (Object.hasOwn(assertion, 'includes')) {
    assert(typeof actual === 'string' || Array.isArray(actual), `${assertion.path}: includes target is not a string or array`);
    assert(actual.includes(assertion.includes), `${assertion.path}: missing ${JSON.stringify(assertion.includes)}`);
  }
  if (Object.hasOwn(assertion, 'min')) {
    assert(Number(actual) >= assertion.min, `${assertion.path}: expected >= ${assertion.min}, got ${actual}`);
  }
}

export function assertGitState({ beforeHead, afterHead, status }, expected) {
  if (expected.headUnchanged) assert.equal(afterHead, beforeHead, `git HEAD changed from ${beforeHead} to ${afterHead}`);
  if (expected.clean) assert.equal(status, '', `git tree is dirty:\n${status}`);
}
