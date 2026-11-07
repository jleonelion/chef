// Fetch a recipe page: http(s) only, public addresses only (checked on every redirect hop),
// HTML only, capped size, time and redirects. Returns { ok: true, html } or
// { ok: false, reason }; never throws for network problems.
import { isPublicHost } from './public-address.mjs';

export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

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

async function follow(start, { publicOnly, signal }) {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (publicOnly && !(await isPublicHost(url.hostname))) return { reason: `${url.hostname} is not a public internet address` };
    const response = await fetch(url, { redirect: 'manual', signal, headers: { accept: 'text/html' } });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return { response };
    await response.body?.cancel();
    url = httpUrl(new URL(location, url).href);
    if (!url) return { reason: 'redirected to an address that is not http or https' };
  }
  return { reason: `more than ${MAX_REDIRECTS} redirects` };
}

// publicOnly is false only in tests that serve pages from 127.0.0.1.
export async function fetchPage(value, { maxBytes = MAX_PAGE_BYTES, timeoutMs = 20000, publicOnly = true } = {}) {
  const url = httpUrl(value);
  if (!url) return { ok: false, reason: 'only http and https addresses can be fetched' };
  try {
    const { response, reason } = await follow(url, { publicOnly, signal: AbortSignal.timeout(timeoutMs) });
    if (!response) return { ok: false, reason };
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    if (!/html/i.test(response.headers.get('content-type') ?? '')) return { ok: false, reason: 'not an HTML page' };
    const html = await readCapped(response, maxBytes);
    return html === null ? { ok: false, reason: `page is larger than ${maxBytes} bytes` } : { ok: true, html };
  } catch (error) {
    return { ok: false, reason: error.name === 'TimeoutError' ? 'timed out' : error.message };
  }
}
