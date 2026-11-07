// "Adopt existing data root": clone a data root (a backup, or the import tool's hand-off
// repo) into the data-root folder, then drop its remotes so the data root stays local-only.
// The source is untrusted: no shell, no hooks, no submodules, no exotic transports, and no
// symlinks or gitlinks in its tree, so no later write can follow a link out of the data root.
import fs from 'node:fs';
import path from 'node:path';
import { git } from '../../../../lib/git.mjs';
import { readSchemaVersion, schemaWriteBlocker } from '../../../../lib/schema.mjs';

const URL_FORMS = [/^https:\/\/\S+$/, /^ssh:\/\/\S+$/, /^[\w.-]+@[\w.-]+:[^\s:]\S*$/, /^file:\/\/\/\S+$/];
const SAFE_CLONE = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.symlinks=false', '-c', 'protocol.ext.allow=never', '-c', 'protocol.fd.allow=never'];
const QUIET = { GIT_TERMINAL_PROMPT: '0' };

export function sourceProblem(source) {
  if (typeof source !== 'string' || !source.trim()) return 'give the data root to adopt: an https or ssh git URL, or a local folder';
  if (source.startsWith('-')) return 'source must not start with "-"';
  if (URL_FORMS.some((form) => form.test(source))) return null;
  if (/^[a-z][\w+.-]*::?/i.test(source) && !path.isAbsolute(source)) return `unsupported source "${source}": use an https or ssh git URL, or a local folder`;
  return fs.existsSync(source) && fs.statSync(source).isDirectory() ? null : `no folder at ${source}`;
}

// Local folders are passed as absolute paths so git never reads "a:b" as an ssh host.
const cloneSource = (source) => (URL_FORMS.some((form) => form.test(source)) ? source : path.resolve(source));

function targetProblem(root) {
  if (readSchemaVersion(root) !== null) return 'there is already a Chef data root here; nothing was changed';
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) return 'directory is not empty and is not a Chef data root';
  return null;
}

function cloneInto(dest, source) {
  try {
    git(path.dirname(dest), [...SAFE_CLONE, 'clone', '-q', '--template=', '--no-recurse-submodules', '--', cloneSource(source), dest], { env: QUIET });
    return null;
  } catch (error) {
    return `clone failed: ${String(error.stderr || error.message).trim().split('\n').pop()}`;
  }
}

// Mode 120000 is a symlink, 160000 a submodule gitlink. A data root holds neither.
function hasLinks(clone) {
  return git(clone, ['ls-files', '-s']).split('\n').some((line) => /^1[26]0000 /.test(line));
}

function cloneProblem(clone) {
  if (hasLinks(clone)) return { reason: 'the source contains symlinks or submodules, which a Chef data root never has' };
  if (readSchemaVersion(clone) === null) return { reason: 'the source is not a Chef data root (no schema-version.json)' };
  return schemaWriteBlocker(clone);
}

function removeRemotes(root) {
  const remotes = git(root, ['remote']).split('\n').filter(Boolean);
  for (const name of remotes) git(root, ['remote', 'remove', name]);
  return remotes;
}

export function adoptDataRoot(root, source) {
  const badSource = sourceProblem(source);
  if (badSource) return { status: 'invalid-input', data_root: root, problems: [badSource] };
  const badTarget = targetProblem(root);
  if (badTarget) return { status: 'refused', data_root: root, reason: badTarget };

  fs.mkdirSync(path.dirname(root), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(root), `.${path.basename(root)}.adopt-`));
  const clone = path.join(staging, 'data-root');
  try {
    const cloneFailed = cloneInto(clone, source);
    if (cloneFailed) return { status: 'refused', data_root: root, reason: cloneFailed };
    const blocked = cloneProblem(clone);
    if (blocked) return { status: 'refused', data_root: root, ...blocked };
    const removed_remotes = removeRemotes(clone);
    if (fs.existsSync(root)) fs.rmdirSync(root);
    fs.renameSync(clone, root);
    return { status: 'adopted', data_root: root, schema_version: readSchemaVersion(root), removed_remotes };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
