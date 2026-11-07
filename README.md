# Chef

A free, MIT-licensed kitchen-assistant skill pack: recipes, meal planning, shopping lists and
pantry inventory. Chef keeps everything in one folder you own, the **data root**, as plain
files under local git.

> Status: early. Only `chef-setup` ships so far; more skills land before v1.

## Install

### Claude Code or Muse Code

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
- Back up the data root folder. Copying it to another machine or runtime moves Chef with it.

## Safety

Chef is not medical advice. (Full safety section lands with the dietary skills.)

## Development

Requires Node 20+ and Bun.

| Command | What it does |
|---|---|
| `bun run build` | Bundle `src/skills/*` into `plugins/chef/skills/*` (commit the result) |
| `bun run check` | Skill-format lint, unit tests, tier1 evals, migration regression |
| `bun run smoke` | Run tier1 against a copy of the built skills outside the repo |
| `bun run hygiene` | Public-hygiene scan; set `CHEF_HYGIENE_DENY` to the deny-list patterns |

Layout: `src/` is the source, `plugins/chef/` is the built plugin, `fixtures/data-root/` is a
synthetic data root used by tests, and `fixtures/schema-v<n>/` are frozen copies per
released schema version (see `fixtures/README.md`). CI fails if the built output differs from a fresh build.

The skill-format lint only accepts the 10 v1 skill names (`V1_SKILLS` in
`scripts/lib/skill-format.mjs`) and reports which are still missing. Missing skills become an
error once the plugin version reaches 1.0.0, or with `node scripts/lint-skills.mjs --release`.

Contributions: no real names, addresses or personal emails anywhere. Use `example.com`.

## License

MIT
