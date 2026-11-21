export function mergeList(current = [], change = {}) {
  if (Object.hasOwn(change, 'replace') && (change.add?.length || change.remove?.length)) {
    return { status: 'invalid-input', problems: ['replace and add/remove flags cannot be combined for the same list'] };
  }
  const value = [...new Set(Array.isArray(current) ? current : [])];
  const added = [];
  const removed = [];
  const unchanged = [];
  for (const item of change.add ?? []) {
    const trimmed = typeof item === 'string' ? item.trim() : item;
    if (!trimmed) continue;
    if (value.includes(trimmed)) unchanged.push(trimmed);
    else {
      value.push(trimmed);
      added.push(trimmed);
    }
  }
  for (const item of change.remove ?? []) {
    const trimmed = typeof item === 'string' ? item.trim() : item;
    if (!trimmed) continue;
    const index = value.indexOf(trimmed);
    if (index === -1) unchanged.push(trimmed);
    else {
      value.splice(index, 1);
      removed.push(trimmed);
    }
  }
  return { value, added, removed, unchanged: [...new Set(unchanged)] };
}
