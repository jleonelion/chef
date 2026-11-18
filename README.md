# Chef

A free, MIT-licensed kitchen-assistant skill pack: recipes, meal planning, shopping lists and
pantry inventory. Chef keeps everything in one folder you own, the **data root**, as plain
files under local git.

> Status: v1 includes setup, recipes, meal planning and logging, inventory, shopping lists,
> batch-prep PDFs and advisory health goals.

## Install

### Muse Code / Claude Code

```sh
/plugin marketplace add jleonelion/chef
/plugin install chef@chef
```

Or in one step on Claude Code 2.1.275 or later:

```sh
/plugin install chef --marketplace jleonelion/chef
```

Then ask: "Set up Chef."

### Muse app (experimental)

Give Muse's GitHub plugin access to `jleonelion/chef`, then ask Muse: "Install Chef from
jleonelion/chef." Muse copies the skills and runs `chef-setup`.

## Your data

- Data root: `~/workspace/chef` by default. Set `CHEF_DATA_ROOT`, or name a folder during
  setup, to put it elsewhere.
- `settings.json` in the data root holds your per-user settings: units for shopping
  lists, pantry amounts and the inventory page (and, if you opt in, recipe ingredients), the default
  recipients for emailed shopping lists, which senders' receipt emails Chef may read from your
  Gmail, and a calendar.
  All are optional.
  Git ignores the file, so it is never committed or pushed. Change settings by asking Chef
  (`chef-setup`), not by editing the file; a broken file falls back to defaults with a warning.
- Recipes are Markdown pages in `knowledge/wiki/recipes/`, each with an unchanged copy of its source in
  `knowledge/raw/recipes/`. Every change Chef makes is a git commit in the data root. The format is
  documented in `src/references/data-root-schema.md`.
- New recipes get dietary flags (from the ingredient wording) and nutrition from USDA
  FoodData Central. Nutrition needs a free USDA key, which you connect during setup: on Muse
  as a custom connector, elsewhere as the `CHEF_USDA_FDC_KEY` environment variable. The key
  never enters the data root or the chat. Without it, nutrition is marked "not computed";
  Chef never estimates it.
  Optional ingredients, garnishes and unmeasured salt and pepper are left out (and listed as
  left out). A recipe can use another saved recipe, such as `1/2 cup [[basil-pesto]]`, and
  counts its nutrition. The rules are in `src/references/data-root-schema.md` (Nutrition).
  For a bulk re-enrich that hits USDA's rate limit, set `CHEF_FDC_CACHE=1` to keep USDA food
  details in the data root's git-ignored `cache/` folder and reuse them. Off by default.
- When Chef suggests a recipe, your yes or no is kept in `data/recipe-decisions/`, so a recipe
  you turned down is not suggested again. "Always" and "never" rules live there too. Retiring a
  recipe hides it from search without deleting it; you can bring it back.
- Weekly meal plans are saved in `knowledge/wiki/meal-plans/` with a nutrition rollup. Every
  candidate passes the household dietary gate. Chef emits calendar instructions only when the
  `calendar` setting names a calendar; scripts never call a calendar API.
- Health features stay off until you tell Chef a goal (`chef-health-goals`). Then your goal and
  daily targets live in `data/health-goals/`, you can ask for a weekly progress report from your
  meal log, and meal plans add advisory suggestions. Drop the goal and they go quiet again.
- Back up the entire data root, including its local `.git` history, and test that you can restore
  the copy. To move or restore one, ask Chef to adopt the backup; `chef-setup` clones it and drops
  the remote.
- Ask Chef to "verify my Chef install" any time; it never touches your data.

## How updates work

- Your install is a git clone of the Chef repository: on the Muse app, the one clone next to
  `custom-skills/`; on Claude Code and Muse Code, the plugin folder.
- Releases are semver git tags, such as `v1.1.0`.
- The "Chef update notice" task (`check-update`) fetches tags from the clone's `origin` remote
  and compares the newest one with the installed `plugin.json` version. It installs nothing.
  A clone with no `origin` remote is refused, never reported as current.
- Ask Chef to "update Chef" to install the newest release. Chef commits the data root, checks
  out the release tag, makes the installed `chef-` skills match it and shows what changed. Data
  and settings migrations wait for your confirmation; Chef then verifies the install. Updates
  never delete data-root files.

## Feedback and diagnostics

Chef never sends anything on its own. Only a report you approve leaves your machine. Details
are in [docs/feedback-privacy.md](docs/feedback-privacy.md).

- **Local log.** Chef keeps a short technical log on this machine of its own script runs, the
  invocation trace: which script ran, how long it took and how it ended. It never records what
  you ask, recipes, or household, health or dietary details. It holds at most 200 runs, 256 KiB
  and 14 days, in the data root's git-ignored `diagnostics/` folder. It has been on by default
  since v1.2.0; v1.3.0 extends it from recipe search to all 10 skills and tells you about it
  once on each machine. Say "show Chef's log" or "clear Chef's log", or turn it off (which also
  deletes it) with "turn off Chef's log" (`chef-setup set --trace off`).
- **Report a problem.** Say "report a problem with Chef". Chef drafts a report with you, shows
  every line numbered so you can edit or remove any of them, and sends only after you reply
  "send". On Muse it first shows where the report goes, who sees it, how long it is kept and its
  size, and Muse asks you to allow the host on the first send.
