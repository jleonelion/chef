// Every inventory change is one call here: the store, one audit line, any extra store or raw
// files, and the regenerated rollup page land in one data-root commit via the shared write path.
import { writeWiki } from '../../../../lib/wiki.mjs';
import { renderRollup } from './rollup.mjs';
import { readText, serializeInventory, sha256, STORE, validateInventory } from './store.mjs';

export function commitInventory(root, { inventory, action, details, data = [], raw = [], message }) {
  const problems = validateInventory(inventory);
  if (problems.length) return { status: 'invalid-input', problems };
  const before = readText(root, STORE.inventory);
  const content = serializeInventory(inventory);
  const audit = { ts: inventory.lastUpdated, actor: 'chef-food-inventory', action, before_hash: before === null ? null : sha256(before), after_hash: sha256(content), details };
  const auditText = `${readText(root, STORE.audit) ?? ''}${JSON.stringify(audit)}\n`;
  return writeWiki(root, {
    pages: [renderRollup(inventory)],
    data: [{ path: STORE.inventory, content }, { path: STORE.audit, content: auditText }, ...data],
    raw,
    message,
  });
}
