# Installation

The [README's Muse instructions](../README.md#install-in-muse) are the complete primary
installation path. Muse app support remains experimental. This guide covers alternative hosts,
Muse installation details and failed setup checks.

## Claude Code

Chef's scripts need Node 20 or later and Git in the workspace where Claude Code runs. Install
the committed plugin output through Claude Code's plugin commands:

```text
/plugin marketplace add jleonelion/chef
/plugin install chef@chef
```

Alternatively, Claude Code 2.1.275 or later can add the marketplace and open the plugin's
installation prompt in one step:

```text
/plugin install chef --marketplace jleonelion/chef
```

Complete Claude Code's installation prompt, then ask: "Set up Chef." Choose a data root or
accept the default, answer or skip the optional onboarding questions, and ask: "Verify my Chef
install." Completion requires setup's `verify` result to report `status: pass` and every check
to have `ok: true`.
See [Claude Code's installation reference](https://code.claude.com/docs/en/plugins/install.md#add-a-marketplace-and-install-in-one-command)
for the host's installer behavior.

The marketplace entry points to `plugins/chef/`. Users do not need Bun or a source build to
run the installed plugin. Optional USDA nutrition uses `CHEF_USDA_FDC_KEY` in your own shell
or runtime settings. Never put the key in chat or the data root.

## Muse Code

With Node 20 or later and Git available in Muse Code's workspace, use its plugin commands:

```text
/plugin marketplace add jleonelion/chef
/plugin install chef@chef
```

Ask: "Set up Chef", then "Verify my Chef install." Use the same completion check as Claude
Code above. Muse Code uses the plugin layout, not the Muse app's copied-skills layout.
For optional USDA nutrition, set `CHEF_USDA_FDC_KEY` in your own shell or runtime settings,
never in chat.

## Muse installation details

The repository is public and can be fetched without GitHub credentials. Chef does not depend
on Muse's GitHub plugin. Anonymous downloading still depends on Muse's network permissions,
and installation needs a writable workspace with Node 20 or later and Git. The README's
prompt asks Muse to check those requirements; it is not a verified live-install procedure.

The marketplace JSON points to `plugins/chef/`; reading that file alone does not install or
register skills in Muse. Muse must load the built skills using its custom-skill mechanism.
Chef's Muse installation layout puts them in `custom-skills/`. Chef's updater expects
underscore-style folder names there, such as `chef_setup`, and exactly one Chef repository
clone next to `custom-skills/`. That clone must contain
`plugins/chef/.claude-plugin/plugin.json` and retain its `origin` remote so Chef can find
release tags. Copying skills alone does not establish a working update path.

These are Chef's checked-in installation expectations, not a separate Muse UI procedure.
If Muse's install cannot meet them, do not treat it as verified. Report the failed check and
runtime through the [help links](../README.md#contribute-or-get-help).

The data root is a different folder from the repository clone and installed skills. Setup
uses the folder you name, then `CHEF_DATA_ROOT`, then `~/workspace/chef`. Here `~` belongs to
the host runtime, not necessarily your computer.

During onboarding, Chef offers optional USDA nutrition and Chef feedback connectors.
Enter keys only in Muse's secure entry card. Gmail, calendar delivery and recurring tasks
also depend on host capabilities and your choices. See
[data and external integrations](usage.md#data-and-external-integrations) before enabling them.

## Troubleshooting

Ask Chef to show the failed verification check's `name` and `detail`.

| Failed check or symptom | What to do |
| --- | --- |
| `node` | Make Node 20 or later available to the runtime. |
| `data-root` | Ask Chef to set up the intended data root, or fix its permissions. Setup refuses a nonempty folder that is not a Chef data root. |
| `schema` or a refusal saying "update Chef" | Update Chef to match the data root. Do not edit `schema-version.json` or retry a blocked write. |
| `smoke:` check | Reinstall Chef's skills, then verify again. These checks use a sample data root. |
| No Chef repository next to Muse's `custom-skills/` | Restore the Chef repository clone there or reinstall. Preserve the separate household data root. |
| Multiple Chef repositories next to `custom-skills/` | Keep one installation clone there. Move extra clones elsewhere after identifying them; do not remove household data. |
| Update check has no `origin` | Restore the Chef repository's `origin` or reinstall. Do not add a remote to the household data root as a repair. |
| Settings warning | Ask Chef to review settings. Replacement of a broken or newer-format settings file needs your confirmation. |

Verification checks the scripts and data-root compatibility. It does not prove that the agent
will follow every instruction, or that optional connectors and host permissions work.
USDA and feedback have separate connection checks offered during setup.

For a move or restore, follow the [backup and restore instructions](usage.md#backup-and-restore)
instead of creating an empty data root over an existing one.
