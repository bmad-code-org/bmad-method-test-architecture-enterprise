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

### Deterministic Knowledge Selection

The fragment list for this step is a closed set. Start empty, evaluate the complete conditions under **Load Knowledge Base Fragments**, and add every fragment from each matching list. A config flag opens a branch only when every stack, runner, package, and relevance condition on that branch also matches. Do not add fragments from tier labels, index descriptions, nearby mentions, general usefulness, or possible future need. Deduplicate while preserving the order below. Identical facts and config must produce an identical list.

Contract testing is relevant only when repository facts show existing Pact artifacts, dependencies, configuration, or broker variables, or when the task explicitly requests contract testing. A service count or target-state architecture alone does not open a contract branch.

## 4. Load Knowledge Base Fragments

Use `{knowledgeIndex}` and load only what is required.

**Core (always load):**

- `test-levels-framework.md`
- `test-priorities-matrix.md`
- `data-factories.md`
- `selective-testing.md`
- `ci-burn-in.md`
- `test-quality.md`

**Mobile (if `{detected_stack}` is `mobile`):**

- `mobile-test-strategy.md`
- `maestro-flows.md`
- `mobile-ci-device-lab.md`

**Playwright Utils (if enabled, `@seontechnologies/playwright-utils` is in `package.json`, and the test files run on the Playwright runner):**

- `playwright-utils-mandate.md` (load first — it governs how the fragments below are applied)
- `overview.md`, `api-request.md`, `network-recorder.md`, `auth-session.md`, `intercept-network-call.md`, `recurse.md`, `log.md`, `file-utils.md`, `burn-in.md`, `network-error-monitor.md`, `fixtures-composition.md`
- `fixture-architecture.md` and `network-first.md` for their principles only. Under the mandate the mechanism comes from the playwright-utils fragments: interception is `interceptNetworkCall` declared before `page.goto`, and composition is `mergeTests`.

**Traditional Patterns (if the Playwright Utils applicability gate above did not open and the test files run on the Playwright runner):**

- `fixture-architecture.md`
- `network-first.md`

**Pact.js Utils (if enabled, `@seontechnologies/pactjs-utils` is in `package.json`, and contract testing is relevant):**

- `pactjs-utils-mandate.md` (load first — it governs how the fragments below are applied)
- `pactjs-utils-overview.md`, `pactjs-utils-consumer-helpers.md`, `pactjs-utils-provider-verifier.md`, `pactjs-utils-request-filter.md`, `pactjs-utils-zod-to-pact.md`

**Contract Testing (if Pact.js Utils is disabled or not installed, and contract testing is relevant):**

- `contract-testing.md`

**Pact MCP (if tea_pact_mcp is "mcp" and contract testing is relevant):**

- `pact-mcp.md`

**Healing (if auto-heal enabled):**

- `test-healing-patterns.md`
- `selector-resilience.md`
- `timing-debugging.md`

**Playwright CLI (if tea_browser_automation is "cli" or "auto" and the test files run on the Playwright runner):**

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
