# Release planning

Plan Chef releases on request, before each release, and when scope changes
materially. A release is a tagged version of the public skill pack. Feedback
intake deploys independently on merge to its `main`; its issues live in Chef.
Use [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow):
short-lived branches, reviewed PRs into `main`, and branch deletion after merge.

## Plan a release

1. List all open Chef issues, including those already targeted, and all closed
   issues in candidate milestones. Read their descriptions, comments, linked
   PRs, sub-issues and blockers as needed. Include feedback intake work. Check
   the latest release tag, commits since it and open milestones.
2. Assess each issue's impact using **Change level** and **Breaking change** in
   [GLOSSARY.md](../GLOSSARY.md). Consider documented skills and behavior,
   installation and upgrade paths, existing data and the feedback contract.
   A change that ships in Chef gets exactly one `semver:` label. An intake-only,
   investigation or planning issue that needs no Chef release has none. Assess
   service compatibility separately; lack of a Chef label does not mean safe.
   If impact is unclear, record the missing evidence and leave the target
   unset. Do not silently downgrade an existing label.
3. Propose a small, coherent next release using priority, readiness and
   dependencies. Leave other issues in the backlog. A patch and a minor
   milestone may coexist; plan a major milestone when breaking work is ready.
   Milestones use exact versions, and a release target cannot understate the
   change level. Service-only prerequisites may be in a milestone for tracking
   but do not determine the Chef version.
4. For coordinated work, record blockers on the issues, the service deployment
   order and any migration or rollback plan. Check compatibility with
   previously released clients that may still be installed. If an intake
   change breaks one, agree on a migration or deprecation plan before deploy.
5. Present proposed labels, targets, scope, dependencies and uncertainties
   with reasons. The maintainer approves label and milestone changes before
   the agent applies them. After a release, re-evaluate open targets against
   closed issues, unreleased changes and dependencies; propose any renames or
   moves for approval and leave an audit trail.

For commands and issue conventions, see
[issue-tracker.md](agents/issue-tracker.md). The maintainer decides what ships;
an empty backlog is not a planning goal.

## Before closing an issue

After the work is complete, inspect its outcome and record an assessment in
the issue: implementation PR if there is one, compatibility impact, evidence,
final change level and target, or why no Chef release is needed. Include
cross-repo deployment dependencies. For a PR that auto-closes its issue,
complete the assessment before merge; otherwise close it after assessment.

An agent may record an assessment confirming the existing label and target.
If either must change, propose the correction and wait for maintainer approval
before changing it or closing the issue. If impact is unresolved, record the
missing evidence and leave the issue open. Review already-closed issues in
candidate milestones without reopening them solely to add an assessment.

## Branching and release evidence

Before merging the first minor or major change for a release, confirm its
intended scope and the maintainer's intent to release promptly. Check whether
patch work should ship first and agree on the order. Main may still move ahead
of an urgent fix.

Before tagging, compare the actual release commit with the previous release
tag. Its changes determine the minimum version bump; issue assessments and
labels cross-check it. Resolve discrepancies before tagging. A patch release
cannot contain unreleased minor or major changes.

If main has moved ahead, ask the maintainer to choose either the higher-level
release or an exceptional patch. For a patch, branch from the latest release
tag, include only the selected fixes, run the release gates on the exact commit
to tag, and ensure the fixes also reach main. This is an exception to GitHub
flow, not an ongoing maintenance branch or a promise to support older release
lines. Complete [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md) for either path.

## Feedback triage

For each feedback record, consider whether it calls for a Chef change, an
intake-only change, investigation or no change. Assess likely change level,
urgency and dependencies before proposing a sanitized issue and release
target. The assessment stays provisional until implementation is reviewed.
Keep existing no-change and reproduction-case outcomes; associate duplicates
with an existing issue privately.

A public issue may include an independently written, non-identifying synopsis
and a link to the authenticated maintainer-only record. Never include report
text, receipt secrets, personal details or reporter identity. Review the
synopsis inside intake, using an overlap tool if available, and check whether
the synopsis and link together identify a person. If either is unsafe, omit it;
if a safe review is not possible, publish neither until reviewed. The issue is
the durable record; the private link can expire under the normal retention
policy.
