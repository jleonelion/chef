# Agentic result archive

Commit every release-gate summary here, including failed runs. The runner writes summaries here by default with a unique name. It writes raw harness transcripts under the ignored `evals/agentic/results/logs/` directory.

Before using a summary as release evidence, run:

```sh
bun run agentic:verify evals/agentic/archive/<result>.json
```

Pass the same `--reps`, `--rows`, `--known-failures`, and `--harness` options used for the run. The verifier permits commits that only add archived evidence after the evaluated commit. It rejects changes to code, built skills, schemas, datasets, or fixtures.
