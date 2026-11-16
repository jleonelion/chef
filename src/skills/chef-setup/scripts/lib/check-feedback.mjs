// Reports whether Chef can send feedback from this runtime. Never sees the intake key.
export function checkFeedback(adapter) {
  if (!adapter.feedback.status) return { status: 'failed', reason: 'unsupported' };
  const result = adapter.feedback.status();
  return result.ok ? { status: 'connected' } : { status: 'failed', reason: result.reason };
}
