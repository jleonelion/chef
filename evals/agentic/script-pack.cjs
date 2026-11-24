const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function snapshot(root) {
  const content = createHash('sha256');
  const identity = createHash('sha256');
  function visit(relative) {
    const file = path.join(root, relative);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`installed pack contains a symbolic link: ${relative}`);
    const kind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'unsupported';
    if (kind === 'unsupported') throw new Error(`unsupported installed pack entry: ${relative}`);
    content.update(JSON.stringify([relative, kind]));
    identity.update(JSON.stringify([relative, stat.dev, stat.ino, stat.mode, stat.mtimeMs, stat.ctimeMs]));
    if (kind === 'file') content.update(fs.readFileSync(file));
    else for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
  }
  visit('');
  return { content: content.digest('hex'), identity: identity.digest('hex') };
}

module.exports = { snapshot };
