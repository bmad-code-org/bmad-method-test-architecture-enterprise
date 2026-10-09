# Contributing to TEA

TEA's skills and knowledge base live in `skills/`, public documentation in `docs/`, and command-line tools in `cli/`.
The docs site in `website/` builds from `docs/`.

## Report a problem or propose a change

Check [existing issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues) first.
Use the [bug report](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues/new?template=issue.md), [feature request](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues/new?template=feature_request.md), or [rule quality report](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues/new?template=rule_quality_report.md) template.
For a large change, open an issue before implementation so maintainers can agree on scope.
Feature proposals can also be discussed in [Discord](https://discord.gg/gk8jAdXWmj).

Bug reports should include the workflow or command, steps to reproduce, expected and actual results, and the agent, model, and TEA version.
For rule problems, include the rule's file and section, your prompt, and the smallest output excerpt that shows the problem.
See [SECURITY.md](./SECURITY.md) for private vulnerability reports.

## Local setup and checks

Use Node.js 22.20.0 or later.
From your checkout:

```bash
npm ci
npm test
```

`npm test` runs the full quality gate.
Some suites execute tools or install dependencies; see [the test suite guide](./test/README.md) for platform prerequisites and individual suites.
Live agent evaluations use separate `eval:*` commands and require the selected runner's setup.

For documentation changes, run at least:

```bash
npm run docs:validate-links
npm run lint:md
npm run format:check
```

Run `npm run docs:build` when changing site content or navigation, and inspect the affected pages.
For workflow or release changes, also run `npm run lint` and `npm run test:release-metadata`.
Use `npm run validate:schemas` after changing schema-backed definitions.

## Pull requests

Fork the repository, create a branch, and submit the pull request to `main`.
Keep each PR focused on one change.
Aim for 200–400 changed lines; split changes above 800 lines into independent PRs when the pieces can be reviewed separately.
Leave generated files to their owning tools.

The description should explain the problem and resulting behavior, name any related issue, and list validation commands you actually ran.
Keep it under 200 words when possible.
A useful template:

```markdown
## Change

[Problem and resulting behavior, in one or two sentences.]

## Validation

[Commands run and their results.]
```

Use [Conventional Commits](https://www.conventionalcommits.org/) with a title under 72 characters:

- `feat:` adds a feature.
- `fix:` repairs a bug.
- `docs:` changes documentation.
- `refactor:` changes code structure.
- `test:` adds or repairs tests.
- `chore:` changes tooling or maintenance.

Each commit should contain one logical change.

## Changelog and release metadata

Add user-facing, documentation, CI, release, and bug-fix entries under `## [Unreleased]` in [CHANGELOG.md](./CHANGELOG.md).
Use Keep a Changelog headings such as `Added`, `Changed`, or `Fixed`.
Keep the Unreleased heading present.
The stable release workflow stamps the dated version section.

Release versions must agree across `package.json`, `package-lock.json`, `.claude-plugin/marketplace.json`, and `skills/bmod-tea/bmod.toml`.
The publish workflow synchronizes them during a release.

## Why TEA publishes to npm

TEA's skills install through `npx skills add`.
Its command-line tools also need a delivery channel for CI, so TEA publishes `bmad-method-test-architecture-enterprise` to npm with the skills included.
An installed `tea-test-review` uses the review skill packaged alongside it, keeping the tool and skill on one version.
TEA's own development review workflow runs the CLI from the checkout to exercise the code under development.

Changes to a tool's flags, exit codes, or verdict format affect a published interface.
Include a changelog entry and account for compatibility when choosing the release version.

## Publishing

The [Publish workflow](./.github/workflows/publish.yaml) runs the quality gate before publishing.
Pushes to `main` affecting skills or package metadata publish a `next` prerelease.
Stable `latest` releases are triggered manually from `main`.

Maintainers can dispatch it with:

```bash
npm run release:next
npm run release:patch
npm run release:minor
npm run release:major
```

These scripts dispatch GitHub Actions; they require an authenticated `gh` CLI with repository access.
The Actions UI also exposes the channel and version-bump inputs.

Publishing requires npm Trusted Publishing configured for this repository's `.github/workflows/publish.yaml`.
Stable releases also need `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY`, with the GitHub App allowed to push the release commit and tag.
The workflow requests an OIDC token for npm, synchronizes metadata, and publishes with provenance.
For a stable release, it also stamps the changelog, pushes the version commit and tag, and creates a GitHub Release.

After publishing, check the version and dist-tags:

```bash
npm view bmad-method-test-architecture-enterprise version
npm view bmad-method-test-architecture-enterprise dist-tags
```

Verify the tagged skill install and the npm tools before announcing the release.
If publishing fails, inspect the workflow log and check the trusted publisher, App permissions, and release metadata.

## Community and license

Use [Discord](https://discord.gg/gk8jAdXWmj) for development questions and [GitHub Issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues) for tracked work.
By contributing, you agree to the [Code of Conduct](./.github/CODE_OF_CONDUCT.md) and license your contribution under the project's [MIT license](./LICENSE).
