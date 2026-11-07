#!/usr/bin/env node

// src/skills/chef-setup/scripts/setup.mjs
import path9 from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// src/lib/data-root.mjs
import os2 from "node:os";
import path2 from "node:path";

// src/runtime/muse.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var LOCALE_VARS = ["LC_ALL", "LC_MEASUREMENT", "LANG"];
var isUsable = (value) => Boolean(value) && value !== "C" && value !== "POSIX" && !value.startsWith("C.");
var AUTHDC = "/opt/hatch/bin/authdc";
var PROVIDERS = {
  "usda-fdc": { connector: "custom.usda-fdc", env: "CHEF_USDA_FDC_KEY", placement: "query_param:api_key" }
};
var runFile = (file, args) => execFileSync(file, args, { encoding: "utf8", timeout: 1e4, stdio: ["ignore", "pipe", "ignore"] });
function placementOf(text) {
  const [kind, name] = text.split(":");
  return { in: kind === "query_param" ? "query" : kind, name };
}
function fromConnector(spec, run) {
  let entry;
  try {
    entry = JSON.parse(run(AUTHDC, ["cred", "surrogate", spec.connector])).credentials?.[0];
  } catch {
    return { ok: false, reason: "not-connected" };
  }
  if (typeof entry?.surrogate !== "string" || !entry.surrogate)
    return { ok: false, reason: "not-connected" };
  if (entry.placement !== spec.placement)
    return { ok: false, reason: "wrong-placement" };
  return { ok: true, value: entry.surrogate, placement: placementOf(spec.placement), source: "connector" };
}
var muse = {
  name: "muse",
  defaultDataRoot: () => path.join(os.homedir(), "workspace", "chef"),
  locale(env = process.env) {
    const fromEnv = LOCALE_VARS.map((name) => env[name]).find(isUsable);
    return fromEnv ?? Intl.DateTimeFormat().resolvedOptions().locale;
  },
  credential(provider, { env = process.env, exists = fs.existsSync, run = runFile } = {}) {
    const spec = PROVIDERS[provider];
    if (!spec)
      throw new Error(`unknown credential provider: ${provider}`);
    if (exists(AUTHDC))
      return fromConnector(spec, run);
    const value = env[spec.env]?.trim();
    return value ? { ok: true, value, placement: placementOf(spec.placement), source: "env" } : { ok: false, reason: "not-connected" };
  }
};

// src/lib/data-root.mjs
function resolveDataRoot({ flag, env = process.env, adapter = muse } = {}) {
  const raw = flag ?? env.CHEF_DATA_ROOT ?? adapter.defaultDataRoot();
  return path2.resolve(raw.replace(/^~(?=$|\/)/, os2.homedir()));
}

