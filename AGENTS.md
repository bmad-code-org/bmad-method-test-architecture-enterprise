# Repository Guidelines

## Project Shape

- Core TEA module content lives in `src/`.
- Public documentation lives in `docs/`; the Starlight site consumes it through `website/`.
- GitHub Actions workflows live in `.github/workflows/`.
- Release metadata must stay synchronized across `package.json`, `package-lock.json`, and `.claude-plugin/marketplace.json`.

## Common Commands

- `npm test`: full quality gate used before release.
- `npm run format:check`: Prettier check.
- `npm run lint`: ESLint check.
- `npm run lint:md`: markdownlint check.
- `npm run docs:validate-links`: docs link validation.
- `npm run docs:build`: full docs and site build.
- `npm run test:release-metadata`: package/lockfile/marketplace version sync check.

## Changelog Discipline

- For any user-facing change, documentation change, workflow/CI change, release behavior change, or bug fix, update `CHANGELOG.md` in the same PR.
- Put unreleased work under the top `## [Unreleased]` section using Keep a Changelog headings such as `Added`, `Changed`, `Fixed`, `Deprecated`, or `Removed`.
- When preparing or repairing a stable release, convert the relevant `[Unreleased]` notes into an exact version section like `## [1.16.0] - YYYY-MM-DD`.
- Do not leave release-worthy changes only in GitHub auto-generated notes. The publish workflow can fall back to `[Unreleased]`, but an exact version entry is preferred for stable releases.

## PR Notes

- Mention validation commands actually run.
- For docs-only changes, at minimum run `npm run docs:validate-links`, `npm run lint:md`, and `npm run format:check`.
- For workflow or release changes, run `npm run format:check`, `npm run lint:md`, `npm run lint`, and `npm run test:release-metadata`.
