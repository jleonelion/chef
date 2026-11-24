# Architecture

Chef supplies skills, not a standalone agent. A host agent reads skill instructions, runs their
scripts and handles the conversation. Terms follow the [glossary](../GLOSSARY.md).
For contributor setup and checks, see [Contributing](../CONTRIBUTING.md).

## Execution flow

1. The host agent selects a skill from its description and reads its `SKILL.md`.
2. The skill directs the agent to collect inputs, request any required confirmation and run a
   script from that skill's directory.
3. The script resolves the data root, checks applicable schema and dietary rules, and performs
   the operation. Shared libraries handle file formats, guarded writes and Git commits.
4. The script returns JSON. The agent follows the skill's result handling, presents the answer
   and performs any supported host actions the user authorized.

For example, saving a recipe uses [recipe import instructions](../src/skills/chef-add-recipe/SKILL.md);
planning and shopping consume the saved recipe through their own skills. A script's return
status and the agent's handling are separate parts of the behavior.

The data root resolves in this order: a supplied `--data-root` path, `CHEF_DATA_ROOT`, then the
runtime default `~/workspace/chef`. It holds household records and a separate Git history,
not Chef implementation files. It is in the host's workspace and need not be on the user's
computer. Stored formats belong in the [data schema reference](../src/references/data-root-schema.md).

## Runtime integration

[`src/runtime/contract.mjs`](../src/runtime/contract.mjs) selects the runtime adapter and
validates its feedback capability declarations. Muse is the only runtime Chef currently
identifies explicitly. Other hosts use the generic adapter with runtime identity `unknown`;
Chef does not assume they are Muse.

The [Muse adapter](../src/runtime/muse.mjs) handles connector credentials, approved feedback
submission and receipt-authorized deletion. It also supplies household helpers for locale,
the default data-root path, installation layout, email and recurring-task instructions, and
PDF attachment delivery. Those household helpers also serve Claude Code and Muse Code.
The [generic adapter](../src/runtime/generic.mjs) declares no feedback submission capability,
so approved reports are saved to the feedback outbox instead.

On Muse, custom connectors provide credential surrogates that the host's egress proxy exchanges
for keys at the registered destination. Off Muse, USDA credentials come from
`CHEF_USDA_FDC_KEY`. Email and calendar scripts return instructions for the host rather than
calling those services themselves. Recurring tasks also belong to the host, not a Chef
scheduler. These distinctions matter when a host lacks a capability.

Feedback submission is a separate, explicitly approved network action, not the path for recipe
fetches or USDA calls. See [feedback and privacy](feedback-privacy.md) and
[external integrations](usage.md#data-and-external-integrations).

## Source and generated output

```text
.claude-plugin/marketplace.json   Marketplace entry pointing to plugins/chef
src/
├── skills/                      Authoritative skill instructions and scripts
│   └── chef-*/
│       ├── SKILL.md
│       ├── scripts/
│       └── smoke.json            Bundled install-verification cases
├── lib/                         Shared data, nutrition, safety and feedback code
├── runtime/                     Runtime adapters and contract
└── references/                  Shared references copied into each built skill
plugins/chef/
├── .claude-plugin/plugin.json    Installable plugin manifest
└── skills/                      Generated self-contained skill folders
fixtures/
├── data-root/                   Synthetic household used in checks
└── schema-v<n>/                 Frozen released-schema fixtures
schemas/                        Machine-readable validation contracts
evals/                          Script and agent behavior evaluations
scripts/                        Build and repository checks
docs/                           User and contributor references
```

[`scripts/build.mjs`](../scripts/build.mjs) bundles each skill's top-level script entry points
and shared imports into Node-compatible ESM files. It copies `SKILL.md`, smoke cases, any
skill-specific references and shared references into `plugins/chef/skills/`. Setup also
receives a synthetic fixture for install verification. Users run that committed output without
installing the source repository's dependencies.

Claude Code and Muse Code load the plugin layout. Muse installs copies into `custom-skills/`
with underscore-style names and retains a repository clone next to it for updates. The data
root remains separate in every layout. The [installation guide](installation.md) covers these
contracts and troubleshooting.

Source changes belong under `src/`, with generated output committed when rebuilt. CI checks
for drift. [Contributing](../CONTRIBUTING.md#development-commands) lists commands; the
[eval guide](../evals/README.md) explains script-contract and agent-level checks. Eval harness
launchers and Projectors are evaluation infrastructure, not Chef's runtime adapters.
