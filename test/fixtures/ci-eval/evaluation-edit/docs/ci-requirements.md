# CI pipeline requirements

Platform: GitHub Actions. The workflow file lives at `.github/workflows/test.yml`, and the team already keeps one there.

This service keeps its test job and its evaluation checks, and nothing else.

- Trigger: pull requests targeting `main`. No push trigger, no schedule, no manual dispatch.
- Permissions: `contents: read` only.
- Test job: check out the repository, use the Node version pinned in `.nvmrc`, install with `npm ci`, then run `npm test`. The platform team wrote this job by hand and keeps it as it is.
- Evaluation: the repository holds an evaluation of the ledger. Run its pull request checks on every pull request.
- Progress file: the create run's progress file under `test-artifacts/ci/` stays as it is.
- Evidence: keep what the evaluation records under `runs/` as a build artifact, whether its checks pass or fail.

Do not add a lint job, sharding, a burn-in loop, a retry wrapper, or any other artifact upload. Anything beyond the list above is unwanted.
