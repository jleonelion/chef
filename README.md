# Chef

## What is Chef?

Chef is a free, MIT-licensed kitchen-assistant plugin with skills for recipes, meal planning,
food inventory and shopping. Save a recipe from a link, pasted text or photo, plan meals around
what you have, and turn the plan into a shopping list. The skills supply instructions and
scripts; the agent in your host runs them. Muse installs the skills into its workspace, rather
than using Claude Code's native plugin installer.

## Install in Muse

Muse app support is experimental.

You need Muse with its GitHub plugin able to access `jleonelion/chef`, and a workspace where
Muse can run scripts and write files. Chef's scripts require Node 20 or later and Git in that
workspace. Optional connectors are not required to get started.

1. Give Muse's GitHub plugin access to [jleonelion/chef](https://github.com/jleonelion/chef).
2. Ask Muse: "Install Chef from jleonelion/chef." Muse copies the skills and runs Chef setup.
   If onboarding does not start, ask: "Set up Chef."
3. During setup, choose a data root or accept `~/workspace/chef`. Answer or skip the optional
   questions about units, household members, dietary constraints and integrations. Tell Chef
   about any allergies or foods someone must never eat before planning meals.
4. Ask: "Verify my Chef install." Setup's `verify` result must have `status: pass`, with every
   check marked `ok: true`. It checks Node, data-root permissions and schema, and bundled
   scripts against a disposable sample, without changing household records. A failure is
   not a completed install.

For failed checks or installation details, see the [installation guide](docs/installation.md).
Using another host? See [Claude Code](docs/installation.md#claude-code) or
[Muse Code](docs/installation.md#muse-code) installation.

Your household data lives in a separate folder in the host's workspace, not necessarily on
your own computer. Optional integrations can contact external services. Muse's "Help improve
our AI models" setting may cover what you tell Chef; see [Muse's privacy policy](https://muse.ai/privacy)
and the [data and integration guidance](docs/usage.md#data-and-external-integrations).

Chef gives general information, not medical advice. It checks recipe ingredient wording
against declared dietary constraints, but cannot see product labels, brands or cross-contact.
Always check labels. See [dietary safety](docs/usage.md#dietary-safety).

## Try it

After setup, try these prompts in order with a recipe you want to cook:

1. Paste the recipe text and ask: "Save this recipe."
2. Ask: "Plan dinner tomorrow using the recipe I just saved. Leave the other meals unplanned."
   Review the proposed meal and confirm it before Chef saves the plan.
3. Ask: "Make a shopping list for that meal plan, subtracting what is already in my food inventory."

Chef needs a saved recipe that passes your household's dietary checks. If it cannot use the
recipe, review the reason before choosing another. No USDA key is needed for this workflow;
without one, nutrition is marked "not computed", not estimated.

For settings, backups, restore, verification and updates, use the [usage guide](docs/usage.md).

## How it works

Each skill combines instructions for the agent with scripts that read or update the data root.
Host-specific runtime adapters handle runtime capabilities and integration requests. The
data root holds household records and its own Git history, separately from the installed
skills and Chef's source repository.

```text
Chef repository
├── src/
│   ├── skills/       Skill instructions and script source
│   ├── lib/          Shared implementation
│   ├── runtime/      Runtime adapters
│   └── references/   Shared references, including the data schema
├── plugins/chef/
│   └── skills/       Generated, self-contained installable skills
├── fixtures/         Synthetic household data for checks
└── evals/            Evaluation suites and evidence

Host workspace, separate from the install
└── chef/             Household data root, default ~/workspace/chef
```

The build bundles source scripts and copies instructions and references into
`plugins/chef/skills/`. Installed skills use that generated output, not `src/` directly.
See the [architecture guide](docs/architecture.md) for execution flow, runtime integration and
packaging, and the [data schema](src/references/data-root-schema.md) for stored formats.

## Contribute or get help

- [Contributing](CONTRIBUTING.md) covers setup, checks and the pull request workflow.
- [Report a problem](docs/feedback-privacy.md#report-a-problem) through Chef, or
  [open a public issue](https://github.com/jleonelion/chef/issues/new) without private household data.
- [Usage guide](docs/usage.md) covers day-to-day operation and safety.
- [Feedback and privacy](docs/feedback-privacy.md) explains diagnostics, consent and deletion.

[MIT license](LICENSE).
