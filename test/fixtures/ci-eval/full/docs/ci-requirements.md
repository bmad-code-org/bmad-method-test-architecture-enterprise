# CI pipeline requirements

Platform: GitHub Actions. The workflow file lives at `.github/workflows/test.yml`.

## Triggers

- Run on every push to `main`.
- Run on every pull request targeting `main`.
- Run on a weekly schedule, Sundays at 02:00 UTC (`0 2 * * 0`), for the burn-in job.

## Permissions

- Grant the workflow `contents: read` and no other permission.

## Toolchain

- Use the Node version pinned in `.nvmrc`.
- Install with `npm ci`.

## Test commands

- Unit tests: `npm test`.
- End-to-end tests: `npm run test:e2e`, sharded four ways with `fail-fast` off so every shard reports.
- Lint: `npm run lint`, and the test jobs wait for it.

## Quality gates

- The end-to-end suite runs a burn-in of 10 iterations on pull requests and on the weekly schedule, and the job fails on the first failing iteration.

## Artifacts

- Upload `playwright-report/` and `test-results/` when a job fails, and only then, kept for 14 days.
