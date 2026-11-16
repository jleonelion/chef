// Pattern scan for personal details in text that leaves a user's machine or lands in the public
// repo (reproduction cases, seeds). Findings carry the line and rule, never the matched text, so
// a CI log can't leak what it caught.
// Reserved example domains (RFC 2606) count as synthetic; schema vocabularies are public, not personal.
import definition from '../../schemas/feedback/pii-patterns.v1.json' with { type: 'json' };

export const PII_TEXT_FIELDS = definition.text_fields;
const { rules: definitions } = definition;
const RULES = definitions.map(({ rule, pattern, flags, allow_hosts, allow_host_suffixes }) => ({
  rule,
  pattern: new RegExp(pattern, `${flags}g`),
  isAllowed(match) {
    const host = match[1]?.toLowerCase();
    return (
      allow_hosts.includes(host) ||
      allow_host_suffixes.some((suffix) => host === suffix || host?.endsWith(`.${suffix}`))
    );
  },
}));

export function scanPii(text) {
  const findings = [];
  text.split('\n').forEach((line, i) => {
    for (const { rule, pattern, isAllowed } of RULES) {
      for (const match of line.matchAll(pattern)) {
        if (!isAllowed(match)) findings.push({ line: i + 1, rule });
      }
    }
  });
  return findings;
}
