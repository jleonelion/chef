// Fetch a recipe page: http(s) only, public addresses only (checked when each connection is
// made, so DNS rebinding can't swap in a private one), HTML only, capped size, time and
// redirects. Returns { ok: true, html } or { ok: false, reason }; never throws.
import http from 'node:http';
import https from 'node:https';
import { isPublicIp, literalIp, publicLookup } from './public-address.mjs';

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

class FetchError extends Error {}

function get(url, { publicOnly, signal }) {
  const ip = literalIp(url.hostname);
  if (publicOnly && ip && !isPublicIp(ip)) return Promise.reject(new FetchError(`${url.hostname} is not a public internet address`));
  const client = url.protocol === 'https:' ? https : http;
  const options = { signal, headers: { accept: 'text/html', 'user-agent': 'chef-add-recipe' }, ...(publicOnly ? { lookup: publicLookup } : {}) };
  return new Promise((resolve, reject) => client.get(url, options, resolve).on('error', reject));
}

async function follow(start, options) {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await get(url, options);
    const location = response.headers.location;
    if (response.statusCode < 300 || response.statusCode >= 400 || !location) return response;
    response.resume();
    url = httpUrl(new URL(location, url).href);
    if (!url) throw new FetchError('redirected to an address that is not http or https');
  }
  throw new FetchError(`more than ${MAX_REDIRECTS} redirects`);
}

async function readCapped(response, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > maxBytes) {
      response.destroy();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// publicOnly is false only in tests that serve pages from 127.0.0.1.
export async function fetchPage(value, { maxBytes = MAX_PAGE_BYTES, timeoutMs = 20000, publicOnly = true } = {}) {
  const url = httpUrl(value);
  if (!url) return { ok: false, reason: 'only http and https addresses can be fetched' };
  try {
    const response = await follow(url, { publicOnly, signal: AbortSignal.timeout(timeoutMs) });
    if (response.statusCode >= 400 || response.statusCode < 200) {
      response.resume();
      return { ok: false, reason: `HTTP ${response.statusCode}` };
    }
    if (!/html/i.test(response.headers['content-type'] ?? '')) {
      response.resume();
      return { ok: false, reason: 'not an HTML page' };
    }
    const html = await readCapped(response, maxBytes);
    return html === null ? { ok: false, reason: `page is larger than ${maxBytes} bytes` } : { ok: true, html };
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return { ok: false, reason: 'timed out' };
    return { ok: false, reason: error.message };
  }
}
