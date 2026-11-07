// The update notice's check: is a newer Chef release tag out than the installed one?
// Fetches release tags into the Chef clone only; never checks out, installs or migrates.
import fs from 'node:fs';
import path from 'node:path';
import { muse } from '../../../../runtime/muse.mjs';
import { compareSemver, latestTag, semver } from './update-chef.mjs';

const installedVersion = (repository) =>
  JSON.parse(fs.readFileSync(path.join(repository, 'plugins', 'chef', '.claude-plugin', 'plugin.json'), 'utf8')).version;

export function checkUpdate({ adapter = muse, skillDir } = {}) {
  try {
    const { repository } = adapter.updateInstall({ skillDir });
    const installed = installedVersion(repository);
    const latest = latestTag(repository);
    const newer = compareSemver(semver(latest), semver(`v${installed}`)) > 0;
    return { status: newer ? 'update-available' : 'current', installed, latest };
  } catch (error) {
    return { status: 'refused', reason: error instanceof Error ? error.message : String(error) };
  }
}