// src/lib/fdc.mjs
var BASE = "https://api.nal.usda.gov/fdc/v1";
var DATA_TYPE = "SR Legacy";
var TIMEOUT_MS = 15000;
var NUTRIENTS = { calories: 1008, protein: 1003, fat: 1004, saturated_fat: 1258, carbs: 1005, fiber: 1079, sugar: 2000, sodium: 1093, cholesterol: 1253 };
function per100g(foodNutrients = []) {
  const byId = new Map(foodNutrients.map((n) => [n.nutrientId ?? n.nutrient?.id, n.value ?? n.amount]));
  const values = {};
  for (const [field, id] of Object.entries(NUTRIENTS))
    if (typeof byId.get(id) === "number")
      values[field] = byId.get(id);
  return values;
}
var toFood = (raw) => ({
  fdcId: raw.fdcId,
  description: raw.description,
  dataType: raw.dataType,
  per100g: per100g(raw.foodNutrients),
  portions: (raw.foodPortions ?? []).map(({ amount, modifier, gramWeight }) => ({ amount, modifier, gramWeight }))
});
function failure(status) {
  if (status === 401 || status === 403)
    return "rejected";
  if (status === 429)
    return "rate-limited";
  return "unreachable";
}
var usdaClient = (adapter = muse) => fdcClient({ credential: adapter.credential("usda-fdc") });
function fdcClient({ credential, fetchImpl = fetch }) {
  async function get(pathname, params) {
    if (!credential.ok)
      return { ok: false, reason: credential.reason };
    const url = new URL(`${BASE}${pathname}`);
    for (const [name, value] of Object.entries(params))
      url.searchParams.set(name, value);
    if (credential.placement.in !== "query")
      return { ok: false, reason: "wrong-placement" };
    url.searchParams.set(credential.placement.name, credential.value);
    try {
      const response = await fetchImpl(url.href, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok)
        return { ok: false, reason: failure(response.status) };
      return { ok: true, body: await response.json() };
    } catch {
      return { ok: false, reason: "unreachable" };
    }
  }
  return {
    unavailable: credential.ok ? null : credential.reason,
    async search(query, { pageSize = 25 } = {}) {
      const result = await get("/foods/search", { query, dataType: DATA_TYPE, requireAllWords: "true", pageSize: String(pageSize) });
      return result.ok ? { ok: true, foods: (result.body.foods ?? []).map(toFood) } : result;
    },
    async food(fdcId) {
      const result = await get(`/food/${Number(fdcId)}`, {});
      return result.ok ? { ok: true, food: toFood(result.body) } : result;
    }
  };
}
var STOP = new Set(["and", "or", "with", "without", "in", "of", "from", "the", "a"]);
var NEUTRAL = new Set(["raw", "fresh", "dry", "whole", "plain", "regular", "grated", "shredded", "ground", "enriched", "unenriched", "mature", "seed"]);

// src/lib/schema.mjs
import fs2 from "node:fs";
import path3 from "node:path";
var SCHEMA_VERSION = 1;
var SCHEMA_FILE = "schema-version.json";
function readSchemaVersion(root) {
  const file = path3.join(root, SCHEMA_FILE);
  if (!fs2.existsSync(file))
    return null;
  return JSON.parse(fs2.readFileSync(file, "utf8")).schema_version;
}
function storedVersion(root) {
  try {
    const version = readSchemaVersion(root);
    return version === null || Number.isInteger(version) ? { version } : { problem: `${SCHEMA_FILE} has no integer schema_version` };
  } catch {
    return { problem: `${SCHEMA_FILE} is not valid JSON` };
  }
}
var UPDATE = 'Ask Chef to "update Chef" before changing anything.';
function schemaWriteBlocker(root) {
  const { version, problem } = storedVersion(root);
  if (problem)
    return { reason: `${problem}; Chef won't write to this data root. ${UPDATE}` };
  if (version === null)
    return { reason: "not a Chef data root; run chef-setup init first" };
  if (version === SCHEMA_VERSION)
    return null;
  const which = version > SCHEMA_VERSION ? "a newer" : "an older";
  return {
    reason: `this data root uses ${which} schema (${version}) than this Chef (${SCHEMA_VERSION}). ${UPDATE}`,
    schema_version: version,
    expected_schema_version: SCHEMA_VERSION
  };
}

// src/lib/settings.mjs
import fs3 from "node:fs";
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
  if (!fs3.existsSync(file))
    return { status: "missing", settings: defaults };
  const content = fs3.readFileSync(file, "utf8");
  const stored = parse(content);
  const { status, reason } = classify(stored);
  if (status !== "ok")
    return { status, settings: defaults, warning: warn(reason), content };
  const known = Object.fromEntries(SETTING_KEYS.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]]));
  return { status, settings: { ...defaults, ...known }, stored };
}

// src/skills/chef-setup/scripts/lib/adopt-data-root.mjs
import fs4 from "node:fs";
import path5 from "node:path";

// src/lib/git.mjs
import { execFileSync as execFileSync2 } from "node:child_process";
function git(cwd, args, { env } = {}) {
  const options = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  return execFileSync2("git", args, env ? { ...options, env: { ...process.env, ...env } } : options).trim();
}
var FALLBACK_IDENTITY = ["-c", "user.name=chef", "-c", "user.email=chef@example.com"];
function commit(cwd, message) {
  let configured = "";
  try {
    configured = git(cwd, ["config", "user.email"]);
  } catch {}
  git(cwd, [...configured ? [] : FALLBACK_IDENTITY, "commit", "-q", "-m", message]);
}

