// Trusted-sender gate for forwarded receipts. Only the address decides: a display name is
// ignored, so "receipts@example.com" <someone@else> is judged as someone@else. From alone is
// spoofable, so the sender's domain must also be the domain the mail provider authenticated
// (DKIM signed-by or SPF mailed-by pass), passed as `authenticated`. No evidence: untrusted.
const ADDRESS = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

// The sender's address in lower case, or null when the header is not exactly one address.
export function senderAddress(from) {
  if (typeof from !== 'string') return null;
  const trimmed = from.trim();
  const brackets = trimmed.match(/<[^<>]*>/g) ?? [];
  if (brackets.length > 1) return null;
  const candidate = brackets.length === 1 ? (trimmed.endsWith(brackets[0]) ? brackets[0].slice(1, -1) : '') : trimmed;
  return ADDRESS.test(candidate) ? candidate.toLowerCase() : null;
}

// Exact domain match only: a parent or child domain is not evidence for this sender.
const isAuthenticated = (address, authenticated) =>
  typeof authenticated === 'string' && authenticated.trim().toLowerCase() === address.split('@')[1];

export function checkSender(from, trustedSenders, { authenticated } = {}) {
  if (trustedSenders.length === 0) {
    return { ok: false, reason: 'receipt forwarding is off: no trusted receipt senders are set (chef-setup can add them)' };
  }
  const address = senderAddress(from);
  if (!address) return { ok: false, reason: 'the sender is not a single email address' };
  if (!trustedSenders.some((entry) => entry.toLowerCase() === address)) return { ok: false, reason: `${address} is not a trusted receipt sender` };
  if (!isAuthenticated(address, authenticated)) {
    return { ok: false, reason: `${address} is not authenticated: the mail provider did not confirm the sender's domain (DKIM/SPF), so the From address may be spoofed` };
  }
  return { ok: true };
}
