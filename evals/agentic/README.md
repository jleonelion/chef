# Agentic gates

## Promotion criteria

An agentic row starts with `gate: false`. Promote it to `gate: true` only when all of these are true:

- A normalizer emits valid result metadata, `evals:lint` passes, and the row has fixture-grounding metadata for every declared fixture fact.
- The row has a verified grounding review for the scenario, including exact fixture refs and fixed dates.
- Candidate rows collect the scheduled evidence: the scheduled run executes gated and candidate rows.
- The latest scheduled run is a `3/3` pass for at least three consecutive runs on the Claude harness with its default model.
- The passing summary is archived under `evals/agentic/archive/` and verifies against the evaluated tree.
- The row has no invalid reps and no unrelated behavioral failures.

Do not gate a known-failure row. Reassess gated rows after harness, Projector, dataset, fixture, or skill changes.

## Hosted workflow

Scheduled and GitHub-hosted agentic promotion is disabled. There is no active hosted workflow; do not treat prior hosted or scheduled results as local release evidence. Do not use API credentials or separately billed APIs for release judging.

## Local subscription-backed judge

The answer-quality judge runs through an authenticated CLI subscription. Select it independently from the row host:

```sh
bun run agentic --harness codex --judge-harness claude --judge-model <model> --reps 3
```

Authenticate Claude Code, Codex or Copilot before the run. Supported choices are `claude`, `codex` and `copilot`. There is no `OPENAI_API_KEY` fallback. Empty, malformed, unavailable or errored judge output fails that row; never retry a failed or invalid repetition.

Judge targets describe reply quality, not proof of file writes or search results.
For `chef-add-recipe-pasted-text`, the reply confirms the saved title without filesystem paths or links.
Enrichment details, notices and other extras are not judged, and the reply need
not explain how to find the recipe or repeat ingredients and steps. The row
checks storage, a clean committed tree and search mechanically.
It requires exactly five raw sources, four fixture files plus one new source,
and checks the new source's name, ingredients and steps. A count check's optional
`pattern` filters relative file names; its `assertions` check every matched file's
text. Keep a positive exact count so content checks cannot pass without a match.

File checks with `unchanged: true` compare bytes and existence against a snapshot
taken after the row's setup commands, before the first agent turn. They require
that baseline, rather than assuming a fixture file must be absent.

Script checks can opt into `allowedCalls`. Every invocation must match one
listed script and argument prefix, including any declared exact flag values.
An empty list forbids all script calls; omitting it leaves other calls
unrestricted. This does not require a call. Use `required` or `requiredCalls`
for presence. Skill loads remain separate from script execution and file writes.

Per-repetition console lines and the final failure digest include judge failures,
even when deterministic behavior passes. Judge failures do not change behavioral
pass counts or turn valid executions into invalid ones.

The judge receives Chef's exact required first-use invocation-trace notice as
product context. Scripts instruct the agent to show it verbatim with the answer;
its length is not unsolicited content. This does not excuse internal paths or
planning details. The interrupted Codex
attempt on `66158672e5b42a913eb5bc6ec1c44e6386856500` remains failed under
its original judge prompt. Its recipe confirmation exposed an absolute
filesystem link, and its judge also penalized the required notice. The
add-recipe skill now calls for a plain-text saved title without filesystem
paths or links. Fresh full-dataset evidence is required.

Use `--fail-fast --concurrency 1` for serial release attempts that stop on the
first failing, invalid or judge-failed repetition. No later job starts. With
higher concurrency, already-running jobs finish but no further jobs start.
The runner still archives a summary, marking every unrun repetition invalid
as missing, and exits nonzero even when the failed row is a candidate.
Without `--fail-fast`, existing candidate-only exit behavior is unchanged.
Ignored `*.result.json` files preserve complete per-repetition judge verdicts
before the console reports them. They may contain raw tool inputs and stay
local with transcripts, never in the committed archive.

Codex launcher version 5 observes the selected model slug from its own session
`turn_context` before repetition cleanup. It does not override the host's default.
Compact `*.model.json` files retain the model, session and turn IDs and relative
rollout path, not rollout contents. The observed model enters the result's
`models` list. Missing, stale, malformed or ambiguous model evidence invalidates
an otherwise completed turn; process and subscription-limit errors retain their
original classification. This records the CLI-selected slug, not an undisclosed
server-side model revision.