// src/skills/chef-setup/scripts/lib/adopt-data-root.mjs
var URL_FORMS = [/^https:\/\/\S+$/, /^ssh:\/\/\S+$/, /^[\w.-]+@[\w.-]+:[^\s:]\S*$/, /^file:\/\/\/\S+$/];
var SAFE_CLONE = ["-c", "core.hooksPath=/dev/null", "-c", "core.symlinks=false", "-c", "protocol.ext.allow=never", "-c", "protocol.fd.allow=never"];
var QUIET = { GIT_TERMINAL_PROMPT: "0" };
function sourceProblem(source) {
  if (typeof source !== "string" || !source.trim())
    return "give the data root to adopt: an https or ssh git URL, or a local folder";
  if (source.startsWith("-"))
    return 'source must not start with "-"';
  if (URL_FORMS.some((form) => form.test(source)))
    return null;
  if (/^[a-z][\w+.-]*::?/i.test(source) && !path5.isAbsolute(source))
    return `unsupported source "${source}": use an https or ssh git URL, or a local folder`;
  return fs4.existsSync(source) && fs4.statSync(source).isDirectory() ? null : `no folder at ${source}`;
}
var cloneSource = (source) => URL_FORMS.some((form) => form.test(source)) ? source : path5.resolve(source);
function targetProblem(root) {
  if (readSchemaVersion(root) !== null)
    return "there is already a Chef data root here; nothing was changed";
  if (fs4.existsSync(root) && fs4.readdirSync(root).length > 0)
    return "directory is not empty and is not a Chef data root";
  return null;
}
function cloneInto(dest, source) {
  try {
    git(path5.dirname(dest), [...SAFE_CLONE, "clone", "-q", "--template=", "--no-recurse-submodules", "--", cloneSource(source), dest], { env: QUIET });
    return null;
  } catch (error) {
    return `clone failed: ${String(error.stderr || error.message).trim().split(`
`).pop()}`;
  }
}
function hasLinks(clone) {
  return git(clone, ["ls-files", "-s"]).split(`
`).some((line) => /^1[26]0000 /.test(line));
}
function cloneProblem(clone) {
  if (hasLinks(clone))
    return { reason: "the source contains symlinks or submodules, which a Chef data root never has" };
  if (readSchemaVersion(clone) === null)
    return { reason: "the source is not a Chef data root (no schema-version.json)" };
  return schemaWriteBlocker(clone);
}
function removeRemotes(root) {
  const remotes = git(root, ["remote"]).split(`
`).filter(Boolean);
  for (const name of remotes)
    git(root, ["remote", "remove", name]);
  return remotes;
}
function adoptDataRoot(root, source) {
  const badSource = sourceProblem(source);
  if (badSource)
    return { status: "invalid-input", data_root: root, problems: [badSource] };
  const badTarget = targetProblem(root);
  if (badTarget)
    return { status: "refused", data_root: root, reason: badTarget };
  fs4.mkdirSync(path5.dirname(root), { recursive: true });
  const staging = fs4.mkdtempSync(path5.join(path5.dirname(root), `.${path5.basename(root)}.adopt-`));
  const clone = path5.join(staging, "data-root");
  try {
    const cloneFailed = cloneInto(clone, source);
    if (cloneFailed)
      return { status: "refused", data_root: root, reason: cloneFailed };
    const blocked = cloneProblem(clone);
    if (blocked)
      return { status: "refused", data_root: root, ...blocked };
    const removed_remotes = removeRemotes(clone);
    if (fs4.existsSync(root))
      fs4.rmdirSync(root);
    fs4.renameSync(clone, root);
    return { status: "adopted", data_root: root, schema_version: readSchemaVersion(root), removed_remotes };
  } finally {
    fs4.rmSync(staging, { recursive: true, force: true });
  }
}

