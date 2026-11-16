# Chef v1.2.1

Patch release. No data-root schema change, settings change or skill rename. "Update Chef" installs it in place.

## Changes

- **Receipt intake: setup says what Chef does.** Onboarding now asks whether Chef should check the user's Gmail daily for grocery receipts and update the pantry. Only a yes asks which stores' receipt emails Chef should trust. Setup, inventory guidance and refusal messages now call this receipt intake instead of receipt forwarding.

## Safety and ownership

Receipt intake still checks the sender and Gmail's DKIM or SPF evidence before Chef reads an email body. Chef accepts receipts only from the trusted receipt senders the user chose. Sender addresses are never stored in the data root.
