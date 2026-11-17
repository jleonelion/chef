# Chef v1.3.0

Minor release: feedback and diagnostic reporting. No data-root schema change and no skill renames.
Settings stay at version 2; the new `post_error_offers` setting defaults to on and needs no
migration. "Update Chef" installs it in place. Because the "Chef shopping list" task prompt
changed, the update offers to re-create that task with the same name and time.

## Changes

- **One-time notice about Chef's log.** On the first run after the update, Chef says once that it
  keeps a short technical log on this machine that never leaves it on its own, how to turn it
  off and how to report a problem. The log has been on by default since v1.2.0; nothing about it
  starts now. (#87)
- **Invocation trace: all 10 skills.** Every Chef skill script now records its runs in the local
  log, not just recipe search. It still holds only which script ran, how long it took, how it
  ended and facts each script declares; never what you asked or any household content. (#76)
- **Report a problem: three kinds.** Chef asks once whether it is a defect, an enhancement or a
  behavior change, then that kind's questions. It drafts in general terms and says what it
  generalized; you can restore any detail. Diagnostics attach to defects by default: the
  skill's runs from the last hour, or the last 10 runs of any skill when there are none. You can
  widen or drop them. (#77)
- **Offer to report an internal error.** When a Chef script fails unexpectedly, Chef offers once
  to report it, with the failing run and a pre-drafted defect. At most once an hour for each
  skill's error; "no thanks" ends offers for that error. `chef-setup set --post-error-offers off`
  turns offers off. A script that throws now prints an `internal-error` result instead of
  crashing. (#78)
- **Send a report from Muse.** With the new optional "Connect Chef feedback" setup step, "send"
  posts the approved report from Chef's script to Chef's feedback intake. Chef first shows where
  it goes, who sees it, how long it is kept and its size, and Muse asks to allow the host on the
  first send. The receipt is saved under `diagnostics/receipts/` and never shown in chat.
  Without the connector, "send" saves the report in `diagnostics/outbox/` as before. (#79, #80)
- **Optional contact.** On Muse, Chef asks once whether you want to leave a contact for the
  maintainer to reply, or decline. Contact is shown in the preview, never part of the report and
  deleted when the report is closed. (#110)
- **Delete a sent report.** On Muse, ask Chef to delete a report you sent (`chef-setup
  report-delete`): pick it by send date, class and id, confirm once, and intake hard-deletes it
  and Chef removes its receipt. Receipts now record class and send date and are kept 90 days, so
  this works for as long as intake holds the report. An expired or already deleted report is
  reported as such; a failed delete keeps the receipt for a retry. (#81)
- **Intake can be closed.** If the maintainer closes feedback intake, "send" sends nothing: Chef
  says feedback is closed for now, adds the maintainer's short reason if given, saves the
  approved report in `diagnostics/outbox/`, keeps the draft and never retries on its own. (#86)
- **Maintainer triage.** Reports are worked from a triage queue with status and plain-text
  replies. Pattern-scan matches and contact are masked by default; each reveal is logged. The
  client and intake share one pattern definition. (#82, #83)
- **Pattern scan: more file paths.** The scan in the report preview now also flags `~/...` and
  absolute paths of two or more segments. (#102)
- **Scheduled shopping list: no stale plans.** The "Chef shopping list" task now uses the
  earliest plan starting between today and a week from today. With none, it sends no email and
  asks once whether to plan the week. `build` without flags still uses the latest plan. (#41)
- **Docs.** The README has a "Feedback and diagnostics" section, and
  [docs/feedback-privacy.md](docs/feedback-privacy.md) covers what is captured, retention,
  deletion, receipts and the three off switches. (#87)

## Safety and ownership

Only a report you approve leaves your machine, and the bytes sent are exactly the preview you
approved. Nothing is sent without your "send", and on Muse also the host approval. Feedback
intake keeps reports 90 days at most, or 30 days after the maintainer closes them, and stores no
name or account. The local log, drafts, outbox and receipts stay in the data root's git-ignored
`diagnostics/` folder. Turn the log off with `chef-setup set --trace off`, which also deletes it,
and turn sending off by disconnecting Chef feedback in Muse's Settings > Connectors.

## Release verification

CI (unit tests, tier1 evals, repro lint, migrations, build drift, bundle smoke, hygiene) is green on the tagged commit. The send path was verified live on a Muse VM with a synthetic data root during v1.3.0-alpha.2 (#80). The agentic suite was not run for this release, so no agentic result is attached.
