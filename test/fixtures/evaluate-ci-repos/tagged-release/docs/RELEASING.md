# Releasing

1. Confirm `main` is green.
2. Bump `version` in `package.json` and update the changelog.
3. Push a tag named `v<version>`. `.github/workflows/release.yml` runs the tests and publishes to the registry.

The tag is the only release gate. There is no staging environment and no scheduled job.
A defect that ships stays in the registry until the next tag, which is usually about six weeks away, and consumers pin versions, so a fix reaches them only when they upgrade.