// src/skills/chef-setup/scripts/lib/check-usda.mjs
async function checkUsda(fdc) {
  const result = await fdc.search("apple", { pageSize: 1 });
  if (!result.ok)
    return { status: "not-connected", reason: result.reason };
  return { status: "connected", food: result.foods[0]?.description ?? null };
}

// src/skills/chef-setup/scripts/lib/init-data-root.mjs
import fs5 from "node:fs";
import path6 from "node:path";
var writeJson = (file, value) => fs5.writeFileSync(file, `${JSON.stringify(value)}
`);
function initDataRoot(root) {
  const existing = readSchemaVersion(root);
  if (existing !== null)
    return { status: "exists", data_root: root, schema_version: existing };
  if (fs5.existsSync(root) && fs5.readdirSync(root).length > 0) {
    return { status: "refused", data_root: root, reason: "directory is not empty and is not a Chef data root" };
  }
  fs5.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q", "-b", "main"]);
  fs5.writeFileSync(path6.join(root, ".gitignore"), `${SETTINGS_FILE}
`);
  writeJson(path6.join(root, SCHEMA_FILE), { schema_version: SCHEMA_VERSION });
  writeJson(path6.join(root, SETTINGS_FILE), { settings_version: SETTINGS_VERSION });
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

// src/skills/chef-setup/scripts/lib/verify-install.mjs
import fs7 from "node:fs";

// src/lib/smoke.mjs
import { spawnSync } from "node:child_process";
import fs6 from "node:fs";
import os3 from "node:os";
import path7 from "node:path";
var SMOKE_FILE = "smoke.json";
var isEntry = (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs");
function parseStatus(stdout) {
  try {
    return JSON.parse(stdout).status;
  } catch {
    return;
  }
}
function runCase(skillDir, testCase, fixture) {
  const tmp = fs6.mkdtempSync(path7.join(os3.tmpdir(), "chef-smoke-"));
  const dataRoot = path7.join(tmp, "data-root");
  try {
    fs6.cpSync(fixture, dataRoot, { recursive: true });
    const env = { ...process.env, CHEF_DATA_ROOT: dataRoot, HOME: tmp };
    const run = spawnSync(process.execPath, [path7.join(skillDir, testCase.script), ...testCase.args], { cwd: skillDir, env, encoding: "utf8", timeout: 30000 });
    const status = parseStatus(run.stdout);
    if (run.status !== testCase.expect.exit)
      return `exit ${run.status}, expected ${testCase.expect.exit}: ${(run.stderr || run.stdout).trim().slice(0, 300)}`;
    if (status !== testCase.expect.status)
      return `status "${status}", expected "${testCase.expect.status}"`;
    return null;
  } finally {
    fs6.rmSync(tmp, { recursive: true, force: true });
  }
}
function uncovered(skillDir, cases) {
  const scripts = path7.join(skillDir, "scripts");
  if (!fs6.existsSync(scripts))
    return [];
  const covered = new Set(cases.map((c) => path7.normalize(c.script)));
  return fs6.readdirSync(scripts).filter(isEntry).sort().map((f) => path7.join("scripts", f)).filter((f) => !covered.has(f));
}
function smokeSkill(skillsDir, skill, fixture) {
  const skillDir = path7.join(skillsDir, skill);
  const file = path7.join(skillDir, SMOKE_FILE);
  const cases = fs6.existsSync(file) ? JSON.parse(fs6.readFileSync(file, "utf8")) : [];
  const gaps = uncovered(skillDir, cases).map((script) => ({ skill, id: "coverage", ok: false, detail: `no smoke case for ${script}` }));
  const results = cases.map((testCase) => {
    const problem = runCase(skillDir, testCase, fixture);
    return { skill, id: testCase.id, ok: problem === null, ...problem && { detail: problem } };
  });
  return [...gaps, ...results];
}
function runSmoke({ skillsDir, fixture }) {
  const skills = fs6.readdirSync(skillsDir).filter((name) => fs6.statSync(path7.join(skillsDir, name)).isDirectory()).sort();
  return skills.flatMap((skill) => smokeSkill(skillsDir, skill, fixture));
}

// src/skills/chef-setup/scripts/lib/verify-install.mjs
var MIN_NODE = 20;
var result = (name, problem, okDetail) => ({ name, ok: !problem, detail: problem ?? okDetail });
function nodeCheck(version) {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return result("node", major >= MIN_NODE ? null : `Node ${version} is too old; Chef needs Node ${MIN_NODE} or later`, version);
}
function dataRootCheck(root) {
  if (!fs7.existsSync(root))
    return result("data-root", `no data root at ${root}; run chef-setup init`);
  try {
    fs7.accessSync(root, fs7.constants.W_OK);
    return result("data-root", null, `${root} is writable`);
  } catch {
    return result("data-root", `${root} is not writable`);
  }
}
var schemaCheck = (root) => result("schema", schemaWriteBlocker(root)?.reason ?? null, "matches this Chef");
function verifyInstall(root, { skillsDir, fixture, nodeVersion = process.version }) {
  const smoke = runSmoke({ skillsDir, fixture }).map((r) => result(`smoke:${r.skill}/${r.id}`, r.ok ? null : r.detail, "passed"));
  const checks = [nodeCheck(nodeVersion), dataRootCheck(root), schemaCheck(root), ...smoke];
  return { status: checks.every((c) => c.ok) ? "pass" : "fail", data_root: root, checks };
}

// src/skills/chef-setup/scripts/lib/write-settings.mjs
import fs8 from "node:fs";
import path8 from "node:path";
var IGNORE_LINES = new Set([SETTINGS_FILE, `/${SETTINGS_FILE}`]);
var SIDE_EFFECTS = { household_recipients: "recreate-delivery-tasks" };
function isTracked(root) {
  if (!fs8.existsSync(path8.join(root, ".git")))
    return false;
  try {
    git(root, ["ls-files", "--error-unmatch", SETTINGS_FILE]);
    return true;
  } catch {
    return false;
  }
}
function ensureIgnored(root) {
  const file = path8.join(root, ".gitignore");
  const content = fs8.existsSync(file) ? fs8.readFileSync(file, "utf8") : "";
  if (content.split(/\r?\n/).some((line) => IGNORE_LINES.has(line.trim())))
    return;
  const separator = content === "" || content.endsWith(`
`) ? "" : `
`;
  fs8.writeFileSync(file, `${content}${separator}${SETTINGS_FILE}
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
  const schemaBlocked = schemaWriteBlocker(root);
  if (schemaBlocked)
    return schemaBlocked;
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
  fs8.writeFileSync(path8.join(root, SETTINGS_FILE), `${JSON.stringify(next, null, 2)}
`);
  const saved = readSettings(root, { locale });
  const changed = SETTING_KEYS.filter((key) => JSON.stringify(current.settings[key]) !== JSON.stringify(saved.settings[key]));
  const side_effects = changed.map((key) => SIDE_EFFECTS[key]).filter(Boolean);
  return { status: "saved", data_root: root, settings: saved.settings, changed, side_effects };
}

// src/skills/chef-setup/scripts/setup.mjs
var skillDir = path9.resolve(path9.dirname(fileURLToPath(import.meta.url)), "..");
var { values, positionals } = parseArgs({
  options: { "data-root": { type: "string" }, source: { type: "string" }, rewrite: { type: "boolean" }, ...SETTING_FLAGS },
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
  adopt: (root) => adoptDataRoot(root, values.source),
  settings: show,
  set,
  verify: (root) => verifyInstall(root, { skillsDir: path9.dirname(skillDir), fixture: path9.join(skillDir, "fixture", "data-root") }),
  usda: () => checkUsda(usdaClient())
};
var mode = positionals[0] ?? "init";
if (!Object.hasOwn(MODES, mode)) {
  console.error(`Unknown mode "${mode}". Supported: ${Object.keys(MODES).join(", ")}`);
  process.exit(64);
}
var result2 = await MODES[mode](resolveDataRoot({ flag: values["data-root"] }));
console.log(JSON.stringify(result2));
if (result2.status === "refused" || result2.status === "invalid-input")
  process.exitCode = 2;
if (result2.status === "fail")
  process.exitCode = 1;