- **After an internal error**, Chef offers once to report it: at most once an hour for each
  skill's error, and "no thanks" ends offers for that error. Turn offers off with "stop offering
  to report errors" (`chef-setup set --post-error-offers off`). Offers need the log.
- **Sending from Muse.** Say "connect Chef feedback" (`chef-setup`): a custom connector with
  provider `chef-feedback`, host `chef-feedback-intake.vercel.app`, custom header
  `X-Chef-Intake-Key`. Enter the install key in Muse's secure entry card, never in chat. Without
  the connector, or on a runtime that cannot send such as Claude Code, "send" saves the approved
  report in the data root's `diagnostics/outbox/` and sends nothing.
- **Feedback closed.** If the maintainer closes feedback intake, "send" sends nothing: Chef says
  so, keeps the approved report in `diagnostics/outbox/` and does not retry by itself.
- **Receipts and delete.** A sent report's receipt (id and secret) is saved at 0600 under
  `diagnostics/receipts/` for 90 days, as long as intake can hold the report, and never shown in
  chat. Say "delete a report I sent" to pick one by date, class and id; after one confirmation
  Chef deletes it from feedback intake and removes the receipt.
- **Turn sending off** only in Muse's Settings > Connectors. The stored key outlives the
  connector folder under `custom-connectors/`, and uninstalling Chef does not remove it.

## Safety

- Chef gives general information, not medical advice.
- Chef never suggests a recipe that its ingredient list shows conflicts with a hard constraint you've declared, and leaves out recipes it can't verify. It can't see product labels, brands, or cross-contact, so always check labels.
- Tell Chef about allergies and foods someone must never eat (during setup, or any time). Recipes that conflict, or that Chef hasn't checked, are left out and listed with the reason. You can mark a recipe you checked yourself as safe; that is saved with the date. Setting a constraint aside works for one plan only and is never saved.
- Allergen flags cover the US major food allergens plus gluten. Anything else is matched on ingredient wording only.
- Muse's "Help improve our AI models" setting may cover what you tell Chef; see
  [Muse's privacy policy](https://muse.ai/privacy).

## Development

Requires Node 20+ and Bun.

| Command | What it does |
|---|---|
| `bun run build` | Bundle `src/skills/*` into `plugins/chef/skills/*` (commit the result) |
| `bun run check` | Skill-format lint, unit tests, eval dataset lint, tier1 evals, reproduction-case lint, migration regression |
| `bun run evals:new <tier1\|agentic> <skill> <slug> [--topic <t>]` | Scaffold a lint-clean eval row (see `evals/README.md`) |
| `bun run evals:lint` | Lint `evals/tier1/cases/` and `evals/agentic/rows.json` (JSON Schema in `schemas/evals/`, `<skill>-<scenario>` ids, real skill names; see `evals/README.md`) |
| `bun run repro` | Lint reproduction cases in `evals/repro/` (schema, test links, `known_failure` age, PII scan); see its README |
| `bun run smoke` | Run tier1 against a copy of the built skills outside the repo |
| `bun run hygiene` | Public-hygiene scan; set `CHEF_HYGIENE_DENY` to the deny-list patterns |
| `bun run agentic` | Agentic suite: headless Claude Code with the built plugin, 3 reps per row (local only) |

The agentic suite runs `claude -p` with `plugins/chef` loaded against a fresh copy of the fixture
per rep, so it needs a signed-in Claude Code and spends real usage. It never runs in CI. Each row
in `evals/agentic/rows.json` is one core flow, or a should-not-act check, with deterministic
asserts only (skills fired, reply text, files written or not, script output, git state). A row must pass
every rep; failing rows get fixed or dropped, never retried. The result file
(`evals/agentic/results/agentic-<commit>.json`, with the model id, plugin version and per-row pass
counts) is attached to the release. `--rows <id,id>`, `--known-failures`, `--reps`, `--model` and `--out` narrow a run.

Checks never read a raw transcript. A runtime's projector turns each turn into a Trajectory
(`{response, skills, toolCalls, scriptRuns, error}`, documented in `evals/agentic/trajectory.mjs`;
provisional until a second runtime exists). A transcript with an unparseable line or no `result`
event gets an `error`, so the rep fails instead of reading as an empty reply. A row may add
`scripts: {required, forbidden, max}` (skill-relative paths such as `scripts/meal-logging.mjs`; `max`
caps calls per path), checked over all turns of a rep; the should-not-act rows list their mutating
scripts under `forbidden`. Projector tests use trimmed recordings in `evals/agentic/testdata/`
(re-record steps are in `trajectory.test.mjs`).

Layout: `src/` is the source, `plugins/chef/` is the built plugin, `fixtures/data-root/` is a
synthetic data root used by tests, and `fixtures/schema-v<n>/` are frozen copies per
released schema version (see `fixtures/README.md`). CI fails if the built output differs from a fresh build.

Tests never call USDA. Tier1 runs off Muse with `CHEF_USDA_FDC_KEY` cleared; on a Muse VM with
a USDA connector, the connector takes precedence and tier1 would reach the live API.

The skill-format lint only accepts the 10 v1 skill names (`V1_SKILLS` in
`scripts/lib/skill-format.mjs`) and reports which are still missing. Missing skills become an
error once the plugin version reaches 1.0.0, or with `node scripts/lint-skills.mjs --release`.

Contributions: no real names, addresses or personal emails anywhere. Use `example.com`.

## License

MIT
