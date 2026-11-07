// Fetch a recipe page: http(s) only, HTML only, capped size and time. Returns
// { ok: true, html } or { ok: false, reason }; never throws for network problems.
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;

export function httpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

async function readCapped(response, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchPage(value, { maxBytes = MAX_PAGE_BYTES, timeoutMs = 20000 } = {}) {
  const url = httpUrl(value);
  if (!url) return { ok: false, reason: 'only http and https addresses can be fetched' };
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'text/html' } });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    if (!/html/i.test(response.headers.get('content-type') ?? '')) return { ok: false, reason: 'not an HTML page' };
    const html = await readCapped(response, maxBytes);
    return html === null ? { ok: false, reason: `page is larger than ${maxBytes} bytes` } : { ok: true, html };
  } catch (error) {
    return { ok: false, reason: error.name === 'TimeoutError' ? 'timed out' : error.message };
  }
}
