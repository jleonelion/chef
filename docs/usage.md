# Using Chef

For installation, start with the [Muse steps](../README.md#install-in-muse) or the
[alternative hosts and troubleshooting](installation.md). The README also has a
[first-use workflow](../README.md#try-it).

## Data management

The **data root** holds your household's Chef records, separately from the installed skills.
The location you name during setup takes precedence over `CHEF_DATA_ROOT`, then the default
`~/workspace/chef`. Paths refer to the host runtime's workspace.

- Recipes are Markdown pages under `knowledge/wiki/recipes/`, with an unchanged source copy
  under `knowledge/raw/recipes/`. Chef commits recipe changes in the data root's Git history.
- Recipe suggestions you accept or reject are recorded under `data/recipe-decisions/`,
  including "always" and "never" rules. Rejected recipes are not suggested again. Retiring a
  recipe hides it from search without deleting it; ask Chef to restore it when needed.
- Meal plans live under `knowledge/wiki/meal-plans/`. Each contains planned meals and a
  nutrition rollup. Only meals you confirm are saved. Shopping lists subtract food inventory
  from the saved plan's recipe ingredients.
- Ask for a batch-prep plan from a saved meal plan to get a printable PDF. Muse delivers it as
  a downloadable chat attachment; other runtimes report the file path.
- Health goals stay off until you declare one. Goals and daily targets live under
  `data/health-goals/`; meal plans then add advisory suggestions, and you can ask for a
  weekly progress report from your meal log. Drop the goal to stop that advice.

Ask Chef to make changes rather than editing household files by hand. The
[data schema reference](../src/references/data-root-schema.md) documents the stored formats.

### Settings

`settings.json` holds optional preferences such as the unit system, recipe-unit conversion,
household recipients, trusted receipt senders and calendar. Chef keeps it Git-ignored, so
normal data-root commits and clones do not include it.

Ask Chef to change settings. A broken file falls back to defaults with a warning; replacing
it needs your confirmation and discards its old values. Never edit `settings.json` or
`schema-version.json` by hand, and never store API keys in the data root.

Changing the unit system affects displayed shopping lists and pantry amounts, and recipe
ingredients only if you opt in to conversion. Stored recipes and inventory keep their original
units. If you change household recipients, Chef asks the runtime to re-create existing delivery
tasks so you can approve the new recipients.

## Data and external integrations

Workspace storage does not mean data stays on your own computer. Your agent host runs the
skills and may process your prompts and household data under its own policies. On Muse,
the "Help improve our AI models" setting may cover what you tell Chef; see
[Muse's privacy policy](https://muse.ai/privacy).

Chef's data-root Git history has no remote after creation or adoption. Chef does not add one
unless you ask. That is separate from network access by the runtime and optional integrations:

- Importing a recipe from a URL fetches the source page.
- USDA FoodData Central provides recipe nutrition when connected with a free key.
  Ask Chef to connect nutrition during setup. On Muse, enter the key in a custom connector's
  secure entry card; on Claude Code or Muse Code, set `CHEF_USDA_FDC_KEY` yourself in the shell
  or runtime settings. The key stays out of the data root and chat.
  Without it, Chef marks nutrition "not computed" and never estimates it.
- Receipt intake uses your own Gmail through the runtime, only for the trusted receipt
  senders you choose. Ask Chef to enable it; declining leaves receipt intake off.
- Shopping lists appear in chat by default. With household recipients configured, the runtime
  can email them through Gmail. Chef's shopping-list script sends no email itself. A one-off
  recipient change needs confirmation in the current conversation and is not saved.
- Calendar instructions appear only when the `calendar` setting names a calendar. The runtime
  handles delivery; Chef's scripts never call a calendar API.
- Recurring tasks belong to the runtime. Chef proposes them individually and creates only the
  ones you explicitly approve. The update notice is opt-in. Ask Chef to change or stop a task
  through the runtime; Chef keeps no task record.
- Chef feedback uses a separate connector and sends only a report you preview and explicitly
  approve. See [feedback and privacy](feedback-privacy.md) for diagnostics, retention,
  connector setup and deletion. This consent rule is not a privacy promise about other
  integrations or the host.

Nutrition omits optional ingredients, unmeasured garnishes, unmeasured salt and pepper and trace
amounts, and lists those omissions. Missing matches or weights make nutrition incomplete,
without estimated numbers. A saved recipe can refer to another saved recipe and count its
nutrition; see the [nutrition format and rules](../src/references/data-root-schema.md#nutrition).
For bulk re-enrichment that hits USDA's rate limit, `CHEF_FDC_CACHE=1` enables reuse of food
details in the data root's Git-ignored `cache/` folder. It is off by default.

## Backup and restore

Back up the entire data root, including its hidden `.git` history, and test that you can restore
the copy. Protect the backup as household data. A full file copy includes Git-ignored settings,
diagnostics and any nutrition cache; a Git clone does not include those files.

To move or restore:

1. Keep the original and backup intact. Choose a new or empty destination.
2. Ask Chef to adopt the backup, naming its folder or Git URL and the intended data-root path.
   Setup clones its committed history, checks the schema and removes the clone's remotes.
   It refuses to overwrite an existing data root or unrelated nonempty folder.
3. Review onboarding and re-enter settings. Adoption does not restore `settings.json`,
   diagnostics or other Git-ignored files from a file backup. Keep the full backup if you
   need those records, including feedback receipts used to delete sent reports.
4. Reconnect optional services in the new runtime and ask Chef to verify the install.

If adoption reports a schema mismatch, update Chef as directed rather than changing the schema
file. Do not delete the original data root to get past a refusal.

## Verify the install

Ask: "Verify my Chef install." Run this after setup, after an update, or when something appears
broken. Chef checks Node, data-root writability and schema, then bundled scripts against a
disposable sample. It does not change household records, though normal diagnostic logging
can still write to `diagnostics/`. A successful result has `status: pass` and all checks have
`ok: true`.

For failures, use the [troubleshooting table](installation.md#troubleshooting). Connector checks
are separate; install verification alone is not proof of working email, calendar or nutrition.

## Updates

The installed skills come from a Git clone of Chef's repository. Muse keeps one clone next to
`custom-skills/`; Claude Code and Muse Code use the plugin layout. Releases are SemVer Git tags.

The optional "Chef update notice" recurring task fetches tags from that clone's `origin` and
compares the newest tag with the installed plugin version. It installs nothing. No `origin`
means the check refuses, not that Chef is current.

Ask: "Update Chef." Be aware that the first step already commits pending non-ignored data-root
files, checks out the newest release tag and replaces installed Chef skills to match it.
It then shows changed skills, pending data and settings migrations, and recurring-task prompt
changes. This is not a read-only preview.

Data-root migrations and settings key renames or removals wait for your explicit confirmation.
Additive settings migrations can apply when settings are read. After confirmation, Chef runs
migrations and verifies the install. Existing recurring tasks with changed prompts need your
approval to be re-created, keeping their names and chosen times. Updates never delete
data-root files, and `settings.json` remains Git-ignored.

If verification fails, inspect the failed checks. Never delete household data to repair an update.

## Dietary safety

Chef gives general information, not medical advice.

Chef never suggests a recipe that its ingredient list shows conflicts with a hard constraint you've declared, and leaves out recipes it can't verify. It can't see product labels, brands, or cross-contact, so always check labels.

Tell Chef about allergies, celiac disease and foods a household member must never eat during
setup or later. Chef leaves conflicting or unchecked recipes out and gives the reason.
Allergen flags cover the US major food allergens plus gluten. Other constraints match ingredient
wording only, which can miss another name for the same food. Dislikes are avoidances, not hard
constraints.

You can ask Chef to mark a recipe you checked yourself as safe for a constraint. That is a
permanent, dated record and needs confirmation; it cannot clear a conflict shown by the
recipe's own ingredients. Only the member who declared a constraint can ask to set it aside
for one plan. Such overrides are never saved as a standing rule.

Recipe meals pass the dietary gate, including recipes on shopping lists. Free-text food such
as a meal out is not checked, shopped for, prepped or nutrition-estimated. Health suggestions
are advisory and never change what the dietary gate allows. See the
[dietary safety rules](../src/references/dietary-safety.md) for details.

## Diagnostics and help

Say "show Chef's log", "clear Chef's log" or "turn off Chef's log" to manage the invocation trace.
Say "report a problem with Chef" to draft a feedback report. The
[feedback and privacy guide](feedback-privacy.md) covers preview and consent, post-error offers,
the feedback outbox, connector removal and deletion of sent reports.

For public bugs or ideas, [open an issue](https://github.com/jleonelion/chef/issues/new) with
reproduction steps and your runtime. Keep private household data and secrets out of public issues.
