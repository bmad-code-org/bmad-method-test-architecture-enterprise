# Contributing

- Open a pull request against `main`. The `test` check must pass and one maintainer must approve.
- Pull requests are squash merged. There is no merge queue, and nothing runs after a merge to `main` except the next release.
- Pull requests from forks run without any secret.
- CI holds no model credentials. Only the release workflow holds a secret, the registry token.
