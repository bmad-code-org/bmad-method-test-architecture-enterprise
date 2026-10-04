# CI pipeline requirements

Platform: GitHub Actions. The workflow file lives at `.github/workflows/test.yml`.

This service needs its test job and its evaluation checks, and nothing else.

- Triggers: pull requests targeting `main`, pushes to `main`, published releases, and a weekly schedule on Sundays at 03:00 UTC (`0 3 * * 0`). No manual dispatch.
- Test job: it runs on pull requests and on pushes to `main` only.
- Permissions: `contents: read` only.
- Steps: check out the repository, use the Node version pinned in `.nvmrc`, install with `npm ci`, then run `npm test`.
- Evaluation: the repository holds an evaluation of the router. Run its pull request checks on every pull request, its merge checks when a change lands on `main`, its scheduled checks on the weekly schedule, and its release checks when a release is published.
- Time limits: the scheduled and release checks call live models, so they get more time than the pull request and merge checks.
- Evidence: keep what each evaluation job records under `runs/` as a build artifact of its own, whether its checks pass or fail.

Do not add a lint job, sharding, a burn-in loop, a retry wrapper, or any other artifact upload. Anything beyond the list above is unwanted.
