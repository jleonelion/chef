import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicIp, publicLookup } from './public-address.mjs';

test('blocks non-public IPv4 and IPv6, including translation prefixes', () => {
  const blocked = ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2001:0:4136::1', '2001:db8::1', 'not-an-ip'];
  for (const ip of blocked) assert.equal(isPublicIp(ip), false, ip);
});

test('allows public addresses', () => {
  for (const ip of ['93.184.215.14', '8.8.8.8', '::ffff:8.8.8.8', '2606:4700::1111']) assert.equal(isPublicIp(ip), true, ip);
});

test('publicLookup refuses names that resolve to private addresses', async () => {
  const error = await new Promise((resolve) => publicLookup('localhost', {}, resolve));
  assert.equal(error.code, 'ENOTPUBLIC');
});
