# Chef v1.3.1

Patch release: feedback send polish. No data-root schema change, settings change or skill rename.
"Update Chef" installs it in place.

## Changes

- **Selectable Send now / Don't send now.** When the runtime can show choices, each feedback
  preview ends with a one-click card. Send now sends the latest preview; Don't send now keeps the
  draft. Edits and removals show a new preview and card, and the existing check refuses stale
  choices. Typing "send" still works. (#119)
- **Strict send approval and plain failure messages.** Vague replies such as "sounds good" or
  "yes" do not send. A rejected install key or a rate limit now reports its own plain reason
  instead of a generic rejection, and Chef never trims a report to fit. (#117)
- **Muse host prompt announced first.** Before the first send, Chef says Muse will ask to allow
  the feedback host. If you deny it, nothing is sent and the draft is kept for retry. (#116)

## Known gaps

Live-VM verification of the choice card is tracked in #138 (v1.4.0).
