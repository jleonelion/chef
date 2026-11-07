// Read a source file the user gave Chef (pasted text saved to a file, a photo, a saved page).
// Only recipe-like file types, at most 20 MB, so nothing else is copied into the data root.
import fs from 'node:fs';
import path from 'node:path';

export const SOURCE_TYPES = {
  text: ['.txt', '.md'],
  photo: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif'],
  url: ['.html', '.htm'],
};
const MAX_BYTES = 20 * 1024 * 1024;

export function readSource(file, kind) {
  const ext = path.extname(file ?? '').toLowerCase();
  if (!SOURCE_TYPES[kind]?.includes(ext)) return { problem: `--source for kind ${kind} must be one of ${SOURCE_TYPES[kind]?.join(' ') ?? '(none)'}` };
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { problem: `--source ${file} is not a file` };
  if (fs.statSync(file).size > MAX_BYTES) return { problem: `--source ${file} is larger than 20 MB` };
  return { source: { ext: ext === '.htm' ? '.html' : ext, content: fs.readFileSync(file) } };
}
