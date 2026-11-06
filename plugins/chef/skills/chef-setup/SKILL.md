---
name: chef-setup
description: Create the Chef data root, the one folder where Chef keeps every recipe, plan, list and inventory record. Use when the user installs Chef, asks to set Chef up, or when another chef- skill reports that no data root exists.
---

# Chef setup

Chef stores all of its state in one folder, the **data root**. This skill creates it.

## Create the data root

Run the bundled script from this skill's directory:

```sh
node scripts/setup.mjs init
```

The script picks the location in this order:

1. `--data-root <path>`, if the user named a folder.
2. The `CHEF_DATA_ROOT` environment variable.
3. `~/workspace/chef`, the default on Muse.

It prints one JSON object. Act on `status`:

- `created`: tell the user the data root now exists at `data_root`. It is a local git repository with a `schema-version.json` file and a `settings.json` file that git ignores.
- `exists`: a data root is already there. Tell the user nothing was changed.
- `refused` (exit code 2): the folder already holds files that are not a Chef data root. Do not delete or move anything. Tell the user, then ask for a different folder and rerun with `--data-root`.

Never edit `settings.json` by hand. Never commit it, and never add a git remote unless the user asks.
