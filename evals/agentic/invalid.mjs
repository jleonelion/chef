const RATE_LIMIT = /\b(?:rate[ -]?limit(?:ed)?|usage limit|quota|too many requests|429)\b/i;

export function invalid(kind, message) {
  return { kind, message };
}

export function runtimeInvalid(message) {
  const detail = String(message);
  return invalid(RATE_LIMIT.test(detail) ? 'rate_limit' : 'process', detail.slice(0, 500));
}

export function launchInvalid({ timedOut, exitCode, signal, stderr, spawnError }) {
  const detail = stderr.trim();
  if (timedOut) return invalid('timeout', `turn timed out${signal ? ` and ended with signal ${signal}` : ''}`);
  if (spawnError) return invalid('process', `turn process failed: ${spawnError}`);
  if (exitCode !== 0 || signal) {
    const ended = exitCode === null ? `turn ended with signal ${signal}` : `turn exited ${exitCode}`;
    return runtimeInvalid(detail ? `${ended}: ${detail}` : ended);
  }
  return null;
}

export function turnInvalid(launch, trajectoryError) {
  return launchInvalid(launch) ?? trajectoryError;
}

export function harnessInvalid(error) {
  return invalid('harness', error instanceof Error ? error.message : String(error));
}
