# CI pipeline requirements

Platform: GitHub Actions. The workflow file lives at `.github/workflows/test.yml`, and the team already keeps one there.

This package is tested on every pull request and published to the registry when a release is published.

- Triggers: pull requests targeting `main`, and published releases. No push trigger, no schedule, no manual dispatch.
- Permissions: `contents: read` only.
- Test job: check out the repository, use the Node version pinned in `.nvmrc`, install with `npm ci`, then run `npm test`. The release team wrote this job by hand and keeps it as it is.
- Publish job: the `publish` job publishes the package when a release is published. The release team wrote it by hand and keeps its steps, its condition and its settings as they are.
- Evaluation: the repository holds an evaluation of the release note builder. Run its pull request checks on every pull request and its release checks when a release is published.
- Gate: a release must never reach the registry unless the evaluation's release checks passed, so the `publish` job waits for them.
- Progress file: the create run's progress file under `test-artifacts/ci/` stays as it is.
- Evidence: keep what each evaluation job records under `runs/` as a build artifact of its own, whether its checks pass or fail.

Do not add a lint job, sharding, a burn-in loop, a retry wrapper, or any other artifact upload. Anything beyond the list above is unwanted.
