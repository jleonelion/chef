// The destination card shown with the preview of a report that Chef can send: where it goes,
// who sees it, how long it is kept, that no identity is attached, and its exact size.
// Retention mirrors the intake service: 90 days, or 30 days after the maintainer closes it.
export function destinationCard(adapter, bytes) {
  const host = adapter.feedback.destination?.host;
  if (!host) return null;
  return [
    `Where it goes: Chef's feedback service at ${host}. Chef's script sends it directly; nothing is relayed through this chat.`,
    'Who sees it: the Chef maintainer only.',
    'Kept: 90 days, then deleted; 30 days after the maintainer closes it, if sooner.',
    'Identity: no name or account is attached. Contact goes separately, and only if you gave it.',
    `Size: ${Buffer.byteLength(bytes).toLocaleString('en-US')} bytes, exactly what the numbered lines hold.`,
  ].join('\n');
}
