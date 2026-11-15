// Generic runtime adapter: any runtime Chef cannot reliably identify (Claude Code, Muse Code,
// anything else). It reports the runtime as unknown and declares no submit capability, so an
// approved feedback report is saved to the feedback outbox and nothing leaves the machine.
// What submit returns for an adapter that declares no submit capability.
export const unsupported = async () => ({ ok: false, reason: 'unsupported' });

export const generic = {
  name: 'unknown',
  adapterVersion: 1,
  adapterContractVersion: 1,
  feedback: {
    capabilities: () => [],
    submit: unsupported,
  },
};
