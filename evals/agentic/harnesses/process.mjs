export function collectProcess(child, { timeoutMs, ext, killGraceMs = 1000 }) {
  return new Promise((resolve) => {
    let transcript = '';
    let stderr = '';
    let timedOut = false;
    let spawnError = null;
    child.stdout.on('data', (chunk) => (transcript += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => (spawnError = error.message));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    const forceTimer = setTimeout(() => {
      if (timedOut) child.kill('SIGKILL');
    }, timeoutMs + killGraceMs);
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      resolve({ transcript, stderr, timedOut, exitCode, signal, ext, ...(spawnError && { spawnError }) });
    });
  });
}
