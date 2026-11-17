# Feedback and diagnostics: privacy

What Chef records about its own runs, what a feedback report holds, where each copy lives, how
long it is kept and how to delete it or turn it off. Chef never submits passive telemetry: only a
report you approve leaves your machine. Every limit below is a starting value, not a measured one.

## What Chef records locally

**The invocation trace** is a short technical log of Chef's own script runs. One event per run
holds:

- the skill, script and operation, and when it started and how long it took
- the outcome (`ok` or a failure kind) and a registered error code, never an error message
- facts each script declares in `schemas/feedback/facts.v1.json`, such as a status or a result
  count
- the Chef version and the runtime name (such as `muse`)

Anything a registry does not declare is refused when the event is written. The trace never holds
what you asked, script arguments or output, recipes, inventory, household, health or dietary
details, email, conversation or file content, settings, locale, timezone or paths. Chef cannot
see what the agent did before or after a script, and reports say so instead of guessing.

The trace is on by default (since v1.2.0) and covers all 10 skills (since v1.3.0). Chef shows a
one-time notice about it on the first run with the trace on, once per machine.

## What a report holds

You build a feedback report with Chef and see every line, numbered, before anything is sent or
saved. The bytes sent are exactly the bytes the preview shows; any change makes a new preview.

- **Your words**: a summary and the questions for its class (defect, enhancement or behavior
  change). Chef drafts them in general terms ("a dairy item", not "milk") and you can restore
  details. A pattern scan flags emails, URLs, phone numbers, street addresses, file paths and
  long digit runs in these fields and suggests removing them; it never edits them silently.
- **Diagnostics** (defects by default, optional otherwise): trace events of the skill concerned
  from the last hour (at most 50), or the last 10 runs of any skill when there are none.
  Run IDs are renumbered and times become offsets from the hour, so a report cannot be matched
  to your local trace or another report. Coarse environment facts come with them: Chef version,
  runtime and its capabilities, installed Chef skills, JavaScript engine and version, and OS
  family. You can drop any event or the whole bundle.
- **Contact** (optional, Muse only): asked once; you can decline. It is never part of the report
  bytes or pattern-scanned, and goes in a separate request after the report is accepted.

No name or account is attached. Feedback intake does not store Muse account context.

## Local files and how long they stay

Everything lives in the data root's `diagnostics/` folder: mode 0700, files 0600, git-ignored by
its own `.gitignore`, so no commit ever holds it. A file copy of the whole data root does
include it.

| File | Holds | Kept |
|---|---|---|
| `trace.jsonl` | the invocation trace | at most 200 runs, 256 KiB and 14 days; the oldest drop off on the next read or write |
| `report-draft.json` | the report being built | 14 days, or until sent, saved or discarded |
| `outbox/` | approved reports Chef saved instead of sending (no connector, or intake closed) | 14 days |
| `receipts/` | `report_id`, receipt secret, class and send date of each sent report | 90 days, intake's longest retention, or until the report is deleted |
| `contact-retry/` | a sent report's contact choice still to be confirmed | 14 days, or until confirmed |
| `offers.json` | when Chef last offered to report each error, and the ones you declined | until cleared |
| `notices.json` | one-time notices shown on this machine | until deleted |

Expiry is checked whenever Chef reads or writes these files; there is no background job.

## Feedback intake

On Muse with the Chef feedback connector, "send" posts the approved bytes from Chef's script
straight to Chef's feedback intake (`chef-feedback-intake.vercel.app`); the bytes are never
relayed through the chat. It is not GitHub and not Meta. Muse asks you to allow the host on the
first send.

- **Who sees it**: the named Chef maintainer, signed in. Every view of a report is logged.
  Intake re-runs the same pattern scan and masks matches by default; revealing one is logged.
- **Kept**: 90 days after it arrives, then hard-deleted; 30 days after the maintainer closes it,
  if sooner. Contact is deleted when the report is closed. Backups roll over within 7 days.
- **No identity**: rate limits use the install key and a coarse IP prefix, held in memory for
  24 hours and never stored with a report.
- **Closed intake**: the maintainer can close intake. While it is closed, intake stores nothing
  and answers 503 with reason `intake-closed` and an optional short message. Chef says "Chef
  feedback is closed for now, so nothing was sent. Chef kept the approved report on this machine
  and will not try again by itself.", adds "The maintainer says: " and the message if there is
  one, saves the approved bytes in `diagnostics/outbox/` (0600) and keeps the draft. Chef never
  retries on its own; ask to send it again later and it resends the same report.

Security problems do not belong in a report: use GitHub private vulnerability reporting on
`jleonelion/chef`.

## Receipts and deleting a sent report

When intake accepts a report it returns a `report_id` and a one-time receipt secret; intake keeps
only a hash of the secret. Chef saves both, with the report's class and send date, under
`diagnostics/receipts/` (0600) and never shows the secret in chat. Receipts are kept 90 days, so you can delete a sent report for as long as
intake holds it.

To delete a report you sent, ask Chef (`chef-setup report-delete`). You pick it from a list of
your receipts (send date, class, `report_id`, newest first), confirm once (`--report-id`, then
`--confirm`), and Chef sends a receipt-authorized delete through the connector. Intake
hard-deletes the report with its contact and replies at once, and Chef removes the receipt. If
the report already expired or was deleted, Chef says so and removes the receipt. If the delete
fails, nothing is deleted and the receipt is kept so you can retry. Deleting needs the Chef
feedback connector on Muse; elsewhere Chef says so and deletes nothing.

A lost or expired receipt cannot be recovered; the report then expires on intake's schedule.

## Deleting local data

- "Clear Chef's log" (`chef-setup clear-trace`) deletes the trace. Nothing is sent.
- Discarding a draft (`chef-setup report-discard`) deletes it.
- Deleting `diagnostics/` removes everything above from this machine. Chef recreates the folder
  when needed. Without the receipts you can no longer delete sent reports yourself.

## The three off switches

Each is reversible and reachable in plain words or with `chef-setup`.

1. **Trace off**: "turn off Chef's log" or `set --trace off`. Chef stops writing the trace and
   deletes it at once. Reporting still works; the report notes the trace was unavailable.
2. **Post-error offers off**: "stop offering to report errors" or `set --post-error-offers off`.
   Offers come only after an internal error, at most once an hour for each skill's error, and
   "no thanks" ends offers for that error. They need the trace, so with the trace off there are
   none. Turning offers on again forgets every "no thanks".
3. **Sending off**: disconnect Chef feedback in Muse's Settings > Connectors. Deleting the
   connector folder under `custom-connectors/` or uninstalling Chef does not remove the stored
   key; only disconnecting does. Without the connector, "send" saves to the outbox.
