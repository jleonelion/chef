import fs from 'node:fs';

export const OPTIONS = {
  'data-root': { type: 'string' },
  'transcript-file': { type: 'string' },
  source: { type: 'string' },
  from: { type: 'string' },
  authenticated: { type: 'string' },
  'receipt-id': { type: 'string' },
  date: { type: 'string' },
  store: { type: 'string' },
  path: { type: 'string' },
  amount: { type: 'string' },
  unit: { type: 'string' },
  expires: { type: 'string' },
  remove: { type: 'boolean' },
  reason: { type: 'string' },
  recipe: { type: 'string' },
  servings: { type: 'string' },
  'deduction-id': { type: 'string' },
  today: { type: 'string' },
  days: { type: 'string' },
};

// The local calendar date, YYYY-MM-DD.
export const today = () => new Date().toLocaleDateString('en-CA');

// "-" or no file reads stdin.
export function readTranscript(file) {
  return fs.readFileSync(!file || file === '-' ? 0 : file, 'utf8');
}
