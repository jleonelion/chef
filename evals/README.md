# Evals

| Dataset | File | Run |
|---|---|---|
| Tier1 deterministic cases | `tier1/cases.json` | `bun run tier1` |
| Agentic rows | `agentic/rows.json` | `bun run agentic` |
| Reproduction cases | `repro/*.json` | `bun run repro` (see `repro/README.md`) |

`bun run evals:lint` checks the tier1 and agentic datasets against `schemas/evals/` and runs in CI.
Unknown keys, assertions with no recognised check (`equals`, `absent`, `includes`, `excludes`, `min`),
duplicate ids, unknown skill names and badly shaped ids all fail it.

## Naming ids

Every row or case id is `<skill>-<scenario>`:

- lowercase kebab-case, at least two segments, unique within its dataset
- `<skill>` is the full name of a skill the item evaluates, as in `src/skills` (`chef-recipe-search`, not `recipe-search`)
- `<scenario>` says what is being checked (`chef-food-inventory-untrusted-sender-refused`)

Which skill counts as evaluated:

- tier1: a skill named in the `{skills}/<skill>/` paths of the case's `command` or `steps`. If several, prefix with the one under test; do not prefix with a feature name such as `dietary-gate`.
- agentic: one of the row's `skills`.

The lint rejects an id that does not start with one of those skills, so grep `chef-<skill>-` finds every item covering a skill.
Ids are referenced by `repro`, `known_failure` and result files, so renaming one means updating those too.
New datasets should follow the same rule and add a schema under `schemas/evals/`.
