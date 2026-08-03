# Test Suite

Test coverage for this module: the Zod-based agent schema validator
(`tools/schema/agent.js`, which ensures every `*.agent.yaml` conforms to the
BMAD agent specification), the installation components, the knowledge base,
release metadata, and the `tea-test-review` CLI.

## Quick Start

```bash
# Full quality gate (all suites, lint, markdownlint, format)
npm test

# Run with coverage report
npm run test:coverage

# Individual suites
npm run test:schemas           # test-agent-schema.js
npm run test:install           # test-installation-components.js
npm run test:cli               # test-test-review-cli.js
npm run test:knowledge         # test-knowledge-base.js
npm run test:release-metadata  # test-release-metadata.js

# Validate actual agent files
npm run validate:schemas
```

## tea-test-review CLI suite

`test-test-review-cli.js` covers `cli/` in isolation. Its header comment lists
every suite it contains. No vendor CLI (`claude`, `codex`) is ever actually
spawned here; `fixtures/test-review-cli/stub-agent.js` stands in via
`--agent-cmd` for every adapter's argv shape.

Fixtures live under `fixtures/test-review-cli/`:

- `reports/*.md`: agent reports fed to `parse-report`. Filenames describe the
  case. The reason each one must be rejected is declared inline in the
  `unparseableFixtures` table in the test, so a description cannot drift away
  from the assertion that enforces it.
- `project/`, `project-claude/`, `project-empty/`: project trees for
  `resolve-skill`, covering the `_bmad` layout, the `.claude/skills` layout, and
  no skill installed. The `SKILL.md` stubs are one line each; only their location
  matters.
- `stub-agent.js`: a fake agent for the end-to-end paths. `STUB_MODE` selects one
  of twelve behaviours, including a crash, writing nothing, a stale report, and an
  attempted forbidden write that proves isolation is active. Eight of the modes
  copy a `reports/` fixture as their payload, so those files serve both the
  parser suite and the end-to-end suite.

A fixture report is shaped to the parser, so a green run here proves nothing
about what a live agent emits. `wrapped-steps-flow.md` and `empty-steps-flow.md`
exist because a real run produced a frontmatter shape that every other fixture
had missed; `plain-bullets-key-strengths.md` exists because a real `--agent
codex` run wrote plain `- ` bullets under Key Strengths/Weaknesses instead of
the `✅`/`❌`-prefixed form `claude` reliably produces — the parser's own
best-effort design already tolerates this, the fixture just pins it down.
