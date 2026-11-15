#!/usr/bin/env node
// Throwaway spike for "Prove script-side feedback intake egress on Muse" (chef#64).
// Never merged. Run inside a Muse VM after creating the custom connector in README.md.
//
// Asks: can a script POST exact approved bytes to an echo host using a connector
// surrogate in a header (the USDA client pattern, but POST + header instead of GET + query)?
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const AUTHDC = '/opt/hatch/bin/authdc';
const CONNECTOR = process.argv[2] ?? 'custom.chef-feedback-spike';
const URL_ = process.argv[3] ?? 'https://httpbin.org/anything/chef-feedback-spike';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// Synthetic approved bytes: shape of a feedback report, no user content.
const approved = JSON.stringify({
  schema_version: 1,
  report_class: 'defect',
  submission_nonce: crypto.randomUUID(),
  summary: 'spike: synthetic report, ignore',
  events: [{ script: 'spike', operation: 'submit', outcome: 'ok' }],
});

function surrogate() {
  const raw = execFileSync(AUTHDC, ['cred', 'surrogate', CONNECTOR], { encoding: 'utf8', timeout: 10000 });
  const entry = JSON.parse(raw).credentials?.[0];
  if (!entry?.surrogate) throw new Error(`no surrogate for ${CONNECTOR}: ${raw}`);
  return entry; // { surrogate, placement }
}

const step = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);

let cred;
try {
  cred = surrogate();
  // Placement is metadata, not a secret: print its shape so we learn the format.
  step('1 authdc issues surrogate', true, `placement=${JSON.stringify(cred.placement)}`);
} catch (error) {
  step('1 authdc issues surrogate', false, error.message);
  process.exit(1);
}
// USDA returns 'query_param:api_key'; a custom header connector returns an object.
function headerOf(placement) {
  if (typeof placement === 'string') {
    const [kind, name] = placement.split(':');
    return kind.endsWith('header') ? name : null;
  }
  const kind = String(placement?.type ?? placement?.kind ?? placement?.in ?? '');
  const name = placement?.name ?? placement?.header ?? placement?.key;
  return kind.includes('header') && typeof name === 'string' ? name : null;
}
const header = headerOf(cred.placement);
step('2 placement is a header', Boolean(header), JSON.stringify(cred.placement));
if (!header) process.exit(1);

let response, echoed;
try {
  response = await fetch(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [header]: cred.surrogate },
    body: approved,
    redirect: 'manual',
  });
  echoed = await response.json();
  step('3 POST with body leaves the VM', response.ok, `HTTP ${response.status}`);
} catch (error) {
  step('3 POST with body leaves the VM', false, error.message);
  process.exit(1);
}

const sent = Object.entries(echoed.headers ?? {}).find(([name]) => name.toLowerCase() === header.toLowerCase())?.[1];
// Never print the received value: if swapped, it is the (dummy) real key.
step('4 egress swapped surrogate for real key', Boolean(sent) && sent !== cred.surrogate,
  sent === cred.surrogate ? 'host saw surrogate' : sent ? 'host saw a different value' : 'header missing');
step('5 body arrived byte-identical', sha256(echoed.data ?? '') === sha256(approved), `sha256=${sha256(approved).slice(0, 12)}`);
console.log('\n6 (manual) Did Muse show an approval prompt for this POST? Note what it displayed.');
