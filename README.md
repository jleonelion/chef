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
- `settings.json` in the data root holds your per-user settings. Git ignores it, so it is
  never committed or pushed.
- Back up the data root folder. Copying it to another machine or runtime moves Chef with it.

## Safety

Chef is not medical advice. (Full safety section lands with the dietary skills.)

## Development

Requires Node 20+ and Bun.

| Command | What it does |
|---|---|
| `bun run build` | Bundle `src/skills/*` into `plugins/chef/skills/*` (commit the result) |
| `bun run check` | Skill-format lint, unit tests, tier1 evals |
| `bun run smoke` | Run tier1 against a copy of the built skills outside the repo |
| `bun run hygiene` | Public-hygiene scan; set `CHEF_HYGIENE_DENY` to the deny-list patterns |

Layout: `src/` is the source, `plugins/chef/` is the built plugin, `fixtures/data-root/` is a
synthetic data root used by tests. CI fails if the built output differs from a fresh build.

Contributions: no real names, addresses or personal emails anywhere. Use `example.com`.

## License

MIT
