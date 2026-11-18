# Chef

Chef is a household cooking assistant: recipes, meal plans, shopping lists, pantry inventory and dietary safety, kept in one local folder.

## Language

**Data root**:
The single folder holding all of a household's Chef state, with its own local history.
_Avoid_: workspace, Chef folder, database

**Household recipients**:
The email addresses Chef sends scheduled deliveries (shopping lists) to by default. Not an allow-list: the user can still ask Chef to send something to anyone else.
_Avoid_: allowed emails, mailing list

**Receipt intake**:
Chef reading grocery receipt emails from the user's own inbox to update the pantry.
_Avoid_: receipt forwarding

**Trusted receipt sender**:
An email address whose receipts receipt intake accepts; mail from any other sender is ignored.
_Avoid_: receipt source, allowed sender

**Recurring task**:
A scheduled run of a Chef prompt that the user approved one at a time and the runtime owns; Chef keeps no record of it.
_Avoid_: cron job, automation

**Release**:
A tagged Chef version that the user can be told about and choose to install.
_Avoid_: build, version bump

**Version**:
A release's SemVer number `X.Y.Z`, tagged `vX.Y.Z`. Its largest change level sets its kind: a **patch release** bumps Z, a **minor release** bumps Y, a **major release** bumps X.
_Avoid_: build number, revision

**Change level**:
The smallest Chef release kind a change can ship in, recorded on its issue as a `semver:` label. **patch**: fixes or rewords existing behavior; no new behavior, setting, flag or schema change. **minor**: adds behavior, a setting, a flag or an additive settings step Chef applies on read; existing data roots, skills and recurring tasks keep working with no action from the user. **major**: a breaking change.
_Avoid_: severity, priority, size

