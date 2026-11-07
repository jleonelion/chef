// Chef fetches only public internet addresses. IPv4: never loopback, private, link-local
// (cloud metadata), carrier-grade NAT, benchmark, multicast or reserved. IPv6: only global
// unicast (2000::/3), minus 6to4, Teredo and documentation; IPv4-mapped is judged as IPv4.
import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const list = (family, ranges) => {
  const blocks = new BlockList();
  for (const [net, bits] of ranges) blocks.addSubnet(net, bits, family);
  return blocks;
};
const deny4 = list('ipv4', [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]);
const allow6 = list('ipv6', [['2000::', 3]]);
const deny6 = list('ipv6', [['2001::', 32], ['2001:db8::', 32], ['2002::', 16]]);

export function isPublicIp(ip) {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return isPublicIp(mapped);
  if (isIP(ip) === 4) return !deny4.check(ip, 'ipv4');
  if (isIP(ip) === 6) return allow6.check(ip, 'ipv6') && !deny6.check(ip, 'ipv6');
  return false;
}

export const literalIp = (hostname) => {
  const host = hostname.replace(/^\[|\]$/g, '');
  return isIP(host) ? host : null;
};

// A dns.lookup replacement for http(s).request: resolves, then refuses unless every address
// is public. It runs at connect time, so the checked address is the one connected to.
export function publicLookup(hostname, options, callback) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || !addresses.every(({ address }) => isPublicIp(address))) {
      return callback(Object.assign(new Error(`${hostname} is not a public internet address`), { code: 'ENOTPUBLIC' }));
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}
