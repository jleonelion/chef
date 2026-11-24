# Chef

## What is Chef?

Chef is a free, MIT-licensed kitchen-assistant plugin with skills for recipes, meal planning,
food inventory and shopping. Save a recipe from a link, pasted text or photo, plan meals around
what you have, and turn the plan into a shopping list. The skills supply instructions and
scripts; the agent in your host runs them. Muse installs the skills into its workspace, rather
than using Claude Code's native plugin installer.

## Install in Muse

Muse app support is experimental. This installation prompt has not yet been verified in a
live Muse session. Chef's repository is public; Chef does not require connecting your GitHub
account.

Open Muse and paste this message:

```text
Install Chef, my kitchen assistant, from https://github.com/jleonelion/chef.
Use public access without connecting my GitHub account. Check that your
workspace has Node 20 or later and Git, and can download files and run scripts.
Install the ready-to-use skills in plugins/chef/skills using your custom-skill
installation instructions. Keep the repository clone beside your custom-skills
folder for updates, separate from my household data.
Then walk me through Chef setup and run its installation checks.
Tell me whether every check passed. If anything is blocked or unsupported,
stop and explain what I need to do rather than claiming installation succeeded.
```

Answer Muse's setup questions, or skip the optional ones. You can accept the default folder
for your household data and skip integrations to get started. Tell Chef about any allergies
or foods someone must never eat before planning meals.

Setup is complete only when Muse reports that every installation check passed. If it does
not show the results, ask: "Verify my Chef install." These checks use a disposable sample
without changing household records. A failed or blocked check is not a completed install.

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
