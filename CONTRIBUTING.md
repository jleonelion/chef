# Contributing

Thanks for helping. Changes land only through pull requests from forks; the maintainer reviews
and approves each one. Nobody else has push access to this repo.

## Workflow

1. Fork `jleonelion/chef` and clone your fork.
2. Branch off `main`: `git switch -c fix/short-description`.
3. Install and check:

   ```sh
   bun install --frozen-lockfile
   bun run check
   bun run build   # commit the built output; CI fails on drift
   ```

4. Push to your fork and open a PR into `jleonelion/chef:main`. Keep it to one logical change.
5. CI on fork PRs waits for maintainer approval before it runs.
6. The maintainer reviews. Address comments with new commits and resolve each conversation.
   A push after approval clears that approval. PRs are squash-merged.

## Rules

- No real names, addresses or personal emails anywhere. Use `example.com`.
- Never commit secrets, API keys or real household data. Use the synthetic fixtures.
- Tests run offline. Don't add calls to live APIs.
- Terms follow `GLOSSARY.md`; architectural decisions go in `docs/adr/`.

## Required checks you can't pass from a fork

- `hygiene` needs a deny list stored as a repo secret. Fork PRs get no secrets, so this check
  fails on every fork PR. The maintainer runs it on a branch in this repo before merging. Run
  `bun run hygiene` locally to catch the `example.com` email rule early.
- `overlap-review-gate` passes unless the PR touches `evals/repro/`. In that case the maintainer
  runs the overlap review in feedback intake.

## Issues

Bugs and ideas go in GitHub Issues. Include steps to reproduce and the harness you used.
