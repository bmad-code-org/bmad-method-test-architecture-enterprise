---
title: 'How to Set Up a Test Framework with TEA'
description: How to set up a test framework using TEA
---

# How to Set Up a Test Framework with TEA

Use TEA's `framework` skill to scaffold test directories, fixtures, configuration, and runner commands, and to configure CI when requested.

`bmad-testarch-framework` owns framework and CI setup. Your prompt selects framework only, CI only, or both.
TEA infers the scope from your request. When CI scope is unclear, it asks once: "Do you want CI too?"
Explicit framework-only requests skip the CI phase. For both, TEA agrees the stack, framework, and test commands first, then can generate the scaffold and pipeline in parallel and validate them together.

Setup scope is separate from the operation: Create starts a new run, Resume continues the saved scope and original operation, Validate checks existing outputs, and Edit revises them. Each operation journals its targets and position; Edit and Validate preserve prior Create checkpoints.

## When to Use This

- No existing test framework in your project
- Current setup needs shared fixtures or runner configuration
- Starting a new project that needs testing infrastructure
- Phase 3 (Solutioning) after architecture is complete

## Prerequisites

- Architecture completed (or at least tech stack decided)

## Steps

### 1. Run Framework Setup

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-framework`
- **Codex:** `$bmad-testarch-framework`
- **Inside a `/bmad-tea` chat:** `TF`

Full invocation rules: [Invoking a TEA Workflow](/docs/reference/commands.md#invoking-a-tea-workflow).

For framework only, add "Set up the test framework only."
For both phases, add "Set up the test framework and CI." The same skill runs both phases using an agreed stack, framework, and test-command contract.
`TF` starts framework setup; the `CI` menu code starts its CI phase.

### 2. Answer TEA's Questions

TEA will ask about:

- Your tech stack (React, Node, etc.)
- Preferred test framework:
  - **Frontend/Fullstack**: Playwright, Cypress
  - **Backend (Node.js)**: Jest, Vitest, or Playwright (API testing via playwright-utils)
  - **Backend (Python)**: pytest, or Playwright for Python
  - **Backend (Java/Kotlin)**: JUnit, or Playwright for Java
  - **Backend (Go)**: Go test
  - **Backend (C#/.NET)**: dotnet test / xUnit, or Playwright for .NET
  - **Backend (Ruby)**: RSpec
- Testing scope (E2E, integration, unit, API)
- CI/CD platform (GitHub Actions, GitLab CI, Jenkins, Azure DevOps, Harness, etc.)

### 3. Review Generated Output

TEA generates:

- **Test scaffold**: Directory structure and config files (language-idiomatic)
- **Sample specs**: Example tests following best practices for your framework
- **`.env.example`**: Environment variable template
- **Version file**: `.nvmrc` (Node.js), `.python-version` (Python), `global.json` (.NET), etc.
- **README updates**: Testing documentation

## What You Get

**Frontend/Fullstack (Node.js):**

```text
tests/
├── e2e/
│   ├── example.spec.ts
│   └── fixtures/
├── integration/
├── unit/
├── playwright.config.ts  # or cypress.config.ts
└── README.md
```

**Backend (Python example):**

```text
tests/
├── unit/
│   └── test_example.py
├── integration/
├── api/
├── conftest.py
└── README.md
```

> **Note:** Playwright has official bindings for Python, Java, and .NET, so it is viable for API testing across those languages too.

## Playwright Utils Integration (on by default)

This integration applies to JavaScript and TypeScript suites using the Playwright runner.
TEA uses the selected framework's conventions for other stacks.

`tea_use_playwright_utils` defaults to `true`, so unless you turned it off in `bmad setup tea` this workflow asks to install `@seontechnologies/playwright-utils` and then scaffolds against it:

```bash
npm install -D @seontechnologies/playwright-utils
```

What gets created on the enabled branch:

- `{test_dir}/support/merged-fixtures.ts`: the single entry point every spec imports `test` from, composed with `mergeTests`
- `{test_dir}/support/auth-fixture.ts`: `setAuthProvider` and `createAuthFixtures()`. If the auth endpoint is unknown, `getToken` contains a `TODO` listed in the summary.
- `global-setup.ts` wiring for `authStorageInit()` and `configureAuthSession()`, with the token storage directory gitignored
- Sample tests written in the same style, since every later workflow reads them as the reference

If you decline the install, TEA scaffolds plain Playwright fixtures.

**Utilities available:** api-request, network-recorder, auth-session, intercept-network-call, recurse, log, file-utils, burn-in, network-error-monitor

Set `tea_use_playwright_utils = "false"` under `[modules.tea]` for plain Playwright fixtures.

## Write-Time Quality Checks

The framework phase's Create operation installs the hook on Claude Code; Resume installs it when continuing through that setup step.
TEA copies `.claude/hooks/tea-enforce.cjs` and registers pre-write, post-write, and stop hooks in the project's `.claude/settings.json`, preserving existing settings.
The hooks run in ordinary coding sessions in that project.
Rules apply to the test and Pact config paths in `.tea/enforce-config.json`.

Seven rules block supported violations:

- Focused tests such as `.only`
- Tautological assertions such as `expect(value).toBe(value)`
- Hard waits such as `waitForTimeout`
- Test files above the configured line limit, which defaults to 1,000
- Maestro flows with no assertion or destination-state wait that can fail
- Pact config without `fileParallelism: false`
- Pact settings that defeat serialization, such as concurrent execution, multiple workers, or disabled isolation

Undocumented disabled tests produce a warning.
Post-write and stop checks catch violations that bypassed the pre-write hook.
If the hook itself errors, it fails open and allows the write.

The workflow skips hook installation on platforms without this interception point and records that in its summary.
Run `test-review` to audit test quality on those platforms.

## Optional: MCP Enhancements

TEA can use Playwright MCP servers for enhanced capabilities:

- `playwright`: Browser automation
- `playwright-test`: Test runner with failure analysis

Configure in your IDE's MCP settings.

## Tips

- **Run only once per repository**: Framework setup is a one-time operation
- **Run after architecture is complete**: Framework aligns with tech stack
- **Include CI in the same run**: Ask for framework and CI setup together, or use the `ci` compatibility command later to start the CI phase

## Next Steps

After test framework setup:

1. **Test Design**: Create test plans for system or epics
2. **CI Configuration**: Set up automated test runs
3. **Story Implementation**: Tests are ready for development