**Breaking change**:
A change an existing install cannot take without the user acting: a data-root `SCHEMA_VERSION` bump (its migration waits for the user's confirmation), a skill renamed or removed, or a setting, flag or script mode removed or given a new meaning.
_Avoid_: big change, major feature

**Release target**:
The release an issue is planned to ship in or support: its GitHub milestone, titled with the exact version (`v1.2.1`). An issue has at most one, never smaller than its change level.
_Avoid_: fix version, sprint, roadmap

**Backlog**:
Open issues with no release target. Triage, not issue creation, moves an issue out of it.
_Avoid_: icebox, someday, a "Backlog" milestone

**Invocation event**:
One allowlisted record of a single Chef script run: what ran, how long, and how it ended. Never holds user content.
_Avoid_: log line, telemetry event

**Invocation trace**:
The bounded, local-only sequence of invocation events Chef keeps on the user's machine. Never submitted as a whole.
_Avoid_: log, telemetry, history

**Trajectory**:
The runtime-neutral record of one agent turn as an eval observed it: the reply, the skills that fired, the tool calls made, and the Chef scripts run. Evals check a trajectory, never a raw transcript. Distinct from the invocation trace, which Chef itself keeps on the user's machine.
_Avoid_: trace, transcript, harness output

**Projector**:
The per-runtime code that turns one raw transcript into a Trajectory. Only the Claude projector exists.
_Avoid_: adapter, reader

**Harness launcher**:
The per-runtime code that makes an agentic eval run one turn in a headless agent runtime: it installs the built skills the way that runtime finds them, isolated from the user's own config, runs the prompt, and returns the raw transcript for the Projector. One per runtime (Claude Code, Codex, Copilot).
_Avoid_: adapter, driver, runner

**Diagnostic bundle**:
A snapshot of selected invocation events and coarse environment facts, built when the user makes a feedback report. Exists only inside one.
_Avoid_: attachment, dump, logs

**Feedback report**:
A defect, enhancement or behavior-change request the user reviewed and approved for submission; the only thing that leaves the user's machine.
_Avoid_: ticket, issue, telemetry

**Feedback outbox**:
The local folder under the data root's diagnostics where Chef saves an approved feedback report, byte for byte, when the runtime cannot send it. Nothing in it leaves the machine on its own; it expires like the invocation trace.
_Avoid_: outbox (unqualified), queue, sent folder

**Feedback intake**:
The private maintainer-side service that receives feedback reports, issues their IDs and holds them until they expire. Unrelated to receipt intake.
_Avoid_: intake (unqualified), inbox

**Feedback receipt**:
The report ID and one-time secret a reporter gets on submission; whoever holds it can check status, add comments or delete the report, without being identified. Unrelated to grocery receipts.
_Avoid_: receipt (unqualified), ticket number, token

**Reproduction case**:
A maintainer-written scenario with synthetic data that reproduces what a feedback report describes; refers back to the report but holds none of its content.
_Avoid_: fixture copy, test from report

**Sanitized issue**:
A public GitHub issue a maintainer writes about what a feedback report describes; may link to the private report and contain a non-identifying synopsis, but not report text or the reporter's identity.
_Avoid_: exported report, issue from report

**Overlap review**:
The check, run inside feedback intake, that a reproduction case or sanitized issue repeats none of its feedback report's text; answers only pass or fail, so the report never leaves feedback intake.
_Avoid_: similarity check, PII review

**Evidence gap**:
A named kind of fact Chef could not observe for a report, such as what happened before a script started; means "not observed", never "did not happen".
_Avoid_: missing data, null

**Removed field**:
A part of a feedback report the user deleted during preview; recorded by name so maintainers know it was withheld rather than never captured.
_Avoid_: redaction, censored field

**Post-error offer**:
Chef's one-time question, right after a Chef script hits an internal error, whether the user wants to report it. It is about one error, meaning one skill's error code: Chef asks at most once an hour per error, and "no thanks" ends offers for that error only. It needs the failing run in the invocation trace, so with the trace off there is none.
_Avoid_: crash prompt, error popup, auto-report

**Runtime**:
The agent host Chef's skills run inside, such as Muse, Muse Code or Claude Code. A host Chef cannot identify is an unknown runtime, never assumed to be Muse.
_Avoid_: platform, environment, host app

**Runtime adapter**:
The part of Chef that speaks for one runtime: it says which runtime this is, what that runtime can do, and carries a user-approved feedback report out. It never reads or changes a report's content.
_Avoid_: driver, integration, plugin

**Runtime capability**:
One narrowly named thing a runtime adapter can do right now, such as submitting through a connector or offering a reply channel. A missing capability is stated to the user or recorded as an evidence gap, never silently skipped.
_Avoid_: feature flag, tracing support

**Unit system**:
The household's choice of US or metric measures for shopping-list and inventory quantities Chef shows, and for recipe ingredients when the household opts in; stored recipes and inventory keep the units they were written in.
_Avoid_: units preference, measurement mode

**Meal plan**:
The household's planned meals for one week, starting on a chosen day.
_Avoid_: menu, schedule

**Planned meal**:
One meal in a meal plan: a date, a meal slot, what is eaten (a saved recipe, free-text food, or leftovers) and how many servings.
_Avoid_: day slot, plan entry

**Meal slot**:
Which meal of the day something is eaten at: breakfast, lunch, dinner or snack. Planned and logged meals use the same slots.
_Avoid_: meal type, course, slot (alone)

**Leftovers**:
A planned meal eaten from servings cooked at an earlier planned meal, so the dish is cooked and shopped for once.
_Avoid_: repeat, reheat

**Household member**:
A named person in the household. Dietary rules and health goals belong to a member; a member eats one serving of a planned meal unless the plan says otherwise.
_Avoid_: user, person, diner

**Eaters**:
The household members who eat a planned meal. All members unless the planned meal names fewer.
_Avoid_: attendees, guests

**Unattributed servings**:
The servings of a planned meal beyond one per eater, such as guests or seconds. They count toward the household's totals and shopping but belong to no household member, so never count toward a member's targets.
_Avoid_: extra servings, guest servings

**Free-text food**:
What is eaten, written as text with no saved recipe: a meal out, takeaway or a simple food. Logged and planned meals can both hold it. Chef does not shop for it, prep it, gate it or estimate its nutrition.
_Avoid_: custom meal, other

**Amount to cook**:
The servings cooked at a planned meal: its own servings plus the servings of every leftovers meal that points to it. Shopping lists and batch prep use it; nutrition uses servings eaten.
_Avoid_: batch size, yield (a recipe's `yield` field is what one batch makes)
