// Optional cache of USDA food-detail replies, for bulk re-enrich runs that would otherwise hit
// the FDC rate limit. Off unless CHEF_FDC_CACHE=1. One raw reply per food at
// <data root>/cache/fdc/food/<fdcId>.json, kept out of git. SR Legacy foods do not change, so
// entries never expire; delete the cache folder to refresh them. Never holds the key.
import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = 'cache';

export function fdcReplyCache(root) {
  const cacheRoot = path.join(root, CACHE_DIR);
  const file = (fdcId) => path.join(cacheRoot, 'fdc', 'food', `${fdcId}.json`);
  return {
    // The stored reply, or null when absent, unreadable or for another food.
    read(fdcId) {
      try {
        const body = JSON.parse(fs.readFileSync(file(fdcId), 'utf8'));
        return body?.fdcId === fdcId ? body : null;
      } catch {
        return null;
      }
    },
    // Best effort: a cache that cannot be written is just a cache miss next time.
    write(fdcId, body) {
      try {
        fs.mkdirSync(path.dirname(file(fdcId)), { recursive: true });
        const ignore = path.join(cacheRoot, '.gitignore');
        if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
        const temp = `${file(fdcId)}.${process.pid}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(body));
        fs.renameSync(temp, file(fdcId));
      } catch {
        // ignored on purpose
      }
    },
  };
}

export const cacheFor = (root, env = process.env) => (root && env.CHEF_FDC_CACHE === '1' ? fdcReplyCache(root) : null);