## Codex skill reads

Codex has no skill tool. Its Projector detects `SKILL.md` file operands read by
`cat`, `sed`, `head`, `tail`, `rg` or `grep`, including commands wrapped in
`sh`, `bash` or `zsh` with `-c` or `-lc`. It recognizes literal
`skills/<name>/SKILL.md` paths and one unquoted comma-list brace group in the
skill directory, such as `skills/chef-{meal-planning,recipe-search}/SKILL.md`
or `skills/{chef-meal-planning,chef-recipe-search}/SKILL.md`.
Names retain command and brace-list order. Quoted or escaped braces are literal,
not expansions. Reply text, tool output, comments, output destinations and
commands that only mention paths do not fire skills. Parsing never executes
transcript commands. Command substitutions and here-documents are unsupported
and skipped; this is not a general shell interpreter.

## Release evidence

Use a clean prepared release tree and run the entire agentic dataset 3/3 on each local launcher:

```sh
bun run agentic --harness codex --judge-harness claude --judge-model <model> --reps 3
bun run agentic --harness claude --judge-harness claude --judge-model <model> --reps 3
bun run agentic --harness copilot --judge-harness claude --judge-model <model> --reps 3
bun run agentic:verify --release <codex.json> <claude.json> <copilot.json> --reps 3
```

Commit summaries and use an optional exception file only for a maintainer-approved subscription-limit exception:

```json
[{ "host": "codex", "approved_by": "maintainer", "reason": "subscription limit", "missing_rows": ["row-id"] }]
```

An exception is not a pass and must identify missing coverage. Raw transcripts and credentials remain local.

### Installed-script evidence

Launcher version 3 uses an eval-only interpreter preload, through `NODE_OPTIONS`
for Node and `BUN_OPTIONS` for Bun. It records the actual entrypoint, real path,
SHA-256 and arguments before the entrypoint runs. For installed Chef entrypoints
it also records the installed skills pack's content and filesystem identity.
The runner compares the initial install with the evaluated bundle, then checks
the pack before and after each turn and against process-start observations.
Changed or replaced files, including skill instructions, make the repetition
invalid. Symbolic links inside the installed pack are not supported.

Only observations of unchanged installed entrypoints satisfy `required` and
`requiredCalls`. A matching basename, output, or command-text candidate cannot.
An external copy never qualifies, even with the same name or identical bytes.
An unmatched command-text candidate fails the `scripts` check with an explicit
provenance gap. A missing required observation also reports that gap.
Read-only inspection, including `node --check` and `node -c`, is not execution.
Node and Bun inline eval/print modes (`-e`, `--eval`, `-p`, `--print`) also
cannot establish direct entrypoint execution, even when their arguments name
an unchanged installed script or their expressions import it.
Genuine entrypoint executions launched as child processes by inline wrappers
still count.
Setup and post-run invocations do not
count as agent calls. Internal subprocesses of an installed Chef script are
integrity-checked but do not inflate its agent invocation counts.
Actual arguments replace the static parser's guesses; forbidden and consent
checks still apply, including to unmatched candidates.

Per-turn `*.executions.json` files stay beside ignored local transcripts.
Projectors keep the same runtime-neutral shape and never execute transcript
commands, resolve shell variables or replay historical commands. Genuine
Node and Bun calls can use quoted, relative or absolute paths, shell wrappers
and variables because observation happens in the interpreter.
If a host strips preload options, an installed call cannot satisfy a presence
check; do not fall back to trusting command text.

This is local eval instrumentation, not an adversarial security boundary.
The agent shares the repetition's user account and writable evidence directory.
It does not attest hostile attempts to forge observations, replace the observer,
or race the interpreter after its startup snapshot. No live host isolation or
connector delivery claim follows from deterministic tests.

