import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicHost, isPublicIp } from './public-address.mjs';

test('blocks loopback, private, link-local and mapped addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) {
    assert.equal(isPublicIp(ip), false, ip);
  }
});

test('allows public addresses', () => {
  for (const ip of ['93.184.215.14', '8.8.8.8', '2606:4700::1111']) assert.equal(isPublicIp(ip), true, ip);
});

test('checks literal hosts, including bracketed IPv6', async () => {
  assert.equal(await isPublicHost('127.0.0.1'), false);
  assert.equal(await isPublicHost('[::1]'), false);
  assert.equal(await isPublicHost('localhost'), false);
});
