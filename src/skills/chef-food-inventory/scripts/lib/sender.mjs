// Trusted-sender gate for forwarded receipts. Only the address decides: a display name is
// ignored, so "receipts@example.com" <someone@else> is judged as someone@else.
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

export function checkSender(from, trustedSenders) {
  if (trustedSenders.length === 0) {
    return { ok: false, reason: 'receipt forwarding is off: no trusted receipt senders are set (chef-setup can add them)' };
  }
  const address = senderAddress(from);
  if (!address) return { ok: false, reason: 'the sender is not a single email address' };
  const trusted = trustedSenders.some((entry) => entry.toLowerCase() === address);
  return trusted ? { ok: true } : { ok: false, reason: `${address} is not a trusted receipt sender` };
}
