# Contributing

- Open a pull request against `main`. The `test` check must pass and one maintainer must approve.
- Merges go through the merge queue, which re-runs the `test` check on the queued commit.
- Pull requests from forks run without any secret.
- The nightly workflow runs against `main` with `GRADER_MODEL_KEY`, the vendor model key. No pull request run receives it.
