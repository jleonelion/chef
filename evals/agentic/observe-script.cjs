// Eval-only preload. This runs in the interpreter, not against transcript commands.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { snapshot } = require('./script-pack.cjs');

if (process.env.CHEF_EVAL_EXECUTION_DIR && process.argv[1]) {
  const record = {
    entrypoint: path.resolve(process.argv[1]), args: process.argv.slice(2),
    startedAt: process.hrtime.bigint().toString(),
    nested: process.env.CHEF_EVAL_PARENT_SCRIPT === process.env.CHEF_EVAL_SKILLS_DIR,
    syntaxOnly: process.execArgv.some((arg) => arg === '--check' || arg === '-c'),
  };
  try {
    record.realpath = fs.realpathSync(record.entrypoint);
    record.sha256 = createHash('sha256').update(fs.readFileSync(record.realpath)).digest('hex');
    const relative = path.relative(fs.realpathSync(process.env.CHEF_EVAL_SKILLS_DIR), record.realpath);
    if (/^chef-[\w-]+\/scripts\/[\w-]+\.(?:mjs|js|sh|py)$/.test(relative)) {
      record.script = relative.slice(relative.indexOf('/') + 1);
      record.pack = snapshot(process.env.CHEF_EVAL_SKILLS_DIR);
      process.env.CHEF_EVAL_PARENT_SCRIPT = process.env.CHEF_EVAL_SKILLS_DIR;
    }
  } catch (error) {
    record.error = error.message;
  }
  fs.writeFileSync(path.join(process.env.CHEF_EVAL_EXECUTION_DIR, `${randomUUID()}.json`), JSON.stringify(record), { flag: 'wx' });
}
