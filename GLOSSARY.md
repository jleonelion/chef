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

**Invocation event**:
One allowlisted record of a single Chef script run: what ran, how long, and how it ended. Never holds user content.
_Avoid_: log line, telemetry event

**Invocation trace**:
The bounded, local-only sequence of invocation events Chef keeps on the user's machine. Never submitted as a whole.
_Avoid_: log, telemetry, history

**Diagnostic bundle**:
A snapshot of selected invocation events and coarse environment facts, built when the user makes a feedback report. Exists only inside one.
_Avoid_: attachment, dump, logs

**Feedback report**:
A defect, enhancement or behavior-change request the user reviewed and approved for submission; the only thing that leaves the user's machine.
_Avoid_: ticket, issue, telemetry

**Feedback intake**:
The private maintainer-side service that receives feedback reports, issues their IDs and holds them until they expire. Unrelated to receipt intake.
_Avoid_: intake (unqualified), inbox

**Feedback receipt**:
The report ID and one-time secret a reporter gets on submission; whoever holds it can check status, add comments or delete the report, without being identified. Unrelated to grocery receipts.
_Avoid_: receipt (unqualified), ticket number, token

**Reproduction case**:
A maintainer-written scenario with synthetic data that reproduces what a feedback report describes; refers back to the report but holds none of its content.
_Avoid_: fixture copy, test from report

**Evidence gap**:
A named kind of fact Chef could not observe for a report, such as what happened before a script started; means "not observed", never "did not happen".
_Avoid_: missing data, null

**Removed field**:
A part of a feedback report the user deleted during preview; recorded by name so maintainers know it was withheld rather than never captured.
_Avoid_: redaction, censored field

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
The household's choice of US or metric measures for quantities Chef shows; stored recipes keep the units they were written in.
_Avoid_: units preference, measurement mode
