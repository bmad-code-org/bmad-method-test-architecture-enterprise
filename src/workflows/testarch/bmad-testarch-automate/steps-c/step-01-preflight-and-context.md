---
name: 'step-01-preflight-and-context'
description: 'Determine mode, verify framework, and load context and knowledge'
outputFile: '{test_artifacts}/automation-summary.md'
nextStepFile: '{skill-root}/steps-c/step-02-identify-targets.md'
knowledgeIndex: './resources/tea-index.csv'
---

# Step 1: Preflight & Context Loading

## STEP GOAL

Determine execution mode, verify framework readiness, and load the necessary artifacts and knowledge fragments.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 Halt if framework scaffolding is missing

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, loaded artifacts, and knowledge fragments
- Focus: this step's goal only
- Limits: do not execute future steps
- Dependencies: prior steps' outputs (if any)

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Stack Detection & Verify Framework

**Read `config.test_stack_type`** from `{config_source}`.

**Auto-Detection Algorithm** (when `test_stack_type` is `"auto"` or not configured):

- Scan `{project-root}` for project manifests:
  - **Mobile indicators**: `.maestro/` or `maestro/` flow directory, `app.json`/`app.config.*` declaring expo or react-native, `Podfile`, `android/app/build.gradle`, `*.xcodeproj`/`*.xcworkspace`, `pubspec.yaml`
  - **Frontend indicators**: `package.json` with react/vue/angular/next dependencies, `playwright.config.*`, `vite.config.*`, `webpack.config.*`
  - **Backend indicators**: `pyproject.toml`, `pom.xml`/`build.gradle`, `go.mod`, `*.csproj`/`*.sln`, `Gemfile`, `Cargo.toml`
  - **Check mobile first.** A React Native or Expo project carries `package.json` with react and misdetects as `frontend` otherwise.
  - **Mobile present** = `mobile`; frontend and backend both present = `fullstack`; only frontend = `frontend`; only backend = `backend`
  - A mobile client and its own backend in one repo detects as `mobile`. Set `test_stack_type` explicitly to cover both surfaces in one run.
- Explicit `test_stack_type` config value overrides auto-detection
- **Backward compatibility**: if `test_stack_type` is not in config, treat as `"auto"` (preserves current frontend behavior for existing installs)

Store result as `{detected_stack}` = `frontend` | `backend` | `fullstack` | `mobile`

**Verify framework exists:**

**If {detected_stack} is `frontend` or `fullstack`:**

- `playwright.config.ts` or `cypress.config.ts`
- `package.json` includes test dependencies

**If {detected_stack} is `backend` or `fullstack`:**

- Relevant test config exists (e.g., `conftest.py`, `src/test/`, `*_test.go`, `.rspec`, test project `*.csproj`)

**If {detected_stack} is `mobile`:**

- Required project framework configuration (HALT if missing either):
  - A `maestro/` or `.maestro/` directory exists
  - The app's own unit/component test config exists (`jest.config.*`, `vitest.config.*`, `build.gradle` test block, an XCTest target, or `test/` for Flutter)
- Environment PATH check: `maestro` command on PATH. If missing from PATH, do NOT halt: flows can still be generated, so record that they cannot be executed in this run environment and say so in the summary.

If required framework configuration is missing: **HALT** with message "Run `framework` workflow first."

---

## 2. Determine Execution Mode

- **BMad-Integrated** if story/tech-spec/test-design artifacts are provided or found
- **Standalone** if only source code is available
- If unclear, ask the user which mode to use

---

## 3. Load Context

### BMad-Integrated (if available)

- Story with acceptance criteria
- PRD and/or tech spec
- Test-design document (if exists)

### Standalone

- Skip artifacts; proceed to codebase analysis

### Always Load

- Test framework config
- Existing test structure in `{test_dir}`
- Existing tests (for coverage gaps)

### Read TEA Config Flags

- From `{config_source}` read `tea_use_playwright_utils`
- From `{config_source}` read `tea_use_pactjs_utils`
- From `{config_source}` read `tea_pact_mcp`
- From `{config_source}` read `tea_browser_automation`
- From `{config_source}` read `test_stack_type`

---

### Tiered Knowledge Loading

Load fragments based on their `tier` classification in `tea-index.csv`:

1. **Core tier** (always load): Foundational fragments required for this workflow
2. **Extended tier** (load on-demand): Load when deeper analysis is needed or when the user's context requires it
3. **Specialized tier** (load only when relevant): Load only when the specific use case matches (e.g., contract-testing only for microservices, email-auth only for email flows)

> **Context Efficiency**: Loading only core fragments reduces context usage by 40-50% compared to loading all fragments.

### Playwright Utils Loading Profiles

**If `tea_use_playwright_utils` is enabled**, load `playwright-utils-mandate.md` FIRST, before any profile below. It is the binding rule for this run: playwright-utils is the default implementation for every capability it covers, and a vanilla Playwright equivalent is a deviation that must be justified in the output. Every worker step dispatched from this workflow inherits that rule.

Then select the appropriate loading profile:

- **API-only profile** (when `{detected_stack}` is `backend` or no `page.goto`/`page.locator` found in test files):
  Load: `playwright-utils-mandate`, `overview`, `api-request`, `auth-session`, `recurse` (~2,100 lines)

