# CI pipeline requirements

Platform: GitHub Actions. The workflow file lives at `.github/workflows/test.yml`.

This service needs its test job and its evaluation checks, and nothing else.

- Trigger: pull requests targeting `main`. No push trigger, no schedule, no manual dispatch.
- Permissions: `contents: read` only.
- Steps: check out the repository, use the Node version pinned in `.nvmrc`, install with `npm ci`, then run `npm test`.
- Evaluation: the repository holds an evaluation of the grader. Run its pull request checks on every pull request.
- Evidence: keep what the evaluation records under `runs/` as a build artifact, whether its checks pass or fail.

Do not add a lint job, sharding, a burn-in loop, a retry wrapper, or any other artifact upload. Anything beyond the list above is unwanted.
