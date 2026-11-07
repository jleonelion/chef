// "Verify install": Node version, data-root writability and schema, then every bundled
// script's smoke against a throwaway fixture copy. Reads the data root; never writes to it.
import fs from 'node:fs';
import { schemaWriteBlocker } from '../../../../lib/schema.mjs';
import { runSmoke } from '../../../../lib/smoke.mjs';

const MIN_NODE = 20;
const result = (name, problem, okDetail) => ({ name, ok: !problem, detail: problem ?? okDetail });

function nodeCheck(version) {
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  return result('node', major >= MIN_NODE ? null : `Node ${version} is too old; Chef needs Node ${MIN_NODE} or later`, version);
}

function dataRootCheck(root) {
  if (!fs.existsSync(root)) return result('data-root', `no data root at ${root}; run chef-setup init`);
  try {
    fs.accessSync(root, fs.constants.W_OK);
    return result('data-root', null, `${root} is writable`);
  } catch {
    return result('data-root', `${root} is not writable`);
  }
}

const schemaCheck = (root) => result('schema', schemaWriteBlocker(root)?.reason ?? null, 'matches this Chef');

export function verifyInstall(root, { skillsDir, fixture, nodeVersion = process.version }) {
  const smoke = runSmoke({ skillsDir, fixture }).map((r) => result(`smoke:${r.skill}/${r.id}`, r.ok ? null : r.detail, 'passed'));
  const checks = [nodeCheck(nodeVersion), dataRootCheck(root), schemaCheck(root), ...smoke];
  return { status: checks.every((c) => c.ok) ? 'pass' : 'fail', data_root: root, checks };
}
