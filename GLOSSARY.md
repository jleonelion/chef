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
