#!/usr/bin/env node

// src/skills/chef-setup/scripts/setup.mjs
import { parseArgs } from "node:util";

// src/lib/data-root.mjs
import os from "node:os";
import path from "node:path";
var DEFAULT_DATA_ROOT = path.join(os.homedir(), "workspace", "chef");
function resolveDataRoot({ flag, env = process.env } = {}) {
  const raw = flag ?? env.CHEF_DATA_ROOT ?? DEFAULT_DATA_ROOT;
  return path.resolve(raw.replace(/^~(?=$|\/)/, os.homedir()));
}

// src/skills/chef-setup/scripts/lib/init-data-root.mjs
import { execFileSync } from "node:child_process";
import fs2 from "node:fs";
import path3 from "node:path";

// src/lib/schema.mjs
import fs from "node:fs";
import path2 from "node:path";
var SCHEMA_VERSION = 1;
var SCHEMA_FILE = "schema-version.json";
function readSchemaVersion(root) {
  const file = path2.join(root, SCHEMA_FILE);
  if (!fs.existsSync(file))
    return null;
  return JSON.parse(fs.readFileSync(file, "utf8")).schema_version;
}

// src/lib/settings.mjs
var SETTINGS_FILE = "settings.json";
var SETTINGS_VERSION = 1;

// src/skills/chef-setup/scripts/lib/init-data-root.mjs
var FALLBACK_IDENTITY = ["-c", "user.name=chef-setup", "-c", "user.email=chef-setup@example.com"];
function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function identityArgs(cwd) {
  try {
    return git(cwd, ["config", "user.email"]) ? [] : FALLBACK_IDENTITY;
  } catch {
    return FALLBACK_IDENTITY;
  }
}
var writeJson = (file, value) => fs2.writeFileSync(file, `${JSON.stringify(value)}
`);
function initDataRoot(root) {
  const existing = readSchemaVersion(root);
  if (existing !== null)
    return { status: "exists", data_root: root, schema_version: existing };
  if (fs2.existsSync(root) && fs2.readdirSync(root).length > 0) {
    return { status: "refused", data_root: root, reason: "directory is not empty and is not a Chef data root" };
  }
  fs2.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q", "-b", "main"]);
  fs2.writeFileSync(path3.join(root, ".gitignore"), `${SETTINGS_FILE}
`);
  writeJson(path3.join(root, SCHEMA_FILE), { schema_version: SCHEMA_VERSION });
  writeJson(path3.join(root, SETTINGS_FILE), { settings_version: SETTINGS_VERSION });
  git(root, ["add", ".gitignore", SCHEMA_FILE]);
  git(root, [...identityArgs(root), "commit", "-q", "-m", "chef-setup: create data root"]);
  return { status: "created", data_root: root, schema_version: SCHEMA_VERSION };
}

// src/skills/chef-setup/scripts/setup.mjs
var { values, positionals } = parseArgs({
  options: { "data-root": { type: "string" } },
  allowPositionals: true
});
var mode = positionals[0] ?? "init";
if (mode !== "init") {
  console.error(`Unknown mode "${mode}". Supported: init`);
  process.exit(64);
}
var result = initDataRoot(resolveDataRoot({ flag: values["data-root"] }));
console.log(JSON.stringify(result));
if (result.status === "refused")
  process.exitCode = 2;
