import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN = /(?:^|\/)(?:archive|logs|results)(?:\/|$)/;

export function assertNoEvaluationEvidence(pluginRoot) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(pluginRoot, absolute).split(path.sep).join('/'));
    }
  };
  visit(pluginRoot);
  assert.equal(files.find((file) => FORBIDDEN.test(file)), undefined, 'plugin package contains an evaluation archive, result, or log path');
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    const content = fs.readFileSync(path.join(pluginRoot, file), 'utf8');
    assert(!content.includes('"suite": "chef-agentic"'), `plugin package contains an agentic result: ${file}`);
  }
}
