# CI pipeline requirements

Platform: GitHub Actions. The workflow file lives at `.github/workflows/test.yml`.

This service needs one job and nothing else.

- Trigger: pull requests targeting `main`. No push trigger, no schedule, no manual dispatch.
- Permissions: `contents: read` only.
- Steps: check out the repository, use the Node version pinned in `.nvmrc`, install with `npm ci`, then run `npm test`.

Do not add a lint job, sharding, a burn-in loop, a retry wrapper, or artifact uploads. Anything beyond the list above is unwanted.
