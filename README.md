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
- `settings.json` in the data root holds your per-user settings: units, who gets shopping
  lists and prep plans, which senders' receipts Chef accepts, and a calendar. All are optional.
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
- Ask Chef to "update Chef" to install the newest tagged release. Chef commits the data root,
  previews skill and migration changes, waits for confirmation before migrating, and verifies
  the install afterward. Updates never delete data-root files.

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
| `bun run check` | Skill-format lint, unit tests, tier1 evals, migration regression |
| `bun run smoke` | Run tier1 against a copy of the built skills outside the repo |
| `bun run hygiene` | Public-hygiene scan; set `CHEF_HYGIENE_DENY` to the deny-list patterns |
| `bun run agentic` | Agentic suite: headless Claude Code with the built plugin, 3 reps per row (local only) |

The agentic suite runs `claude -p` with `plugins/chef` loaded against a fresh copy of the fixture
per rep, so it needs a signed-in Claude Code and spends real usage. It never runs in CI. Each row
in `evals/agentic/rows.json` is one core flow, or a should-not-act check, with deterministic
asserts only (skills fired, files written or not, script output, git state). A row must pass
every rep; failing rows get fixed or dropped, never retried. The result file
(`evals/agentic/results/agentic-<commit>.json`, with the model id, plugin version and per-row pass
counts) is attached to the release. `--rows <id,id>`, `--reps`, `--model` and `--out` narrow a run.

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