The altered-copy execution in
[#234](https://github.com/jleonelion/chef/issues/234) remains a failed historical
repetition. Its deleted sandbox cannot be reconstructed, and the archived
summary must not be changed. Consent, no-send and data-root checks remain in
place. This eval-only correction needs no Chef release or `semver:` label;
the existing v1.4.0 milestone tracks release-evidence work, not a product change.
Fresh exact-tree, full three-host 3/3 evidence is still required and needs
authorization. Focused deterministic checks do not replace it; no live agents,
judges or connectors were rerun for this correction.

The v1.4.0 Codex evaluation reported in [#223](https://github.com/jleonelion/chef/issues/223)
used a stale two-source baseline and an ambiguous reply target for the pasted
recipe. Its completed repetition's five sources do not show a Chef storage
failure, but its archived judge failure remains a failure under that run's
target. Do not edit or retrospectively pass that evidence. Dataset and judge
changes require fresh evidence against the corrected tree. Focused deterministic
regressions or a selected-row run cannot establish the full three-host release
gate. The other repetitions' timeouts remain unresolved by this correction.

The receipt intake failure in
[#225](https://github.com/jleonelion/chef/issues/225) expected canned storage for
`RED LENTILS 1LB`, which did not say whether the lentils were dry or canned.
Saving one pound under `pantry.legumes` does not establish a Chef placement bug.
The original row now uses `DRY RED LENTILS 1 LB` and accepts a single non-canned
pantry entry; a separate row uses `CANNED RED LENTILS 1 CAN` and requires a
single canned pantry entry. Both check quantities, milk, bananas, purchase and
receipt records, healthy inventory, clean data-root history and no reusable
bag anywhere in inventory. Each expects seven inventory entries: the five
seeded entries plus bananas and lentils, with milk merged into its existing
entry. Keep the archived failure unchanged. These dataset
and fixture corrections require fresh exact-tree, full three-host 3/3 release
evidence; deterministic checks do not replace it or resolve the other timeouts.
No Chef release is needed for this eval-only change.

The dry-receipt repetition on `eab060747120b82c56c5f6f30b5890ae4a7e405d`
stored one pound as `pantry.legumes.dry_red_lentils`. The fixture says
`DRY RED LENTILS`, and the skill asks for plain item names without requiring
the storage-form adjective to be dropped. The old exact-name selector could
not select that entry. Dry and canned rows now accept only their explicit
plain-name variants, `red lentils` or respectively `dry red lentils` and
`canned red lentils`, with matching key variants. Wrong forms, varieties,
locations, quantities and units still fail. Exactly seven entries, no bag,
purchase and raw receipt records, health and clean-history checks remain.
The failed partial summary is unchanged and is not release acceptance.
The assertion query supports finite string choices with
`$.items.[?(@name in ["red lentils","dry red lentils"])].path`;
multiple selected entries stay multiple and fail singleton assertions.
Real-script regressions reproduce the original failure and test both forms.
The shared assertion helper is included in relevant-tree provenance checks,
so changing its interpretation invalidates evidence just like changing a row.
Fresh full-dataset evidence is required.

The canned-receipt repetition on
`8ec10d787af6012a7920f8b46c14aa9f5d3b50e3` chose
`pantry.canned_goods.canned_red_lentils`. The skill assigns target selection
to the model, and the schema permits snake-case category names rather than
an enumerated category list. The shipped `pantry.canned` placement is only
a fallback for untargeted lines. Both receipt rows now recognize explicitly
named `canned` and `canned_*` categories: the canned row requires one and
the dry row rejects them. This also closes the dry row's previous false
acceptance of `canned_goods`. All name, quantity, unit, singleton, count,
non-food, record, health and history checks remain. Keep the failed partial
summary unchanged; fresh full-dataset evidence is required.

The full Codex attempt on
`63bf37de8b272515f7c5eaeb7f5bbfef8cb077b7` put 2.1 lb of bananas in
`fridge.produce`, while the row pinned the fallback `pantry.produce` path.
Neither the receipt nor the target-selection contract fixes that new
item's location to the pantry. Both receipt rows now check the inventory
view for exactly one `bananas` item, exactly 2.1 lb, stored in the pantry
or fridge. Missing, duplicate, wrong-quantity, wrong-unit and frozen banana
entries fail. The existing whole-milk update, dry/canned lentil distinction,
seven-item count, bag exclusion, records, health and clean-history checks
remain. Keep the failed summary unchanged and collect fresh full evidence.

The sender-refusal failure in
[#233](https://github.com/jleonelion/chef/issues/233) substituted missing
authentication for the returned untrusted-sender cause. The skill now separates
trust from authentication and requires the returned cause and exact sender.
Three rows cover authenticated-but-untrusted, trusted-but-unauthenticated and
both-fail cases. The both-fail semantic target explicitly rejects the historical
false attribution; trust still takes precedence. Equivalent explanations are
judge-scored, while sender identity, exact sender-check arguments, no ingestion,
recorded body-access inputs, unchanged receipt/inventory/purchase/audit bytes
and unchanged, clean data-root history remain deterministic.
The tool-input check cannot resolve arbitrary shell aliases or hidden reads.
Keep the archived failure unchanged. This packaged wording correction is
`semver:patch`, targeted to v1.4.0, with no settings, schema, data-root, receipt
contract or integration changes. Deterministic regressions do not prove future
model explanations. The old sandboxes were deleted, and no live harness or
judge reruns are authorized for this correction. Fresh exact-tree, full
three-host 3/3 release evidence remains an explicit gap.

The same run missed brace-expanded skill reads, tracked in
[#224](https://github.com/jleonelion/chef/issues/224). Static reprojection can
identify those reads but cannot recover deleted data-root snapshots or establish
a new release pass. Keep the archived summary and judge verdicts unchanged.
Dietary denial assertions remain in force; the override-consent assertion
mismatches in [#230](https://github.com/jleonelion/chef/issues/230) required the
separate correction below.
A Projector correction requires fresh exact-tree, full three-host 3/3 evidence,
not retrospective reclassification of the old run.

The batch-prep PDF assertions in
[#226](https://github.com/jleonelion/chef/issues/226) incorrectly searched the
extracted string array for separate planned-date lines. The renderer groups
repeated recipe dates on one line. The corrected assertions match each recipe
heading followed by its full planned-date line in the PDF reader's newline-joined
`content`, while preserving the original `text` array and the valid-PDF,
page-count, document-title and recipe checks. Regression PDFs cover grouped
dates, missing and incorrect dates, wrong meal slots and dates attached to the
wrong recipe. The original run PDFs were deleted, so this reproduction does
not prove their full contents or retrospectively pass those three repetitions.
Keep the archived failures unchanged. Fresh exact-tree, full three-host 3/3
release evidence is still required; deterministic regressions do not replace
it. No Chef release is needed for this eval-only change.

The meal-logging confirmation failures in
[#227](https://github.com/jleonelion/chef/issues/227) required capitalized
`Lunch` even when the reply proposed the correct lowercase `lunch`.
The no-plan and direct-entry rows now accept meal-slot capitalization variants
while requiring January 21, 2026, Chickpea Spinach Stew, one serving,
cooked-at-home status and an explicit confirmation request. The no-plan flow
still forbids the logging script and any meal-log file, with unchanged, clean
data-root history. Direct entry forbids the script before approval and requires
exactly one invocation afterward, plus one final entry with every expected
field, including servings. Focused verifier regressions cover both flows,
missing or incorrect proposal details, unrelated questions, premature logging
and incorrect final entries. Keep the archived failures unchanged. These
eval-only changes need no Chef release but do require fresh exact-tree,
full three-host 3/3 release evidence; deterministic checks do not replace it.

The no-plan fallback repetition on
`3ba506fee6462e204b9f31028e1ee4250233180e` explained the missing plan and
asked what the user had for lunch, how many servings and whether it was
cooked at home. The row instead required the literal word `manual`, which
the skill does not require. That assertion now accepts an ordinary request
for what the user ate or had, matching the existing no-plan flip pair's
manual-entry intent. The flip pair also accepts "What did you have".
Date and lunch checks, the complete second-turn proposal and explicit
confirmation, no logging-script calls, no meal-log file and unchanged clean
history remain required. Generic unrelated questions still fail. Preserve the
failed partial summary unchanged and collect fresh full-dataset evidence.

The full Codex attempt on
`cf5bd9f8ba153465d7d146918cf82a9de07c7c4e` reached the complete no-plan
proposal and asked "Log this entry and deduct the recipe ingredients for
one serving from inventory?" The confirmation matcher accepted only
`confirm` or modal prefixes such as "Shall I". All three meal-confirmation
rows now also accept direct questions to log, save or record the proposed
entry or meals. The action question must begin a sentence and end before
any intervening sentence boundary. Statements followed by unrelated
questions, reported questions and negated logging still fail. Complete
proposal details, approval timing, script and file checks are unchanged.
Preserve the failed partial summary unchanged; a fresh full run is required.

The leftovers logging failures in
[#228](https://github.com/jleonelion/chef/issues/228) required the inventory audit
file to be absent even though it already existed in the fixture. The corrected
row compares both inventory data and audit bytes with their post-setup state.
It accepts "left over" and "leftovers", requires the proposed meals and a
confirmation request, and retains both expected `cooked: false` entries,
the prohibition on asking whether lunch was cooked, and clean data-root history.
Regressions run the real planning and logging scripts, check both inventory
results are `not-requested`, and reject audit appends, inventory edits and file
deletions. Keep the archived failures unchanged. These eval-only corrections
need no Chef release and do not resolve other failures or establish a release
pass. Fresh exact-tree, full three-host 3/3 evidence is still required.

The health-goal check-in failures in
[#229](https://github.com/jleonelion/chef/issues/229) matched the literal `2300`
and rejected the equivalent `2,300`. The active row now requires the Lower sodium
goal, a sodium upper bound of 2300 mg and a protein lower bound of 90 g, with
grouping, bound wording and common unit spelling tolerated. The dormant row
rejects invented numeric targets, including grouped sodium and protein-only
targets. Stored-target checks and unchanged, clean data-root history remain
required. Focused response regressions cover both rows, wrong or missing targets,
reversed bounds, unsupported units and unrelated matching numbers. Keep the
three archived failures unchanged. This eval-only correction needs no Chef
release and does not establish a release pass. Reassess release evidence on the
eventual evaluated tree with fresh exact-tree, full three-host 3/3 evidence.
No paid agents or judges were rerun for this correction.

The dietary override row in
[#230](https://github.com/jleonelion/chef/issues/230) rejected equivalent
set-aside wording and the documented read-only `today --date` lookup.
Its first reply now has a semantic target, selected with `judge.turn: 1`,
requiring the named recipe, dairy conflict, no-save explanation and explicit
consent from Alex for this dinner only. The judge must reject broad, permanent,
implied or third-party permission. The literal word `override` is not required.

Deterministic checks still forbid planning and every override flag before
eligible assent, including overrides on recipe searches. The conversation
includes an undecided reply and Sam attempting to approve Alex's exception
before Alex confirms. Protected plan, household, data and settings state is
checked after each pre-consent turn. After assent the row requires the intended
date, dinner, recipe and exactly `Alex Example:dairy`, unchanged standing rules
and inventory, and no saved override metadata. A later dinner request must not
reuse consent; a final unoverridden search must still exclude the recipe.
Turn-boundary checks catch changes that a later turn restores, but cannot
observe writes restored within a single turn.

Synthetic trajectory regressions run the real lookup, planning and search
scripts. They cover early writes, missing assent, wrong-member assent,
early search overrides, persisted metadata and later reuse. A scripted judge
transport test verifies reply selection, not live semantic-judge accuracy.
The old sandboxes are gone; no original per-turn content can be reconstructed.
Keep all archived failures unchanged, including those also affected by #224.
No Chef release or `semver:` label is needed for this eval-only change.
No live agents or judges were rerun. Fresh exact-tree, full three-host 3/3
release evidence still needs authorization; deterministic regressions do not
establish a release pass or retrospectively pass the old runs.
The complete saved meal list must contain exactly the approved January 19
dinner, both immediately after assent and finally. An extra conflicting dinner
in the same weekly file fails even though the January 19 lookup still succeeds.

The one-off shopping-list failures in
[#231](https://github.com/jleonelion/chef/issues/231) required a question mark
despite explicit imperative requests to confirm sending. The corrected row
accepts questions and imperatives that request approval to send to both exact
one-time recipients. Repeating recipients, asking an unrelated question,
assuming assent or claiming the list was already sent must fail.
The installed shopping entrypoint remains required, Gmail sending is forbidden,
settings must remain unchanged, no shopping list may be persisted, and data-root
history must stay unchanged and clean.

Focused synthetic runner replays execute the built shopping entrypoint with
chat delivery. An altered external script copy still fails the required-script
check, preserving repetition 1's separate failure. These tests exercise neither
a live Gmail connector nor a live agent or judge. Keep all three archived
failures unchanged, including repetitions 2 and 3. This eval-only correction
needs no Chef release or `semver:` label and establishes no release pass.
Fresh exact-tree, full three-host 3/3 release evidence still needs authorization;
no live reruns are authorized by this issue.

The read-only routing failures in
[#232](https://github.com/jleonelion/chef/issues/232) treated loading a skill as
a forbidden mutation. The missing-plan row now permits meal-logging
instructions, requires `today --date 2026-01-21` before the first reply, and
requires an explanation of the missing lunch and a request for manual-entry
details. The later generic approval still authorizes no logging command or
write. Meal-log and inventory snapshots are checked at both turn boundaries
and finally, including the inventory audit and rollup.

The dairy-constraint refusal on
`8c51fe40dbcf6bf9bd6bd78a9ff674661fc0f40f` loaded meal-planning
instructions, checked the recipe gate and correctly refused the dairy
recipe without writing. Its flip-pair row incorrectly forbade the relevant
instruction load. Only that row now permits it, requires the real recipe
search and a reply naming Creamy Tomato Soup and dairy, and limits commands
to recipe `search`/`show` and read-only plan `today`. Plan writes and every
override-bearing call are forbidden. Knowledge, stored data and ignored
settings are snapshotted unchanged, alongside the existing zero plans and
clean, unchanged history. Other rows' routing exclusions remain intact.
Preserve the failed partial summary unchanged; obtain fresh full evidence.

The dormant health row requires read-only `status`, a no-goal explanation,
no invented numeric targets and unchanged stores. Its semantic target also
forbids invented goals, worded targets, unsolicited health advice and
suggestions to set a goal. The active-goal row remains distinct and unchanged.
The natural shopping row still requires the shopping entrypoint and forbids
meal-planning routing. Optional inventory access permits only `view`, never
edit, receipt intake, deduction or rollup. Shopping-list, inventory, receipt
and rollup snapshots supplement unchanged, clean data-root history.
Unrelated and off-topic skill exclusions remain in place.

Deterministic regressions execute the real reads and shopping build, reject
real invented-meal logging, goal changes and inventory edits, and cover
turn-boundary writes restored later. These checks do not test live-agent
quality or semantic-judge accuracy. Allowing an inventory read does not
establish that shopping repetition 3's rendered reply was correct.
The original sandboxes were deleted, so their contents cannot be recovered.
Keep the archived results unchanged, with no retrospective pass claim.
This eval-only correction needs no Chef release or `semver:` label.
Fresh exact-tree, full three-host 3/3 release evidence remains a separate,
explicitly authorized step. No live agents or judges were rerun.

The shopping reply defect in
[#235](https://github.com/jleonelion/chef/issues/235) is separate from those
routing failures. The natural-request row now requires the fixture's generated
three-serving shopping text unchanged, including `4 oz spinach (on hand: 1 bunch)`
and the never-asked dietary nudge exactly once, plus an explicit request to check
the incomparable stock. The packaged shopping instructions reinforce that
optional read-only inventory inspection cannot replace generated text or the
user check with expiry reasoning. The declared-constraint footer remains
covered by `chef-shopping-lists-footer-once`.

Synthetic response regressions reject missing notes or user checks, altered
purchase and on-hand quantities, invented conversions and duplicate nudges.
Real-script replays check the same row with and without inventory `view`;
the required shopping build, unrelated-routing exclusions, no-write snapshots
and unchanged, clean data-root history remain in force. This behavior fix is
`semver:patch`, targeted at v1.4.0, with no setting, schema, installation or
data-root compatibility change. Deterministic checks do not establish that
a live agent follows the reinforced instructions. Keep archived repetition 3
and its reported result unchanged. Fresh exact-tree, full three-host 3/3
release evidence still needs separate authorization. No live agent or judge
was rerun for this fix.
