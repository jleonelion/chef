import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { fetchPage } from './fetch-page.mjs';

let server;
let base;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/recipe') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<html>ok</html>');
    if (req.url === '/big') return res.writeHead(200, { 'content-type': 'text/html' }).end('x'.repeat(2048));
    if (req.url === '/pdf') return res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF');
    return res.writeHead(404).end('missing');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('returns the HTML of a page', async () => {
  assert.deepEqual(await fetchPage(`${base}/recipe`), { ok: true, html: '<html>ok</html>' });
});

test('fails on HTTP errors, non-HTML and oversized pages', async () => {
  assert.match((await fetchPage(`${base}/nope`)).reason, /HTTP 404/);
  assert.match((await fetchPage(`${base}/pdf`)).reason, /not an HTML page/);
  assert.match((await fetchPage(`${base}/big`, { maxBytes: 1024 })).reason, /larger than/);
});

test('refuses non-http addresses without fetching', async () => {
  assert.match((await fetchPage('file:///etc/hosts')).reason, /http/);
  assert.match((await fetchPage('not a url')).reason, /http/);
});
