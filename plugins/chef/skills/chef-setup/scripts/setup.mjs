#!/usr/bin/env node

// src/skills/chef-setup/scripts/setup.mjs
import { parseArgs } from "node:util";

// src/lib/data-root.mjs
import os2 from "node:os";
import path2 from "node:path";

// src/runtime/muse.mjs
import os from "node:os";
import path from "node:path";
var LOCALE_VARS = ["LC_ALL", "LC_MEASUREMENT", "LANG"];
var isUsable = (value) => Boolean(value) && value !== "C" && value !== "POSIX" && !value.startsWith("C.");
var muse = {
  name: "muse",
  defaultDataRoot: () => path.join(os.homedir(), "workspace", "chef"),
  locale(env = process.env) {
    const fromEnv = LOCALE_VARS.map((name) => env[name]).find(isUsable);
    return fromEnv ?? Intl.DateTimeFormat().resolvedOptions().locale;
  }
};

// src/lib/data-root.mjs
function resolveDataRoot({ flag, env = process.env, adapter = muse } = {}) {
  const raw = flag ?? env.CHEF_DATA_ROOT ?? adapter.defaultDataRoot();
  return path2.resolve(raw.replace(/^~(?=$|\/)/, os2.homedir()));
}

// src/lib/schema.mjs
import fs from "node:fs";
import path3 from "node:path";
var SCHEMA_VERSION = 1;
var SCHEMA_FILE = "schema-version.json";
function readSchemaVersion(root) {
  const file = path3.join(root, SCHEMA_FILE);
  if (!fs.existsSync(file))
    return null;
  return JSON.parse(fs.readFileSync(file, "utf8")).schema_version;
}

// src/lib/settings.mjs
import fs2 from "node:fs";
import path4 from "node:path";
var SETTINGS_FILE = "settings.json";
var SETTINGS_VERSION = 1;
var SETTING_KEYS = ["household_recipients", "trusted_receipt_senders", "units", "calendar"];
var IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function unitsForLocale(locale = "") {
  const region = locale.split(/[-_.@]/)[1]?.toUpperCase();
  return IMPERIAL_REGIONS.has(region) ? "us" : "metric";
}
function defaultSettings({ locale = muse.locale() } = {}) {
  return { household_recipients: [], trusted_receipt_senders: [], units: unitsForLocale(locale), calendar: null };
}
function emailListProblem(key, value) {
  if (!Array.isArray(value))
    return `${key}: must be a list of email addresses`;
  const bad = value.find((entry) => typeof entry !== "string" || !EMAIL.test(entry));
  return bad === undefined ? null : `${key}: ${JSON.stringify(bad)} is not an email address`;
}
var CHECKS = {
  household_recipients: (value) => emailListProblem("household_recipients", value),
  trusted_receipt_senders: (value) => emailListProblem("trusted_receipt_senders", value),
  units: (value) => value === "us" || value === "metric" ? null : 'units: must be "us" or "metric"',
  calendar: (value) => value === null || typeof value === "string" && value.trim() ? null : "calendar: must be a calendar name or null"
};
function validateSettings(values) {
  return SETTING_KEYS.filter((key) => Object.hasOwn(values, key)).map((key) => CHECKS[key](values[key])).filter(Boolean);
}
var warn = (reason) => `settings.json can't be used (${reason}), so Chef is using default settings. Run chef-setup to fix it.`;
function parse(content) {
  try {
    const value = JSON.parse(content);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
function classify(stored) {
  if (!stored)
    return { status: "invalid", reason: "not a JSON object" };
  const version = stored.settings_version;
  if (Number.isInteger(version) && version > SETTINGS_VERSION) {
    return { status: "unknown-version", reason: `written by a newer Chef: version ${version}` };
  }
  if (version !== SETTINGS_VERSION)
    return { status: "invalid", reason: "missing or bad settings_version" };
  const problems = validateSettings(stored);
  return problems.length ? { status: "invalid", reason: problems.join("; ") } : { status: "ok" };
}
function readSettings(root, { locale } = {}) {
  const defaults = defaultSettings({ locale });
  const file = path4.join(root, SETTINGS_FILE);
  if (!fs2.existsSync(file))
    return { status: "missing", settings: defaults };
  const content = fs2.readFileSync(file, "utf8");
  const stored = parse(content);
  const { status, reason } = classify(stored);
  if (status !== "ok")
    return { status, settings: defaults, warning: warn(reason), content };
  const known = Object.fromEntries(SETTING_KEYS.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]]));
  return { status, settings: { ...defaults, ...known }, stored };
}

// src/skills/chef-setup/scripts/lib/init-data-root.mjs
import fs3 from "node:fs";
import path5 from "node:path";

// src/lib/git.mjs
import { execFileSync } from "node:child_process";
function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
var FALLBACK_IDENTITY = ["-c", "user.name=chef", "-c", "user.email=chef@example.com"];
function commit(cwd, message) {
  let configured = "";
  try {
    configured = git(cwd, ["config", "user.email"]);
  } catch {}
  git(cwd, [...configured ? [] : FALLBACK_IDENTITY, "commit", "-q", "-m", message]);
}

// src/skills/chef-setup/scripts/lib/init-data-root.mjs
var writeJson = (file, value) => fs3.writeFileSync(file, `${JSON.stringify(value)}
`);
function initDataRoot(root) {
  const existing = readSchemaVersion(root);
  if (existing !== null)
    return { status: "exists", data_root: root, schema_version: existing };
  if (fs3.existsSync(root) && fs3.readdirSync(root).length > 0) {
    return { status: "refused", data_root: root, reason: "directory is not empty and is not a Chef data root" };
  }
  fs3.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q", "-b", "main"]);
  fs3.writeFileSync(path5.join(root, ".gitignore"), `${SETTINGS_FILE}
`);
  writeJson(path5.join(root, SCHEMA_FILE), { schema_version: SCHEMA_VERSION });
  writeJson(path5.join(root, SETTINGS_FILE), { settings_version: SETTINGS_VERSION });
  git(root, ["add", ".gitignore", SCHEMA_FILE]);
  commit(root, "chef-setup: create data root");
  return { status: "created", data_root: root, schema_version: SCHEMA_VERSION };
}

