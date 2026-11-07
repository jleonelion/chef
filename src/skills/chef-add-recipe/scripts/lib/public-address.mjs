// Chef fetches only public internet addresses: never loopback, private, link-local
// (cloud metadata), carrier-grade NAT, multicast or reserved ranges.
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]]) {
  blocked.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  blocked.addSubnet(net, bits, 'ipv6');
}

// IPv4-mapped IPv6 (::ffff:a.b.c.d) is judged by its IPv4 address. BlockList would also match
// plain IPv4 against a ::ffff:0:0/96 rule, so that range is handled here instead.
export function isPublicIp(ip) {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return isPublicIp(mapped);
  return !blocked.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

// Resolves the URL's host; true only when every address it resolves to is public.
export async function isPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every(({ address }) => isPublicIp(address));
}
