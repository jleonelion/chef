# Release evidence may span runs, with whole-row attempts

The release gate required one uninterrupted full-dataset run per harness. Subscription usage limits and sporadic CLI failures killed four Codex runs in a row, one of them after the agent had behaved correctly. Release evidence is now per row: every row needs 3/3 valid passing repetitions on the same evaluated tree, from one or more archived runs per harness.

## Considered options

- **Keep one uninterrupted run**: rejected. It is unachievable under usage limits and rewards rerunning everything until nothing interrupts it.
- **Mix repetitions across runs** (rep 1 from one run, rep 2 from another): rejected. A row's repetitions would no longer be one observation of the same conditions.
- **Resume inside a run, or relabel a timed-out rep whose agent behaved correctly as a pass**: rejected. A failed or invalid repetition is never retried or rewritten; rerunning is a new, recorded attempt.
- **Derived merged summary file**: rejected. Verification merges the raw summaries on the fly, so there is no second artifact to trust or let drift.

## Consequences

- Summaries carry `tree_sha`, a hash of the committed relevant files; runs combine only on an identical tree, plugin, dataset, fixtures, launcher, CLI, model and judge.
- The latest valid attempt of a row wins. Invalid attempts never supersede it. A behavioral failure on the same tree needs maintainer acknowledgement even after a later pass.
- Any fix to a row or to Chef changes the tree and makes earlier runs stale.