// src/skills/chef-setup/scripts/lib/settings-args.mjs
var splitList = (raw) => raw.split(",").map((entry) => entry.trim()).filter(Boolean);
var orReset = (value, isReset) => isReset ? null : value;
var FLAGS = {
  units: ["units", (raw) => orReset(raw, raw === "default")],
  "household-recipients": ["household_recipients", (raw) => orReset(splitList(raw), splitList(raw).length === 0)],
  "trusted-receipt-senders": ["trusted_receipt_senders", (raw) => orReset(splitList(raw), splitList(raw).length === 0)],
  calendar: ["calendar", (raw) => orReset(raw.trim(), raw.trim() === "" || raw.trim() === "none")]
};
var SETTING_FLAGS = Object.fromEntries(Object.keys(FLAGS).map((flag) => [flag, { type: "string" }]));
function changesFromFlags(values) {
  const entries = Object.entries(FLAGS).filter(([flag]) => values[flag] !== undefined);
  return Object.fromEntries(entries.map(([flag, [key, convert]]) => [key, convert(values[flag])]));
}

// src/skills/chef-setup/scripts/lib/write-settings.mjs
import fs4 from "node:fs";
import path6 from "node:path";
var IGNORE_LINES = new Set([SETTINGS_FILE, `/${SETTINGS_FILE}`]);
var SIDE_EFFECTS = { household_recipients: "recreate-delivery-tasks" };
function isTracked(root) {
  if (!fs4.existsSync(path6.join(root, ".git")))
    return false;
  try {
    git(root, ["ls-files", "--error-unmatch", SETTINGS_FILE]);
    return true;
  } catch {
    return false;
  }
}
function ensureIgnored(root) {
  const file = path6.join(root, ".gitignore");
  const content = fs4.existsSync(file) ? fs4.readFileSync(file, "utf8") : "";
  if (content.split(/\r?\n/).some((line) => IGNORE_LINES.has(line.trim())))
    return;
  const separator = content === "" || content.endsWith(`
`) ? "" : `
`;
  fs4.writeFileSync(file, `${content}${separator}${SETTINGS_FILE}
`);
}
function applyChanges(stored, changes) {
  const next = { ...stored, settings_version: SETTINGS_VERSION };
  for (const key of SETTING_KEYS.filter((k) => Object.hasOwn(changes, k))) {
    const value = changes[key];
    if (value === null)
      delete next[key];
    else
      next[key] = Array.isArray(value) ? [...new Set(value)] : value;
  }
  return next;
}
var definedChanges = (changes) => Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== null));
function blocker(root, current, rewrite) {
  if (readSchemaVersion(root) === null)
    return { reason: "not a Chef data root; run chef-setup init first" };
  if (current.status !== "ok" && current.status !== "missing" && !rewrite) {
    return { reason: current.warning, content: current.content };
  }
  if (isTracked(root))
    return { reason: `${SETTINGS_FILE} is tracked by data-root git; untrack it before saving settings` };
  return null;
}
function writeSettings(root, changes, { locale, rewrite = false } = {}) {
  const problems = validateSettings(definedChanges(changes));
  if (problems.length)
    return { status: "invalid-input", data_root: root, problems };
  const current = readSettings(root, { locale });
  const blocked = blocker(root, current, rewrite);
  if (blocked)
    return { status: "refused", data_root: root, ...blocked };
  ensureIgnored(root);
  const next = applyChanges(current.stored ?? {}, changes);
  fs4.writeFileSync(path6.join(root, SETTINGS_FILE), `${JSON.stringify(next, null, 2)}
`);
  const saved = readSettings(root, { locale });
  const changed = SETTING_KEYS.filter((key) => JSON.stringify(current.settings[key]) !== JSON.stringify(saved.settings[key]));
  const side_effects = changed.map((key) => SIDE_EFFECTS[key]).filter(Boolean);
  return { status: "saved", data_root: root, settings: saved.settings, changed, side_effects };
}

// src/skills/chef-setup/scripts/setup.mjs
var { values, positionals } = parseArgs({
  options: { "data-root": { type: "string" }, rewrite: { type: "boolean" }, ...SETTING_FLAGS },
  allowPositionals: true
});
function set(root) {
  const changes = changesFromFlags(values);
  if (Object.keys(changes).length === 0)
    return { status: "invalid-input", data_root: root, problems: ["no settings given"] };
  return writeSettings(root, changes, { rewrite: values.rewrite ?? false });
}
function show(root) {
  if (readSchemaVersion(root) === null)
    return { status: "refused", data_root: root, reason: "not a Chef data root; run chef-setup init first" };
  return { data_root: root, ...readSettings(root) };
}
var MODES = {
  init: (root) => initDataRoot(root),
  settings: show,
  set
};
var mode = positionals[0] ?? "init";
if (!Object.hasOwn(MODES, mode)) {
  console.error(`Unknown mode "${mode}". Supported: ${Object.keys(MODES).join(", ")}`);
  process.exit(64);
}
var result = MODES[mode](resolveDataRoot({ flag: values["data-root"] }));
console.log(JSON.stringify(result));
if (result.status === "refused" || result.status === "invalid-input")
  process.exitCode = 2;
