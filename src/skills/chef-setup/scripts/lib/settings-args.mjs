// CLI flags for `setup.mjs set`. A reset value (empty list, "none", "default") maps to null.
const splitList = (raw) => raw.split(',').map((entry) => entry.trim()).filter(Boolean);
const orReset = (value, isReset) => (isReset ? null : value);

const FLAGS = {
  units: ['units', (raw) => orReset(raw, raw === 'default')],
  'household-recipients': ['household_recipients', (raw) => orReset(splitList(raw), splitList(raw).length === 0)],
  'trusted-receipt-senders': ['trusted_receipt_senders', (raw) => orReset(splitList(raw), splitList(raw).length === 0)],
  calendar: ['calendar', (raw) => orReset(raw.trim(), raw.trim() === '' || raw.trim() === 'none')],
};

export const SETTING_FLAGS = Object.fromEntries(Object.keys(FLAGS).map((flag) => [flag, { type: 'string' }]));

export function changesFromFlags(values) {
  const entries = Object.entries(FLAGS).filter(([flag]) => values[flag] !== undefined);
  return Object.fromEntries(entries.map(([flag, [key, convert]]) => [key, convert(values[flag])]));
}
