// Expiration tracking, derived from the store on demand; nothing is persisted.
import { daysBetween } from './dates.mjs';
import { listItems } from './store.mjs';

export function expiringItems(inventory, { today, days }) {
  const dated = listItems(inventory)
    .filter((item) => item.expires && item.amount > 0)
    .map(({ path, name, amount, unit, expires }) => ({ path, name, amount, unit, expires, days_left: daysBetween(today, expires) }))
    .sort((a, b) => a.expires.localeCompare(b.expires) || a.path.localeCompare(b.path));
  return {
    expired: dated.filter((item) => item.days_left < 0),
    soon: dated.filter((item) => item.days_left >= 0 && item.days_left <= days),
  };
}