- **Full UI+API profile** (when `{detected_stack}` is `frontend`/`fullstack` or browser tests detected):
  Load: `playwright-utils-mandate` plus all Playwright Utils core fragments (~4,800 lines)

- **Mobile profile** (when `{detected_stack}` is `mobile`):
  Load: `mobile-test-strategy`, `maestro-flows`, `mobile-ci-device-lab`, `test-levels-framework`, `test-priorities-matrix`, `test-quality`, plus `playwright-utils-mandate`, `overview`, `api-request`, `auth-session`, `recurse` for the app's HTTP boundary.
  Do NOT load the browser fragments (`network-first`, `playwright-config`, `intercept-network-call`, `selector-resilience`): a device flow has no DOM and no request interceptor, and loading them invites browser patterns into a Maestro flow.
  The mandate is loaded here for the HTTP-boundary tests only. It has no bearing on a Maestro flow, and its own scope section says so.

**Detection**: Scan `{test_dir}` for files containing `page.goto` or `page.locator`. If none found, use API-only profile. A `maestro/` or `.maestro/` directory selects the mobile profile regardless of what `{test_dir}` holds.

### Pact.js Utils Loading

**If `tea_use_pactjs_utils` is enabled** (and `{detected_stack}` is `backend` or `fullstack`, or microservices indicators detected):

Load `pactjs-utils-mandate.md` FIRST. It is the binding rule for any Pact artifact this run produces, and it carries the relevance gate: the flag defaults to `true` and means "use these utilities when contract tests are written", never "add contract tests to this project".

Then load: `pactjs-utils-overview.md`, `pactjs-utils-consumer-helpers.md`, `pactjs-utils-provider-verifier.md`, `pactjs-utils-request-filter.md`, `pactjs-utils-zod-to-pact.md` (~1,100 lines)

**If `tea_use_pactjs_utils` is disabled** but contract testing is relevant (microservices architecture detected, existing Pact config found):

Load: `contract-testing.md` (~960 lines)

**Detection**: Scan `{project-root}` for Pact indicators: `pact/` directory, `@pact-foundation/pact` in `package.json`, `pactUrls` in test files, `PACT_BROKER` in env files.

### Pact MCP Loading

**If `tea_pact_mcp` is `"mcp"`:**

Load: `pact-mcp.md` (~150 lines) — enables agent to use SmartBear MCP tools for fetching provider states and generating pact tests during automation.

**`tea_pact_mcp` defaults to `"mcp"`, and Pact artifacts are gated on relevance, not on this flag.** Follow `pact-mcp.md` § _When the Tools Are Not Reachable_: the probe is a tool-list check and never a broker call, its result is recorded once per run as `pact_mcp_reachable`, and the fallback order is provider source, then an OpenAPI spec, then `confidence-gate.md`. Report the outcome once and continue; never block, never retry, never present inferred provider states as broker data.

## 4. Load Knowledge Base Fragments

Use `{knowledgeIndex}` and load only what is required.

**Core (always load):**

- `test-levels-framework.md`
- `test-priorities-matrix.md`
- `data-factories.md`
- `selective-testing.md`
- `ci-burn-in.md`
- `test-quality.md`

**Playwright Utils (if enabled):**

- `playwright-utils-mandate.md` (load first — it governs how the fragments below are applied)
- `overview.md`, `api-request.md`, `network-recorder.md`, `auth-session.md`, `intercept-network-call.md`, `recurse.md`, `log.md`, `file-utils.md`, `burn-in.md`, `network-error-monitor.md`, `fixtures-composition.md`
- `fixture-architecture.md` and `network-first.md` for their principles only. Under the mandate the mechanism comes from the playwright-utils fragments: interception is `interceptNetworkCall` declared before `page.goto`, and composition is `mergeTests`.

**Traditional Patterns (if Playwright Utils disabled):**

- `fixture-architecture.md`
- `network-first.md`

**Pact.js Utils (if enabled and contract testing is relevant):**

- `pactjs-utils-mandate.md` (load first — it governs how the fragments below are applied)
- `pactjs-utils-overview.md`, `pactjs-utils-consumer-helpers.md`, `pactjs-utils-provider-verifier.md`, `pactjs-utils-request-filter.md`, `pactjs-utils-zod-to-pact.md`

**Contract Testing (if pactjs-utils disabled but relevant):**

- `contract-testing.md`

**Pact MCP (if tea_pact_mcp is "mcp"):**

- `pact-mcp.md`

**Healing (if auto-heal enabled):**

- `test-healing-patterns.md`
- `selector-resilience.md`
- `timing-debugging.md`

**Playwright CLI (if tea_browser_automation is "cli" or "auto"):**

- `playwright-cli.md`

**MCP Patterns (if tea_browser_automation is "mcp" or "auto"):**

- (existing MCP-related fragments, if any are added in future)

---

## 5. Confirm Inputs

Summarize loaded artifacts, framework, and knowledge fragments, then proceed.

---

## 6. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-01-preflight-and-context']
  lastStep: 'step-01-preflight-and-context'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-01-preflight-and-context'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-01-preflight-and-context'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section.

**Update `inputDocuments`**: Set `inputDocuments` in the output template frontmatter to the list of artifact paths loaded in this step (e.g., knowledge fragments, test design documents, configuration files).

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
