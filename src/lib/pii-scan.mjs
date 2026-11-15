// Pattern scan for personal details in text that leaves a user's machine or lands in the public
// repo (reproduction cases, seeds). Findings carry the line and rule, never the matched text, so
// a CI log can't leak what it caught.
// Reserved example domains (RFC 2606) count as synthetic; schema vocabularies are public, not personal.
const RESERVED_HOST = /(^|\.)example(\.(com|org|net))?$/i;
const PUBLIC_HOST = /^(json-)?schema\.org$/i;

const RULES = [
  { rule: 'email', pattern: /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g, allowed: (m) => RESERVED_HOST.test(m[1]) },
  { rule: 'url', pattern: /\bhttps?:\/\/([^\s/:"'<>)]+)/gi, allowed: (m) => RESERVED_HOST.test(m[1]) || PUBLIC_HOST.test(m[1]) },
  { rule: 'phone', pattern: /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
  { rule: 'street address', pattern: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Place|Pl)\b/g },
  // Home directories, ~/..., and any absolute path of two or more segments that starts a word
  // (so the path part of a URL, a date like 2026/01/15 or "and/or" never counts).
  { rule: 'file path', pattern: /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\"']+|(?<![^\s"'(=`])(?:~|\/[\w.-]+)\/[^\s"'<>)]+/g },
  { rule: 'long digit run', pattern: /\d{9,}/g },
];

export function scanPii(text) {
  const findings = [];
  text.split('\n').forEach((line, i) => {
    for (const { rule, pattern, allowed } of RULES) {
      for (const match of line.matchAll(pattern)) {
        if (!allowed?.(match)) findings.push({ line: i + 1, rule });
      }
    }
  });
  return findings;
}
