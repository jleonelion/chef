// Public-hygiene rules. Findings never include the matched text: the job runs in public CI logs,
// so echoing a match would leak the very identifier it caught.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const ALLOWED_EMAIL = [
  /@example\.com$/i,
  /@users\.noreply\.github\.com$/i,
  /^noreply@github\.com$/i,
  /^noreply@anthropic\.com$/i,
];

export const isAllowedEmail = (email) => ALLOWED_EMAIL.some((rule) => rule.test(email));

// Deny patterns: one case-insensitive regex per non-blank, non-# line.
export function parseDenyList(text = '') {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => new RegExp(line, 'i'));
}

export function scanText(text, denyList) {
  const findings = [];
  text.split('\n').forEach((line, i) => {
    for (const email of line.match(EMAIL) ?? []) {
      if (!isAllowedEmail(email)) findings.push({ line: i + 1, rule: 'email outside example.com' });
    }
    denyList.forEach((pattern, n) => {
      if (pattern.test(line)) findings.push({ line: i + 1, rule: `deny-list pattern #${n + 1}` });
    });
  });
  return findings;
}
