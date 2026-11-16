# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## Change level and release target

Triage also settles when an issue ships (terms in `GLOSSARY.md`, commands in `issue-tracker.md` under **Release targeting**):

| Label           | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| `semver:patch`  | Fixes or rewords existing behavior; ships in any release     |
| `semver:minor`  | Adds behavior or an additive setting; minor or major release |
| `semver:major`  | Breaking change; major release only                          |

When triaging an issue:

1. Check or set its change level. Every open issue has exactly one `semver:` label.
2. Choose a release target (an open milestone at least as large as the change level), or leave it in the backlog. Only the maintainer picks the release; an agent proposes one and waits.
